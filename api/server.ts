import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // AUTHENTIFICATION : Inchangée pour la stabilité
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};

    // 1. HANDSHAKE
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-factory-bridge", version: "3.5.0" }
        }
      });
    }

    // 2. TOOL DEFINITIONS (Ajout de get_variables)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          tools: [
            { name: "get_figma_file", description: "Full file map (small files only).", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey"] } },
            { name: "get_file_structure", description: "LIGHTWEIGHT Treemap (Name/ID/Type). Use depth=1 or 2.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeId: { type: "string" }, depth: { type: "number" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeId"] } },
            { name: "get_variables", description: "Extract local variables (Design Tokens) from Figma.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey"] } },
            { name: "get_semantic_node", description: "Detailed audit: CSS, Layout, Dimensions.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } },
            { name: "get_node_checksum", description: "Structural fingerprint.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } }
          ]
        }
      });
    }

    // 3. TOOL EXECUTION
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      const token = args.isDisko ? process.env.FIGMA_TOKEN_DISKO : process.env.FIGMA_TOKEN_STRAXY;
      const headers = { 'X-Figma-Token': token!, 'Content-Type': 'application/json' };
      
      let payload: any = null;

      // TOOL: Get Variables (La nouvelle sonde à Design Tokens)
      if (name === "get_variables") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/variables/local`, { headers });
        payload = await response.json();
      }

      // TOOL: Get File Structure (Discovery légère)
      else if (name === "get_file_structure") {
        const depth = args.depth || 1;
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/nodes?ids=${args.nodeId}&depth=${depth}`, { headers });
        const data: any = await response.json();
        const node = data.nodes[Object.keys(data.nodes)[0]].document;
        
        const mapChildren = (n: any): any => ({
          id: n.id, name: n.name, type: n.type,
          children: n.children?.map((c: any) => mapChildren(c)) || []
        });
        payload = { tree: mapChildren(node) };
      }

      else if (name === "get_figma_file") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}?depth=1`, { headers });
        payload = await response.json();
      } 
      else if (name === "get_semantic_node" || name === "get_node_checksum") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/nodes?ids=${args.nodeIds}`, { headers });
        const data: any = await response.json();
        
        if (!data.nodes) throw new Error("Figma API Error: Node not found.");
        const nodeKey = Object.keys(data.nodes)[0];
        const node = data.nodes[nodeKey].document;

        if (name === "get_semantic_node") {
          payload = {
            name: node.name, type: node.type,
            dimensions: node.absoluteBoundingBox, // Pour Law #11 (1312px)
            layout: { mode: node.layoutMode, gap: node.itemSpacing, padding: `${node.paddingTop}px` },
            children: node.children?.map((c: any) => ({ name: c.name, id: c.id, type: c.type }))
          };
        } else {
          payload = { 
            structural_id: node.children?.map((c: any) => `${c.name}:${c.visible}`).join('|') || "leaf",
            variant_mapping: node.children?.map((c: any) => ({ name: c.name, id: c.id }))
          };
        }
      }

      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }
      });
    }

    return res.status(200).json({ jsonrpc: "2.0", id: body.id, result: {} });

  } catch (err: any) {
    return res.status(500).json({ jsonrpc: "2.0", id: req.body?.id || null, error: { code: -32603, message: err.message } });
  }
}
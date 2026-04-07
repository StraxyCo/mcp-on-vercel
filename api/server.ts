import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. AUTHENTIFICATION
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};

    // 2. HANDSHAKE
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "straxy-factory-bridge", version: "3.7.0" }
        }
      });
    }

    // 3. TOOL DEFINITIONS
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          tools: [
            { name: "get_figma_file", description: "Full file map.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey"] } },
            { name: "get_file_structure", description: "LIGHTWEIGHT Treemap (Name/ID/Type).", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeId: { type: "string" }, depth: { type: "number" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeId"] } },
            { name: "get_library_assets", description: "Extract published Styles or Components (Oversize protected).", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, assetType: { type: "string", enum: ["styles", "components", "component_sets"] }, filter: { type: "string", description: "For styles: TEXT, FILL, EFFECT" }, isDisko: { type: "boolean" } }, required: ["fileKey", "assetType"] } },
            { name: "get_semantic_node", description: "Detailed audit: CSS, Layout, Styles, and Bound Variables.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } },
            { name: "get_node_checksum", description: "Structural fingerprint.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } }
          ]
        }
      });
    }

    // 4. TOOL EXECUTION
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      const token = args.isDisko ? process.env.FIGMA_TOKEN_DISKO : process.env.FIGMA_TOKEN_STRAXY;
      const headers = { 'X-Figma-Token': token!, 'Content-Type': 'application/json' };
      
      let payload: any = null;

      // TOOL: Get Library Assets (Pagination à 40 items)
      if (name === "get_library_assets") {
        const endpoint = args.assetType;
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/${endpoint}`, { headers });
        const data: any = await response.json();
        let assets = data.meta?.[endpoint] || [];
        
        if (args.filter && endpoint === 'styles') {
          assets = assets.filter((s: any) => s.style_type === args.filter);
        }

        payload = {
          total_found: assets.length,
          type: endpoint,
          items: assets.slice(0, 40).map((a: any) => ({
            key: a.key, name: a.name, id: a.node_id,
            description: a.description || "",
            ...(a.style_type && { style_type: a.style_type })
          }))
        };
      }

      // TOOL: Get File Structure
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

// TOOL: Get Semantic Node (ENHANCED for D2C & Native Properties)
      else if (name === "get_semantic_node") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/nodes?ids=${args.nodeIds}&plugin_data=1623306734532692671`, { headers });
        const data: any = await response.json();
        if (!data || !data.nodes) throw new Error("Node not found.");
        
        const nodeData = data.nodes[Object.keys(data.nodes)[0]];
        const node = nodeData.document;

        payload = {
          name: node.name, 
          type: node.type,
          id: node.id,
          dimensions: node.absoluteBoundingBox,
          layout: { 
            mode: node.layoutMode, 
            gap: node.itemSpacing, 
            padding: `${node.paddingTop}px` 
          },
          // NATIVE ARCHITECTURE (For Injection Zones / Instance Swaps) 
          componentPropertyDefinitions: node.componentPropertyDefinitions || {},
          componentProperties: node.componentProperties || {},
          componentPropertyReferences: node.componentPropertyReferences || {},
          
          // D2C INTENTS (For the Annotator Plugin) 
          sharedPluginData: node.sharedPluginData || {},
          
          styles: node.styles || {},
          boundVariables: node.boundVariables || {},
          children: node.children?.map((c: any) => ({ 
            name: c.name, 
            id: c.id, 
            type: c.type 
          }))
        };
      }

      // TOOL: Get Node Checksum
      else if (name === "get_node_checksum") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/nodes?ids=${args.nodeIds}`, { headers });
        const data: any = await response.json();
        const node = data.nodes[Object.keys(data.nodes)[0]].document;
        payload = { 
          structural_id: node.children?.map((c: any) => `${c.name}:${c.visible}`).join('|') || "leaf",
          variant_mapping: node.children?.map((c: any) => ({ name: c.name, id: c.id }))
        };
      }

      // TOOL: Get Figma File
      else if (name === "get_figma_file") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}?depth=1`, { headers });
        payload = await response.json();
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
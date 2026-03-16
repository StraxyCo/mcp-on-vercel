import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Auth Check (Bridge Password)
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized Bridge Access" });
    }

    const body = req.body || {};
    const requestId = body.id || null; // Always return the request ID

    // 2. HANDSHAKE (Initialize)
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: requestId,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-factory-bridge", version: "3.2.0" }
        }
      });
    }

    // 3. TOOL DEFINITIONS (Stable Schema)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: requestId,
        result: {
          tools: [
            { 
              name: "get_figma_file", 
              description: "Map the file structure. Use isDisko: true for DISKO workspace.", 
              inputSchema: { type: "object", properties: { fileKey: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey"] } 
            },
            { 
              name: "get_semantic_node", 
              description: "Extracts Computed CSS, Variables, and Nomenclature signals.", 
              inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } 
            },
            { 
              name: "get_node_checksum", 
              description: "Generates a structural fingerprint for memory logic.", 
              inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } 
            }
          ]
        }
      });
    }

    // 4. TOOL EXECUTION (Stable Switch Logic)
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      
      // Token Selection (STRAXY vs DISKO)
      const token = args.isDisko ? process.env.FIGMA_TOKEN_DISKO : process.env.FIGMA_TOKEN_STRAXY;
      const headers = { 'X-Figma-Token': token!, 'Content-Type': 'application/json' };
      const baseUrl = "https://api.figma.com/v1";

      let responseData: any = null;

      if (name === "get_figma_file") {
        const response = await fetch(`${baseUrl}/files/${args.fileKey}`, { headers });
        responseData = await response.json();
      } 
      else if (name === "get_semantic_node" || name === "get_node_checksum") {
        const response = await fetch(`${baseUrl}/files/${args.fileKey}/nodes?ids=${args.nodeIds}`, { headers });
        const data: any = await response.json();
        
        if (!data.nodes || !data.nodes[args.nodeIds]) {
          throw new Error(`Node ${args.nodeIds} not found. Check your token/fileKey.`);
        }
        
        const node = data.nodes[args.nodeIds].document;

        if (name === "get_semantic_node") {
          responseData = {
            name: node.name,
            layout: { mode: node.layoutMode, gap: node.itemSpacing, padding: `${node.paddingTop}px` },
            nomenclature: node.name.includes('[Slot]') ? 'DYNAMIC_SLOT' : (node.name.includes('/') ? 'STRUCTURED' : 'GENERIC')
          };
        } else {
          const fingerprint = node.children?.map((c: any) => `${c.name}:${c.visible}`).join('|') || "leaf";
          responseData = `STRUCTURAL_ID:${fingerprint}`;
        }
      }

      return res.status(200).json({
        jsonrpc: "2.0", id: requestId,
        result: { content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }] }
      });
    }

    // Fallback
    return res.status(200).json({ jsonrpc: "2.0", id: requestId, result: {} });

  } catch (error: any) {
    return res.status(500).json({ 
      jsonrpc: "2.0", 
      id: req.body?.id || null, 
      error: { code: -32603, message: error.message } 
    });
  }
}

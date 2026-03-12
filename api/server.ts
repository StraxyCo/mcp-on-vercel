export default async function handler(req: any, res: any) {
  try {
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

    // 1. HANDSHAKE
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-ultimate-bridge", version: "2.1.0" }
        }
      });
    }

    // 2. TOOL DEFINITIONS (Updated with Variables)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          tools: [
            { name: "get_figma_file", description: "Map the file structure (Pages/Frames).", inputSchema: { type: "object", properties: { fileKey: { type: "string" } }, required: ["fileKey"] } },
            { name: "get_figma_nodes", description: "Inspect CSS/details of specific nodes.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" } }, required: ["fileKey", "nodeIds"] } },
            { name: "get_node_images", description: "Generate PNG preview URLs for nodes.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" } }, required: ["fileKey", "nodeIds"] } },
            { name: "get_file_styles", description: "List all shared styles (Colors/Fonts).", inputSchema: { type: "object", properties: { fileKey: { type: "string" } }, required: ["fileKey"] } },
            { name: "get_figma_variables", description: "Read all local variables, collections, and modes (Tokens).", inputSchema: { type: "object", properties: { fileKey: { type: "string" } }, required: ["fileKey"] } },
            { name: "get_figma_comments", description: "Read all comments/feedback in the file.", inputSchema: { type: "object", properties: { fileKey: { type: "string" } }, required: ["fileKey"] } },
            { name: "get_file_versions", description: "See version history/recent changes.", inputSchema: { type: "object", properties: { fileKey: { type: "string" } }, required: ["fileKey"] } },
            { name: "post_figma_comment", description: "Post a new comment to a node.", inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeId: { type: "string" }, message: { type: "string" } }, required: ["fileKey", "nodeId", "message"] } }
          ]
        }
      });
    }

    // 3. TOOL EXECUTION
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      let url = "";
      let method = "GET";
      let payload: any = null;

      switch (name) {
        case "get_figma_file": url = `https://api.figma.com/v1/files/${args.fileKey}?depth=2`; break;
        case "get_figma_nodes": url = `https://api.figma.com/v1/files/${args.fileKey}/nodes?ids=${args.nodeIds}`; break;
        case "get_node_images": url = `https://api.figma.com/v1/images/${args.fileKey}?ids=${args.nodeIds}&format=png`; break;
        case "get_file_styles": url = `https://api.figma.com/v1/files/${args.fileKey}/styles`; break;
        case "get_figma_variables": url = `https://api.figma.com/v1/files/${args.fileKey}/variables/local`; break;
        case "get_figma_comments": url = `https://api.figma.com/v1/files/${args.fileKey}/comments`; break;
        case "get_file_versions": url = `https://api.figma.com/v1/files/${args.fileKey}/versions`; break;
        case "post_figma_comment": 
          url = `https://api.figma.com/v1/files/${args.fileKey}/comments`; 
          method = "POST";
          payload = { client_meta: { node_id: args.nodeId }, message: args.message };
          break;
      }

      const response = await fetch(url, {
        method,
        headers: { 'X-Figma-Token': token!, 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : null
      });
      const data = await response.json();

      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
      });
    }

    return res.status(200).json({ jsonrpc: "2.0", id: body.id, result: {} });
  } catch (err: any) {
    return res.status(500).json({ error: "Bridge Error", message: err.message });
  }
}

export default async function handler(req: any, res: any) {
  try {
    // 1. SECURITY LOCK
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};

    // 2. STEP ONE: THE INITIALIZE HANDSHAKE (This is what's failing)
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {} 
          },
          serverInfo: {
            name: "figma-bridge",
            version: "1.0.0"
          }
        }
      });
    }

    // 3. STEP TWO: LIST TOOLS
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "get_figma_file",
              description: "Gets the structure of a Figma file.",
              inputSchema: {
                type: "object",
                properties: {
                  fileKey: { type: "string" }
                },
                required: ["fileKey"]
              }
            }
          ]
        }
      });
    }

    // 4. STEP THREE: TOOL CALLS
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      if (name === 'get_figma_file') {
        const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}`, {
          headers: { 'X-Figma-Token': token! }
        });
        const data: any = await response.json();
        return res.status(200).json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ name: data.name }, null, 2) }]
          }
        });
      }
    }

    // Default response for other MCP notifications
    return res.status(200).json({ jsonrpc: "2.0", id: body.id, result: {} });

  } catch (err: any) {
    return res.status(500).json({ error: "Server Error", message: err.message });
  }
}

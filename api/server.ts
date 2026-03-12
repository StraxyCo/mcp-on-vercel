export default async function handler(req: any, res: any) {
  try {
    // 1. SECURITY LOCK
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};

    // 2. HANDLE "LIST TOOLS" (The Handshake)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          // This protocolVersion is often what "invalid_union" is looking for
          protocolVersion: "2024-11-05", 
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

    // 3. HANDLE TOOL CALLS
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
            content: [{ 
              type: "text", 
              text: JSON.stringify({ name: data.name, status: "Success" }, null, 2) 
            }]
          }
        });
      }
    }

    // 4. BROWSER FALLBACK
    return res.status(200).json({ message: "Bridge active." });

  } catch (err: any) {
    return res.status(500).json({ error: "Server Error", message: err.message });
  }
}

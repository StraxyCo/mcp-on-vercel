export default async function handler(req: any, res: any) {
  try {
    // 1. SECURITY LOCK (Only let Dust in)
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      // If you visit in a browser, you see this. It's a GOOD sign!
      return res.status(401).json({ error: "Unauthorized: Invalid x-bridge-auth header" });
    }

    // 2. HANDLE "LIST TOOLS" (What Dust does when you click Save)
    // We check if the body exists first to prevent the 500 crash
    if (req.method === 'POST' && req.body?.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: req.body.id || 1,
        result: {
          tools: [
            {
              name: "get_figma_file",
              description: "Gets the structure (Pages and Frames) of a Figma file.",
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
    if (req.method === 'POST' && req.body?.method === 'tools/call') {
      const { name, arguments: args } = req.body.params || {};
      
      if (name === 'get_figma_file') {
        const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}`, {
          headers: { 'X-Figma-Token': token! }
        });
        const data: any = await response.json();
        
        // Return a clean version of the data
        return res.status(200).json({
          jsonrpc: "2.0",
          id: req.body.id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ name: data.name, pages: data.document?.children?.length }, null, 2) }]
          }
        });
      }
    }

    // 4. FALLBACK (If you visit in browser with the right password but no POST data)
    return res.status(200).json({ status: "Bridge is alive and waiting for Dust." });

  } catch (err: any) {
    return res.status(500).json({ error: "Server Crash", message: err.message });
  }
}

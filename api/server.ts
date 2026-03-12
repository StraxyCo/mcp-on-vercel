import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "Figma-Secure-Bridge",
  version: "1.0.0"
});

// --- FIGMA TOOL: GET FILE ---
server.tool(
  "get_figma_file",
  { fileKey: z.string() },
  async ({ fileKey }) => {
    const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: { 'X-Figma-Token': token! }
    });
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- THE VERCEL HANDLER ---
export default async function handler(req: any, res: any) {
  // 1. SECURITY LOCK
  const bridgeAuth = req.headers['x-bridge-auth'];
  if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. HANDLE "LIST TOOLS" (What Dust does when you click Save)
  if (req.method === 'POST' && req.body.method === 'tools/list') {
    const tools = await server.listTools();
    return res.json({ jsonrpc: "2.0", id: req.body.id, result: { tools } });
  }

  // 3. HANDLE TOOL CALLS
  if (req.method === 'POST' && req.body.method === 'tools/call') {
    const result = await server.callTool(req.body.params.name, req.body.params.arguments);
    return res.json({ jsonrpc: "2.0", id: req.body.id, result });
  }

  return res.status(404).json({ error: "Not Found" });
}

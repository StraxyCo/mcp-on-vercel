import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler((server) => {
  // --- FIGMA TOOL: GET FILE STRUCTURE ---
  server.tool(
    "get_figma_file",
    "Gets the structure of a Figma file (Pages and Frames)",
    { 
      fileKey: z.string().describe("The alphanumeric ID of the Figma file") 
    },
    async ({ fileKey }) => {
      const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
      if (!token) {
        return { content: [{ type: "text", text: "Error: FIGMA_PERSONAL_ACCESS_TOKEN not set on server." }] };
      }

      const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
        headers: { 'X-Figma-Token': token }
      });

      if (!response.ok) {
        return { content: [{ type: "text", text: `Figma API Error: ${response.statusText}` }] };
      }

      const data = await response.json();

      // Pruning data to keep it small for the AI context window
      const simplified = {
        name: data.name,
        lastModified: data.lastModified,
        pages: data.document.children.map((p: any) => ({
          name: p.name,
          id: p.id,
          frames: p.children
            ?.filter((c: any) => c.type === "FRAME")
            .map((f: any) => ({ name: f.name, id: f.id }))
        }))
      };

      return {
        content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
      };
    },
  );

  // --- FIGMA TOOL: GET SPECIFIC NODES ---
  server.tool(
    "get_figma_nodes",
    "Gets detailed JSON for specific layers/nodes in a Figma file",
    { 
      fileKey: z.string(),
      nodeIds: z.string().describe("Comma-separated list of node IDs")
    },
    async ({ fileKey, nodeIds }) => {
      const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
      const response = await fetch(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeIds}`, {
        headers: { 'X-Figma-Token': token! }
      });
      const data = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );
});

// --- UPDATED EXPORTS WITH SECURITY LOCK ---
const secureHandler = async (req: Request) => {
  const bridgeAuth = req.headers.get('x-bridge-auth');
  const secret = process.env.BRIDGE_PASSWORD;

  // If a password is set in Vercel, we block anyone who doesn't provide it
  if (secret && bridgeAuth !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid x-bridge-auth header" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // If authorized, proceed to the standard MCP handler
  return handler(req);
};

export { secureHandler as GET, secureHandler as POST };

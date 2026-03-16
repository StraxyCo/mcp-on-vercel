import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Auth Check (Bridge Password)
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized Bridge Access" });
    }

    const body = req.body || {};
    const requestId = body.id || null; // Ensure we always have an ID for JSON-RPC

    // 2. Initialize MCP (Handshake)
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: requestId,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-factory-bridge", version: "3.1.0" }
        }
      });
    }

    // 3. Define Tools (The Factory Set)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: requestId,
        result: {
          tools: [
            {
              name: "get_semantic_node",
              description: "Extracts Computed CSS, Variables, and Nomenclature signals.",
              inputSchema: { 
                type: "object", 
                properties: { 
                  fileKey: { type: "string" }, 
                  nodeIds: { type: "string" },
                  isDisko: { type: "boolean" }
                }, 
                required: ["fileKey", "nodeIds"] 
              }
            },
            {
              name: "get_node_checksum",
              description: "Generates a structural fingerprint for memory logic.",
              inputSchema: { 
                type: "object", 
                properties: { 
                  fileKey: { type: "string" }, 
                  nodeIds: { type: "string" },
                  isDisko: { type: "boolean" }
                }, 
                required: ["fileKey", "nodeIds"] 
              }
            },
            {
              name: "get_figma_file",
              description: "Maps the file structure (pages, frames).",
              inputSchema: { 
                type: "object", 
                properties: { 
                  fileKey: { type: "string" },
                  isDisko: { type: "boolean" }
                }, 
                required: ["fileKey"] 
              }
            }
          ]
        }
      });
    }

    // 4. Tool Execution (Switch logic from your stable version)
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      const figmaToken = args.isDisko ? process.env.FIGMA_TOKEN_DISKO : process.env.FIGMA_TOKEN_STRAXY;
      const headers = { 'X-Figma-Token': figmaToken! };
      const baseUrl = "https://api.figma.com/v1";

      let resultText = "";

      switch (name) {
        case "get_semantic_node":
        case "get_node_checksum": {
          const response = await fetch(`${baseUrl}/files/${args.fileKey}/nodes?ids=${args.nodeIds}`, { headers });
          const data: any = await response.json();
          const node = data.nodes[args.nodeIds].document;

          if (name === "get_semantic_node") {
            const semantic = {
              name: node.name,
              layout: { mode: node.layoutMode, gap: node.itemSpacing, padding: `${node.paddingTop}px` },
              nomenclature: node.name.includes('[Slot]') ? 'DYNAMIC_SLOT' : (node.name.includes('/') ? 'STRUCTURED' : 'GENERIC')
            };
            resultText = JSON.stringify(semantic, null, 2);
          } else {
            const fingerprint = node.children?.map((c: any) => `${c.name}:${c.visible}`).join('|') || "leaf";
            resultText = `STRUCTURAL_ID:${fingerprint}`;
          }
          break;
        }

        case "get_figma_file": {
          const response = await fetch(`${baseUrl}/files/${args.fileKey}`, { headers });
          const data = await response.json();
          resultText = JSON.stringify(data, null, 2);
          break;
        }

        default:
          return res.status(400).json({ jsonrpc: "2.0", id: requestId, error: { message: `Tool ${name} not found` } });
      }

      return res.status(200).json({
        jsonrpc: "2.0", id: requestId,
        result: { content: [{ type: "text", text: resultText }] }
      });
    }

    // Crucial: Fallback for unhandled methods to prevent 404 errors
    return res.status(200).json({ jsonrpc: "2.0", id: requestId, result: {} });

  } catch (error: any) {
    return res.status(500).json({ jsonrpc: "2.0", id: req.body?.id || null, error: { message: error.message } });
  }
}

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Auth Check (Bridge Password)
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized Bridge Access" });
    }

    const body = req.body || {};

    // 2. Initialize MCP
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-factory-bridge", version: "3.0.0" }
        }
      });
    }

    // 3. Define Tools (The Factory Set)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          tools: [
            {
              name: "get_semantic_node",
              description: "Extracts Computed CSS, Variables, and Nomenclature signals ([Slot], Container/ names).",
              inputSchema: { 
                type: "object", 
                properties: { 
                  fileKey: { type: "string" }, 
                  nodeIds: { type: "string" },
                  isDisko: { type: "boolean", description: "Set to true if using Agency (DISKO) workspace." }
                }, 
                required: ["fileKey", "nodeIds"] 
              }
            },
            {
              name: "get_node_checksum",
              description: "Generates a structural fingerprint of a node's children and visibility for memory logic.",
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

    // 4. Tool Execution & Dual-Token Logic (STRAXY vs DISKO)
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      
      // Token Selection Logic
      // Defaults to STRAXY unless isDisko is explicitly true
      const figmaToken = args.isDisko ? process.env.FIGMA_TOKEN_DISKO : process.env.FIGMA_TOKEN_STRAXY;

      const baseUrl = `https://api.figma.com/v1/files/${args.fileKey}`;
      const headers = { 'X-Figma-Token': figmaToken! };

      if (name === "get_semantic_node" || name === "get_node_checksum") {
        const response = await fetch(`${baseUrl}/nodes?ids=${args.nodeIds}`, { headers });
        const data: any = await response.json();
        
        if (!data.nodes || !data.nodes[args.nodeIds]) {
          throw new Error(`Node ${args.nodeIds} not found. Ensure you are using the correct token (STRAXY vs DISKO).`);
        }
        
        const node = data.nodes[args.nodeIds].document;

        if (name === "get_semantic_node") {
          const semantic = {
            name: node.name,
            type: node.type,
            layout: { 
              mode: node.layoutMode, 
              padding: `${node.paddingTop}px ${node.paddingRight}px ${node.paddingBottom}px ${node.paddingLeft}px`, 
              gap: node.itemSpacing 
            },
            logic: { visible: node.visible, boundVariables: node.boundVariables },
            nomenclature: node.name.includes('[Slot]') ? 'DYNAMIC_SLOT' : (node.name.includes('/') ? 'STRUCTURED' : 'GENERIC')
          };
          return res.status(200).json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(semantic, null, 2) }] } });
        }

        if (name === "get_node_checksum") {
          const fingerprint = node.children?.map((c: any) => `${c.name}:${c.visible}`).join('|') || "leaf";
          return res.status(200).json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: `STRUCTURAL_ID:${fingerprint}` }] } });
        }
      }

      if (name === "get_figma_file") {
        const response = await fetch(baseUrl, { headers });
        const data = await response.json();
        return res.status(200).json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
      }
    }

    return res.status(404).json({ error: "Method not found" });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const bridgeAuth = req.headers['x-bridge-auth'];
    if (bridgeAuth !== process.env.BRIDGE_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};

    // 1. HANDSHAKE (Stable Structure)
    if (body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-factory-bridge", version: "3.3.0" }
        }
      });
    }

    // 2. TOOL DEFINITIONS (Reverted to Stable Schema Format)
    if (body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: {
          tools: [
            { 
              name: "get_figma_file", 
              description: "Map the file structure. Use isDisko: true for Agency.", 
              inputSchema: { type: "object", properties: { fileKey: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey"] } 
            },
            { 
              name: "get_semantic_node", 
              description: "Extracts Computed CSS and Nomenclature signals.", 
              inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } 
            },
            { 
              name: "get_node_checksum", 
              description: "Generates structural fingerprint for memory.", 
              inputSchema: { type: "object", properties: { fileKey: { type: "string" }, nodeIds: { type: "string" }, isDisko: { type: "boolean" } }, required: ["fileKey", "nodeIds"] } 
            }
          ]
        }
      });
    }

// 3. TOOL EXECUTION (Updated with ID exposure)
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params || {};
      const token = args.isDisko ? process.env.FIGMA_TOKEN_DISKO : process.env.FIGMA_TOKEN_STRAXY;
      const headers = { 'X-Figma-Token': token!, 'Content-Type': 'application/json' };
      
      let payload: any = null;

      if (name === "get_figma_file") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}?depth=1`, { headers }); // Ajout depth=1 pour alléger
        payload = await response.json();
      } 
      else if (name === "get_semantic_node" || name === "get_node_checksum") {
        const response = await fetch(`https://api.figma.com/v1/files/${args.fileKey}/nodes?ids=${args.nodeIds}`, { headers });
        const data: any = await response.json();
        
        // Gestion sécurisée de l'ID (Figma peut renvoyer l'ID avec : ou - selon le contexte)
        const nodeKey = Object.keys(data.nodes)[0];
        const node = data.nodes[nodeKey].document;

        if (name === "get_semantic_node") {
          payload = {
            name: node.name,
            type: node.type, // Crucial pour détecter COMPONENT_SET
            layout: { 
              mode: node.layoutMode, 
              gap: node.itemSpacing, 
              padding: `${node.paddingTop}px`,
              width: node.absoluteBoundingBox?.width
            },
            nomenclature: node.name.includes('[Slot]') ? 'DYNAMIC_SLOT' : (node.name.includes('/') ? 'STRUCTURED' : 'GENERIC'),
            // EXPOSITION DES ENFANTS : L'agent voit maintenant l'ID pour descendre
            children: node.children?.map((c: any) => ({ 
              name: c.name, 
              id: c.id, 
              type: c.type 
            })) || []
          };
        } else {
          payload = { 
            structural_id: node.children?.map((c: any) => `${c.name}:${c.visible}`).join('|') || "leaf",
            // Mapping direct pour le Variant-Descent Protocol
            variant_mapping: node.children?.map((c: any) => ({ 
              name: c.name, 
              id: c.id 
            })) || []
          };
        }
      }

      return res.status(200).json({
        jsonrpc: "2.0", id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }
      });
    }
}

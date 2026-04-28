import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { listTools, callTool } from './tools/registry.js';
import { registerAllTools } from './tools/index.js';

let registered = false;

export function buildServer(): Server {
  if (!registered) {
    registerAllTools();
    registered = true;
  }
  const server = new Server(
    { name: 'mcp-gestor-lfpro', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await callTool(name, args ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        isError: true,
        content: [
          { type: 'text', text: JSON.stringify({ ok: false, error: msg }) },
        ],
      };
    }
  });

  return server;
}

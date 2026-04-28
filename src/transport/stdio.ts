import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../server.js';

export async function startStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Reservado: nada de console.log no stdout — esse stream e o protocolo MCP.
  console.error('[mcp-gestor-lfpro] stdio transport ready');
}

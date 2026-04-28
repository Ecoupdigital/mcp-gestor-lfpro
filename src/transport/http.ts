import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from '../server.js';

export interface HttpOptions {
  bind: string;
  port: number;
}

export async function startHttp(opts: HttpOptions): Promise<void> {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'mcp-gestor-lfpro' }));
      return;
    }
    if (req.url?.startsWith('/mcp')) {
      try {
        await transport.handleRequest(req, res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: msg }));
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });
  http.listen(opts.port, opts.bind, () => {
    // stderr, stdout reservado para protocolo (tho HTTP-only fica ok stdout)
    console.error(
      `[mcp-gestor-lfpro] HTTP listening on http://${opts.bind}:${opts.port}/mcp`,
    );
  });
}

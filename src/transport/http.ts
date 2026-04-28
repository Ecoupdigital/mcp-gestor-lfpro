import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from '../server.js';

export interface HttpOptions {
  bind: string;
  port: number;
}

/**
 * Inicia HTTP transport do MCP server.
 *
 * Modo MULTI-SESSION com map de transports por session id:
 *   - POST initialize sem session-id => cria novo transport, retorna mcp-session-id header
 *   - POST <method> com Mcp-Session-Id header existente => reusa transport
 *   - POST <method> sem session-id (stateless calls) => 400 ou cria novo
 *
 * Auth middleware: se `MCP_AUTH_TOKEN` estiver setado, /mcp exige header
 * `X-MCP-Auth: <token>`. /health continua publico (probes Coolify/Docker).
 *
 * Decisao Fase 30-05: cada request da edge function abre nova sessao
 * (initialize + notify + tools/list + tools/call) e descarta. Em workloads
 * concorrentes nao ha sharing de session.
 */
export async function startHttp(opts: HttpOptions): Promise<void> {
  const authToken = process.env.MCP_AUTH_TOKEN ?? '';

  // session-id -> transport. Limpamos no onclose.
  const transports = new Map<string, StreamableHTTPServerTransport>();

  async function newTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    // Cleanup on close
    const prevOnClose = transport.onclose;
    transport.onclose = () => {
      if (transport.sessionId && transports.has(transport.sessionId)) {
        transports.delete(transport.sessionId);
      }
      prevOnClose?.();
    };
    const server = buildServer();
    await server.connect(transport);
    return transport;
  }

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'mcp-gestor-lfpro',
          active_sessions: transports.size,
        }),
      );
      return;
    }
    if (req.url?.startsWith('/mcp')) {
      // Auth check apenas em /mcp (health publico para probes).
      if (authToken) {
        const provided = req.headers['x-mcp-auth'];
        const value = Array.isArray(provided) ? provided[0] : provided;
        if (value !== authToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }));
          return;
        }
      }
      try {
        const sidHeader = req.headers['mcp-session-id'] ?? req.headers['Mcp-Session-Id'];
        const sid = Array.isArray(sidHeader) ? sidHeader[0] : sidHeader;
        let transport: StreamableHTTPServerTransport;
        if (sid && transports.has(sid)) {
          transport = transports.get(sid)!;
        } else {
          // Nova sessao (initialize) — cria transport novo. Apos handleRequest
          // ele tera sessionId atribuido pelo SDK; registramos no map.
          transport = await newTransport();
        }
        await transport.handleRequest(req, res);
        // Apos primeira request (initialize), session id e atribuido — registra
        if (transport.sessionId && !transports.has(transport.sessionId)) {
          transports.set(transport.sessionId, transport);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });
  http.listen(opts.port, opts.bind, () => {
    console.error(
      `[mcp-gestor-lfpro] HTTP listening on http://${opts.bind}:${opts.port}/mcp` +
        (authToken ? ' (auth: enabled)' : ' (auth: DISABLED — dev mode)'),
    );
  });
}

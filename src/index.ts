import 'dotenv/config';
import { startStdio } from './transport/stdio.js';
import { startHttp } from './transport/http.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const httpFlag = args.indexOf('--http');
  if (httpFlag >= 0) {
    const arg = args[httpFlag + 1] ?? ':3030';
    // Defaults: bind via MCP_HTTP_BIND env (Docker injeta 0.0.0.0), port 3030.
    // Parse `--http <bind>:<port>` ou `--http :<port>` (bind pega env).
    let bind = process.env.MCP_HTTP_BIND || '127.0.0.1';
    let portStr = process.env.MCP_HTTP_PORT || '3030';
    if (arg.startsWith(':')) {
      portStr = arg.slice(1);
    } else if (arg.includes(':')) {
      const parts = arg.split(':');
      bind = parts[0] || bind;
      portStr = parts[1] || portStr;
    }
    const port = parseInt(portStr, 10);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`invalid port: ${portStr}`);
    }
    await startHttp({ bind, port });
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error('[mcp-gestor-lfpro] fatal:', err);
  process.exit(1);
});

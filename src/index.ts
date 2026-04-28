import 'dotenv/config';
import { startStdio } from './transport/stdio.js';
import { startHttp } from './transport/http.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const httpFlag = args.indexOf('--http');
  if (httpFlag >= 0) {
    const arg = args[httpFlag + 1] ?? ':3030';
    let bind = '127.0.0.1';
    let portStr = '3030';
    if (arg.startsWith(':')) {
      portStr = arg.slice(1);
    } else if (arg.includes(':')) {
      const parts = arg.split(':');
      bind = parts[0] ?? bind;
      portStr = parts[1] ?? portStr;
    }
    const port = parseInt(portStr, 10);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`invalid port: ${portStr}`);
    }
    bind = bind || process.env.MCP_HTTP_BIND || '127.0.0.1';
    await startHttp({ bind, port });
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error('[mcp-gestor-lfpro] fatal:', err);
  process.exit(1);
});

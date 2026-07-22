/**
 * Точка входа для Node — локальная разработка и деплой на обычную VPS.
 * Тот же обработчик, что и в Worker; отличается только адаптер БД и мост node:http.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createApp } from './app.ts';
import { nodeDb } from './adapters/node.ts';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const { db } = nodeDb();
const app = createApp({
  db,
  botToken: process.env.BOT_TOKEN,
  devAuth: process.env.DEV_AUTH === '1' || !process.env.BOT_TOKEN,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  rateLimit: 120,
});

// В проде мини-апп может раздаваться этим же процессом
const webDist = resolve(process.cwd(), '../web/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(pathname: string): { body: Buffer; type: string } | null {
  if (!existsSync(webDist)) return null;
  const rel = normalize(pathname).replace(/^([/\\])+/, '');
  // защита от выхода за пределы каталога
  if (rel.includes('..')) return null;
  let file = join(webDist, rel);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(webDist, 'index.html');
  if (!existsSync(file)) return null;
  return { body: readFileSync(file), type: MIME[extname(file)] ?? 'application/octet-stream' };
}

createServer(async (nodeReq, nodeRes) => {
  const url = `http://${nodeReq.headers.host ?? 'localhost'}${nodeReq.url ?? '/'}`;

  const chunks: Buffer[] = [];
  for await (const c of nodeReq) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const req = new Request(url, {
    method: nodeReq.method,
    headers: nodeReq.headers as HeadersInit,
    body: nodeReq.method === 'GET' || nodeReq.method === 'HEAD' ? undefined : body,
  });

  const pathname = new URL(url).pathname;
  if (!pathname.startsWith('/api/') && pathname !== '/health') {
    const file = serveStatic(pathname);
    if (file) {
      nodeRes.writeHead(200, { 'content-type': file.type });
      nodeRes.end(file.body);
      return;
    }
  }

  const res = await app.fetch(req);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  nodeRes.writeHead(res.status, headers);
  nodeRes.end(Buffer.from(await res.arrayBuffer()));
}).listen(PORT, HOST, () => {
  console.log(
    `HoBPI api на :${PORT}${app.cfg.devAuth ? ' (DEV-авторизация: заголовок x-dev-user)' : ''}`,
  );
});

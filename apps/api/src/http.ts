/**
 * Каркас HTTP: маршрутизация на Web-стандартных Request/Response,
 * чтобы один и тот же код работал в Node и в Cloudflare Workers.
 */
import type { AuthConfig } from './auth.ts';
import type { Db } from './db.ts';

export interface Ctx {
  db: Db;
  cfg: AuthConfig;
  req: Request;
  url: URL;
  /** разобранное JSON-тело (для POST); {} если тела нет */
  body: Record<string, unknown>;
  /** параметры пути, например :id */
  params: Record<string, string>;
}

export type Handler = (ctx: Ctx) => Promise<unknown>;

export interface Route {
  method: 'GET' | 'POST';
  /** '/api/battle/:id' */
  path: string;
  handler: Handler;
}

export function corsOrigin(req: Request, allowed: string[]): string {
  const origin = req.headers.get('origin');
  if (!allowed.length) return origin ?? '*';
  return origin && allowed.includes(origin) ? origin : allowed[0];
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

/** Сопоставляет путь с шаблоном, возвращая параметры или null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** Простой лимит запросов в памяти процесса/изолята. */
export class RateLimiter {
  private hits = new Map<string, { n: number; until: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  // без parameter properties: Node исполняет TS в режиме strip-only и их не поддерживает
  constructor(limit: number, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(key: string): boolean {
    if (this.limit <= 0) return true;
    const t = Date.now();
    const rec = this.hits.get(key);
    if (!rec || rec.until < t) {
      this.hits.set(key, { n: 1, until: t + this.windowMs });
      if (this.hits.size > 5000) this.hits.clear();
      return true;
    }
    return ++rec.n <= this.limit;
  }
}

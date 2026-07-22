/**
 * Единый обработчик запросов. Работает и в Node, и в Cloudflare Workers —
 * принимает Web-стандартный Request, возвращает Response.
 */
import { IllegalActionError } from '@hobpi/engine';
import { AuthError, type AuthConfig } from './auth.ts';
import type { Db } from './db.ts';
import { GameError } from './game.ts';
import { RateLimiter, corsOrigin, json, matchPath, type Ctx, type Route } from './http.ts';
import { profileRoutes } from './routes/profile.ts';
import { cityRoutes } from './routes/city.ts';
import { battleRoutes } from './routes/battle.ts';
import { socialRoutes } from './routes/social.ts';

export const ROUTES: Route[] = [
  ...profileRoutes,
  ...cityRoutes,
  ...battleRoutes,
  ...socialRoutes,
];

export interface AppOptions {
  db: Db;
  botToken?: string;
  devAuth?: boolean;
  /** домены, которым разрешён CORS; пусто = любой */
  allowedOrigins?: string[];
  /** запросов в минуту на игрока; 0 = без лимита */
  rateLimit?: number;
}

export interface App {
  fetch(req: Request): Promise<Response>;
  cfg: AuthConfig;
}

export function createApp(opts: AppOptions): App {
  const cfg: AuthConfig = {
    botToken: opts.botToken ?? '',
    // без токена бота проверить initData нечем — остаётся только dev-режим
    devAuth: opts.devAuth ?? !opts.botToken,
  };
  const allowed = opts.allowedOrigins ?? [];
  const limiter = new RateLimiter(opts.rateLimit ?? 120);

  async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const cors = { 'access-control-allow-origin': corsOrigin(req, allowed), vary: 'Origin' };

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-dev-user',
          'access-control-max-age': '86400',
        },
      });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, dev: cfg.devAuth }, 200, cors);
    }

    if (!url.pathname.startsWith('/api/')) {
      return json({ error: 'Не найдено' }, 404, cors);
    }

    const rlKey = req.headers.get('x-dev-user')
      ?? req.headers.get('authorization')?.slice(-32)
      ?? req.headers.get('cf-connecting-ip')
      ?? 'anon';
    if (!limiter.check(rlKey)) {
      return json({ error: 'Слишком много запросов, притормози' }, 429, cors);
    }

    for (const r of ROUTES) {
      if (r.method !== req.method) continue;
      const params = matchPath(r.path, url.pathname);
      if (!params) continue;

      let body: Record<string, unknown> = {};
      if (req.method === 'POST') {
        try {
          const raw = await req.text();
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return json({ error: 'Некорректный JSON' }, 400, cors);
        }
      }

      const ctx: Ctx = { db: opts.db, cfg, req, url, body, params };
      try {
        return json(await r.handler(ctx), 200, cors);
      } catch (e) {
        if (e instanceof AuthError) return json({ error: e.message }, 401, cors);
        if (e instanceof GameError) return json({ error: e.message }, 400, cors);
        if (e instanceof IllegalActionError) return json({ error: e.message }, 400, cors);
        console.error('Ошибка обработчика', url.pathname, e);
        return json({ error: 'Внутренняя ошибка сервера' }, 500, cors);
      }
    }

    return json({ error: 'Не найдено' }, 404, cors);
  }

  return { fetch: fetchHandler, cfg };
}

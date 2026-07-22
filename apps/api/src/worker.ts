/**
 * Точка входа Cloudflare Worker.
 *
 * Схема применяется отдельно, до первого деплоя:
 *   npx wrangler d1 execute hobpi --file=schema.sql --remote
 *
 * Секреты:
 *   npx wrangler secret put BOT_TOKEN
 */
import { createApp } from './app.ts';
import { d1Db, type D1Database } from './adapters/d1.ts';

export interface Env {
  DB: D1Database;
  BOT_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  /** '1' — пускать по X-Dev-User. Никогда не включать в проде. */
  DEV_AUTH?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const app = createApp({
      db: d1Db(env.DB),
      botToken: env.BOT_TOKEN,
      devAuth: env.DEV_AUTH === '1',
      allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      rateLimit: 120,
    });
    return app.fetch(req);
  },
};

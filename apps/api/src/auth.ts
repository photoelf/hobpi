/**
 * Проверка Telegram WebApp initData.
 * Сделана на WebCrypto, чтобы один и тот же код работал и в Node, и в Cloudflare Workers.
 */
import { getPlayerByTg, type Db, type PlayerRow } from './db.ts';

/** initData считается свежим сутки — как рекомендует Telegram */
const MAX_AGE_SEC = 24 * 60 * 60;

export interface TgUser {
  id: string;
  firstName: string;
  username?: string;
}

export interface AuthConfig {
  botToken: string;
  /** пускать по заголовку X-Dev-User (только для разработки) */
  devAuth: boolean;
}

export class AuthError extends Error {}

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

const toHex = (b: Uint8Array): string =>
  [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Сравнение за постоянное время — чтобы по таймингу нельзя было подобрать подпись. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN),
 * затем сверяем hash над отсортированной data-check-string.
 */
export async function verifyInitData(initData: string, botToken: string): Promise<TgUser | null> {
  if (!botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.delete('signature');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const computed = toHex(await hmac(secret, checkString));
  if (!safeEqual(computed, hash.toLowerCase())) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '{}');
    if (!user.id) return null;
    return { id: String(user.id), firstName: user.first_name ?? 'Пацан', username: user.username };
  } catch {
    return null;
  }
}

/** Достаёт пользователя из запроса. */
export async function authUser(req: Request, cfg: AuthConfig): Promise<TgUser | null> {
  const header = req.headers.get('authorization');
  if (header?.startsWith('tma ')) {
    const u = await verifyInitData(header.slice(4), cfg.botToken);
    if (u) return u;
  }
  if (cfg.devAuth) {
    const dev = req.headers.get('x-dev-user');
    if (dev) return { id: `dev:${dev}`, firstName: `Тест-${dev}` };
  }
  return null;
}

/** Требует авторизованного игрока с созданным профилем. */
export async function requirePlayer(req: Request, cfg: AuthConfig, db: Db): Promise<PlayerRow> {
  const u = await authUser(req, cfg);
  if (!u) throw new AuthError('Не авторизован');
  const p = await getPlayerByTg(db, u.id);
  if (!p) throw new AuthError('Профиль не создан');
  return p;
}

/**
 * Сквозная проверка боевого развёртывания: подписывает настоящий Telegram initData
 * и играет полный сценарий против живого API.
 *
 * Запуск:
 *   BOT_TOKEN=... API_URL=https://hobpi-api.photoelf.workers.dev node tools/prod-smoke.ts
 *
 * Создаёт двух тестовых игроков с id из диапазона 9000000xx — их потом надо убрать:
 *   npx wrangler d1 execute hobpi --remote --command \
 *     "DELETE FROM players WHERE tg_id LIKE '9000000%'"
 */
import { createHmac } from 'node:crypto';
import { legalMoves } from '../packages/engine/src/index.ts';
import type { BattleState } from '../packages/engine/src/types.ts';

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const API = (process.env.API_URL ?? 'https://hobpi-api.photoelf.workers.dev').replace(/\/+$/, '');
const ORIGIN = process.env.ORIGIN ?? 'https://photoelf.github.io';

if (!BOT_TOKEN) {
  console.error('Нужен BOT_TOKEN в окружении');
  process.exit(1);
}

/** Собирает initData с корректной подписью — ровно так, как это делает Telegram. */
function signInitData(user: { id: number; first_name: string; username: string }): string {
  const params: Record<string, string> = {
    query_id: 'AAHtest',
    user: JSON.stringify({ ...user, language_code: 'ru' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const checkString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  const q = new URLSearchParams(params);
  q.set('hash', hash);
  return q.toString();
}

const checks: Array<[string, boolean, string]> = [];
function expect(name: string, ok: boolean, detail = ''): void {
  checks.push([name, ok, detail]);
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

class Player {
  readonly initData: string;
  readonly label: string;
  readonly tgId: number;

  constructor(label: string, tgId: number, name: string) {
    this.label = label;
    this.tgId = tgId;
    this.initData = signInitData({ id: tgId, first_name: name, username: `test${tgId}` });
  }

  async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(API + path, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `tma ${this.initData}`,
        origin: ORIGIN,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${data.error ?? text}`);
    return data as T;
  }
}

const a = new Player('A', 900000001, 'Смоук-Батя');
const b = new Player('B', 900000002, 'Смоук-Тренер');

/* 1. Подпись принимается, чужая — нет */
const me = await a.call<{ registered: boolean }>('GET', '/api/me');
expect('валидный initData принимается', typeof me.registered === 'boolean');

const bad = await fetch(API + '/api/me', {
  headers: { authorization: `tma ${a.initData.replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64))}` },
});
expect('подделанная подпись отклоняется', bad.status === 401, `статус ${bad.status}`);

/* 2. Онбординг */
for (const [p, faction, cls] of [[a, 'castle', 'avtoritet'], [b, 'stronghold', 'oper']] as const) {
  const cur = await p.call<{ registered: boolean }>('GET', '/api/me');
  if (!cur.registered) {
    await p.call('POST', '/api/auth/start', { faction, heroClass: cls, name: `Смоук-${p.label}` });
  }
}
const stateA = await a.call<Record<string, never>>('GET', '/api/state');
const pl = stateA.player as unknown as { nal: number; fuel: number; power: number };
expect('профиль создан и отдаёт состояние', pl.nal > 0 && pl.power > 0,
  `налик ${pl.nal}, сила ${pl.power}`);
expect('стартовая бригада на месте', (stateA.army as unknown[]).length > 0);

/* 3. Экономика: постройка и найм */
const built = await a.call<Record<string, never>>('POST', '/api/city/build', { key: 'ploshchadka' })
  .catch((e: Error) => ({ error: e.message } as never));
expect('постройка здания проходит',
  !!(built as Record<string, unknown>).buildings || String((built as never as { error: string }).error ?? '').includes('Уже построено'));

const pool = (await a.call<Record<string, never>>('GET', '/api/state')).pool as unknown as Record<string, number>;
const [unitId, avail] = Object.entries(pool).find(([, n]) => n > 0) ?? [];
if (unitId && avail) {
  await a.call('POST', '/api/army/recruit', { unitId, count: 1 });
  expect('найм бойца проходит', true, `${unitId} ×1`);
}

/* 4. PvE-бой целиком */
const camps = await a.call<{ camps: Array<{ difficulty: string; power: number }> }>('GET', '/api/pve/camps');
expect('PvE-лагеря генерируются', camps.camps.length === 3);

const start = await a.call<{ battleId: number; state: BattleState }>(
  'POST', '/api/battle/start', { kind: 'pve', difficulty: 'easy' },
);
let st = start.state;
let finished = false;
let winner: string | null = null;
let turns = 0;
while (!finished && turns++ < 300) {
  const legal = legalMoves(st);
  if (!legal) break;
  const action = legal.meleeTargets.length
    ? { type: 'attack' as const, ...legal.meleeTargets[0] }
    : legal.shootTargets.length
      ? { type: 'shoot' as const, targetId: legal.shootTargets[0] }
      : legal.moveCells.length
        ? { type: 'move' as const, ...legal.moveCells[0] }
        : { type: 'defend' as const };
  const r = await a.call<{ state: BattleState; finished: boolean; summary?: { winner: string | null } }>(
    'POST', '/api/battle/act', { battleId: start.battleId, action },
  );
  st = r.state;
  finished = r.finished;
  if (finished) winner = r.summary?.winner ?? null;
}
expect('интерактивный PvE-бой доигрывается', finished, `${turns} ходов, победитель ${winner ?? 'ничья'}`);

/* 5. PvP между двумя аккаунтами */
const opp = await a.call<{ opponents: Array<{ id: number; name: string }> }>('GET', '/api/arena/opponents');
const target = opp.opponents.find((o) => o.name.startsWith('Смоук'));
if (target) {
  const before = (await a.call<Record<string, never>>('GET', '/api/state')).player as unknown as { rating: number };
  const pvp = await a.call<{ summary: { winner: string | null }; battleId: number }>(
    'POST', '/api/battle/start', { kind: 'pvp', targetId: target.id, auto: true },
  );
  const after = (await a.call<Record<string, never>>('GET', '/api/state')).player as unknown as { rating: number };
  expect('PvP-автобой отрабатывает и двигает рейтинг', after.rating !== before.rating,
    `${before.rating} → ${after.rating}`);

  const rep = await a.call<{ setup: unknown; actions: unknown[] }>('GET', `/api/battle/${pvp.battleId}`);
  expect('реплей боя отдаётся', !!rep.setup);
} else {
  expect('PvP: соперник найден', false, 'второй игрок не попал в подбор (щит новичка?)');
}

/* 6. Лидерборд */
const lad = await a.call<{ top: unknown[]; myPlace: number }>('GET', '/api/ladder');
expect('лидерборд отдаётся', lad.top.length > 0, `мест: ${lad.top.length}, я #${lad.myPlace}`);

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено против ${API}`);
process.exit(failed.length ? 1 : 0);

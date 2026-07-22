/**
 * Сквозной тест игрового цикла: онбординг → экономика → найм → PvE → PvP.
 * Использует отдельную временную БД, поэтому безопасен рядом с dev-базой.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hobpi-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.DEV_AUTH = '1';
delete process.env.BOT_TOKEN;

const { createApp } = await import('../src/app.ts');
const { nodeDb } = await import('../src/adapters/node.ts');
const { legalMoves } = await import('@hobpi/engine');

const { db, close } = nodeDb(process.env.DB_PATH);
const app = createApp({ db, devAuth: true, rateLimit: 0 });

const BASE = 'http://test.local';

before(() => {});
after(() => {
  close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows держит файл */ }
});

async function json(user: string, method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await app.fetch(new Request(BASE + url, {
    method,
    headers: { 'x-dev-user': user, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

test('без авторизации API отвечает 401', async () => {
  const res = await app.fetch(new Request(BASE + '/api/state'));
  assert.equal(res.status, 401);
});

test('контент отдаётся целиком', async () => {
  const { body } = await json('1', 'GET', '/api/content');
  assert.equal((body.units as unknown[]).length, 28);
  assert.equal((body.factions as unknown[]).length, 4);
  assert.equal((body.classes as unknown[]).length, 3);
});

test('онбординг создаёт профиль со стартовым набором', async () => {
  const pre = await json('1', 'GET', '/api/me');
  assert.equal(pre.body.registered, false);

  const { status, body } = await json('1', 'POST', '/api/auth/start', {
    faction: 'castle', heroClass: 'avtoritet', name: 'Батя',
  });
  assert.equal(status, 200);
  const s = body.state as Record<string, never>;
  assert.equal((s.player as Record<string, never>).name, 'Батя');
  assert.equal((s.player as Record<string, never>).nal, 1500);
  assert.equal((s.army as unknown[]).length, 1, 'должен быть стартовый стек');
  assert.ok((s.buildings as Record<string, number>).dvor, 'должен быть построен Двор');
  assert.equal((s.spots as unknown[]).length, 1, 'должна быть стартовая точка');
});

test('повторный онбординг отклоняется', async () => {
  const { status, body } = await json('1', 'POST', '/api/auth/start', {
    faction: 'tower', heroClass: 'oper',
  });
  assert.equal(status, 400);
  assert.match(body.error as unknown as string, /уже создан/);
});

test('нельзя выбрать несуществующую фракцию', async () => {
  const { status } = await json('99', 'POST', '/api/auth/start', {
    faction: 'necropolis', heroClass: 'avtoritet',
  });
  assert.equal(status, 400);
});

test('постройка здания списывает ресурсы и открывает тир', async () => {
  const before = (await json('1', 'GET', '/api/state')).body;
  const nalBefore = (before.player as Record<string, number>).nal;

  const { status, body } = await json('1', 'POST', '/api/city/build', { key: 'ploshchadka' });
  assert.equal(status, 200);
  assert.equal((body.buildings as Record<string, number>).ploshchadka, 1);
  assert.ok((body.player as Record<string, number>).nal < nalBefore, 'налик должен списаться');
});

test('нельзя строить здание тира через ступеньку', async () => {
  const { status, body } = await json('1', 'POST', '/api/city/build', { key: 'garazh' });
  assert.equal(status, 400);
  assert.match(body.error as unknown as string, /Пункт охраны/);
});

test('нельзя купить то, на что не хватает денег', async () => {
  // сначала снимаем требование по цепочке тиров, чтобы упереться именно в деньги
  await db.run(
    `INSERT INTO buildings (player_id, key, level) VALUES
       ((SELECT id FROM players WHERE tg_id = 'dev:1'), 'masterskaya', 1)`,
  );
  const { status, body } = await json('1', 'POST', '/api/city/build', { key: 'osobnyak' });
  assert.equal(status, 400);
  assert.match(body.error as unknown as string, /Не хватает ресурсов/);
});

test('найм ограничен накопленным приростом', async () => {
  const state = (await json('1', 'GET', '/api/state')).body;
  const pool = state.pool as Record<string, number>;
  const [unitId, available] = Object.entries(pool)[0];

  const tooMany = await json('1', 'POST', '/api/army/recruit', { unitId, count: available + 50 });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.body.error as unknown as string, /Доступно/);
});

test('чужую фракцию нанять нельзя', async () => {
  const { status } = await json('1', 'POST', '/api/army/recruit', { unitId: 'str1', count: 1 });
  assert.equal(status, 400);
});

test('PvE: список лагерей масштабируется под силу игрока', async () => {
  const { body } = await json('1', 'GET', '/api/pve/camps');
  const camps = body.camps as Array<{ difficulty: string; power: number; army: unknown[] }>;
  assert.equal(camps.length, 3);
  const easy = camps.find((c) => c.difficulty === 'easy')!;
  const hard = camps.find((c) => c.difficulty === 'hard')!;
  assert.ok(hard.power > easy.power, 'сложный лагерь должен быть сильнее лёгкого');
  assert.ok(easy.army.length > 0);
});

test('PvE: интерактивный бой играется до конца и списывает топливо', async () => {
  const before = (await json('1', 'GET', '/api/state')).body;
  const fuelBefore = (before.player as Record<string, number>).fuel;

  const start = await json('1', 'POST', '/api/battle/start', { kind: 'pve', difficulty: 'easy' });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const battleId = start.body.battleId as unknown as number;
  let state = start.body.state as never;

  let guard = 0;
  let finished = false;
  let summary: Record<string, unknown> | null = null;
  while (!finished && guard++ < 300) {
    const legal = legalMoves(state);
    assert.ok(legal, 'должен быть ход игрока');
    const action = legal!.meleeTargets.length
      ? { type: 'attack' as const, ...legal!.meleeTargets[0] }
      : legal!.shootTargets.length
        ? { type: 'shoot' as const, targetId: legal!.shootTargets[0] }
        : { type: 'defend' as const };
    const res = await json('1', 'POST', '/api/battle/act', { battleId, action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    state = res.body.state as never;
    finished = res.body.finished as unknown as boolean;
    if (finished) summary = res.body.summary as unknown as Record<string, unknown>;
  }

  assert.ok(finished, 'бой должен завершиться');
  assert.ok(summary && ['A', 'B', null].includes(summary.winner as string));

  const after = (await json('1', 'GET', '/api/state')).body;
  assert.equal((after.player as Record<string, number>).fuel, fuelBefore - 1);
});

test('нельзя ходить в чужом/несуществующем бою', async () => {
  const { status } = await json('1', 'POST', '/api/battle/act', {
    battleId: 999999, action: { type: 'defend' },
  });
  assert.equal(status, 400);
});

test('PvP: автобой между двумя игроками меняет рейтинг обоим', async () => {
  await json('2', 'POST', '/api/auth/start', {
    faction: 'stronghold', heroClass: 'oper', name: 'Тренер',
  });
  // оба уже не новички: снимаем стартовый 48-часовой щит
  await db.run('UPDATE players SET shield_until = 0');

  const opponents = await json('1', 'GET', '/api/arena/opponents');
  const list = opponents.body.opponents as Array<{ id: number; name: string }>;
  assert.ok(list.length >= 1, 'должен найтись хотя бы один соперник');
  const target = list.find((o) => o.name === 'Тренер');
  assert.ok(target, 'соперник «Тренер» должен быть в подборе');

  const before1 = (await json('1', 'GET', '/api/state')).body.player as Record<string, number>;
  const before2 = (await json('2', 'GET', '/api/state')).body.player as Record<string, number>;

  const res = await json('1', 'POST', '/api/battle/start', {
    kind: 'pvp', targetId: target!.id, auto: true,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.auto, true);

  const after1 = (await json('1', 'GET', '/api/state')).body.player as Record<string, number>;
  const after2 = (await json('2', 'GET', '/api/state')).body.player as Record<string, number>;

  assert.notEqual(after1.rating, before1.rating, 'рейтинг атакующего должен измениться');
  assert.notEqual(after2.rating, before2.rating, 'рейтинг защитника должен измениться');
  assert.equal(
    after1.rating - before1.rating,
    -(after2.rating - before2.rating),
    'Elo должен быть симметричен',
  );
  assert.equal(after1.fuel, before1.fuel - 2, 'PvP стоит 2 топлива');
});

test('повторный наезд на того же игрока блокируется кулдауном', async () => {
  const opponents = await json('1', 'GET', '/api/arena/opponents');
  const target = (opponents.body.opponents as Array<{ id: number; name: string }>)
    .find((o) => o.name === 'Тренер');
  if (!target) {
    // защитник ушёл под 30-минутный щит после проигранной обороны — тоже валидная защита
    return;
  }
  const state = (await json('1', 'GET', '/api/state')).body;
  assert.ok((state.army as unknown[]).length > 0, 'после разгрома бригада не должна оставаться пустой');
  const res = await json('1', 'POST', '/api/battle/start', {
    kind: 'pvp', targetId: target.id, auto: true,
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error as unknown as string, /недавно|щит/);
});

test('реплей боя восстанавливается и совпадает с сохранённым исходом', async () => {
  const history = await json('1', 'GET', '/api/history');
  const battles = history.body.battles as Array<{ id: number }>;
  assert.ok(battles.length >= 2, 'в истории должны быть бои');

  const { replay, battleResult } = await import('@hobpi/engine');
  for (const b of battles) {
    const { body } = await json('1', 'GET', `/api/battle/${b.id}`);
    const setup = body.setup as never;
    const actions = body.actions as never;
    const aiSides = body.aiSides as never;
    const state = replay(setup, actions, aiSides);
    const result = battleResult(state, setup);
    const expected = body.result === 'draw' ? null : body.result;
    assert.equal(result.winner, expected, `реплей боя #${b.id} должен совпасть с записью`);
  }
});

test('чужой бой посмотреть нельзя', async () => {
  const history = await json('1', 'GET', '/api/history');
  const first = (history.body.battles as Array<{ id: number; kind: string }>)
    .find((b) => b.kind === 'pve');
  assert.ok(first);
  const { status } = await json('2', 'GET', `/api/battle/${first!.id}`);
  assert.equal(status, 400);
});

test('таблица лидеров отдаёт места и отмечает игрока', async () => {
  const { body } = await json('1', 'GET', '/api/ladder');
  const top = body.top as Array<{ place: number; me: boolean }>;
  assert.ok(top.length >= 2);
  assert.equal(top[0].place, 1);
  assert.ok(top.some((r) => r.me), 'игрок должен быть отмечен в таблице');
});

test('артефакт экипируется и меняет статы героя', async () => {
  const state = (await json('1', 'GET', '/api/state')).body;
  const arts = state.artifacts as Array<{ id: number; artId: string; equipped: boolean }>;
  const off = arts.find((a) => !a.equipped);
  if (!off) return; // с PvE могло ничего не выпасть
  const before = (state.player as Record<string, never>).stats as Record<string, number>;
  const { body } = await json('1', 'POST', '/api/hero/equip', { artifactId: off.id });
  const after = (body.player as Record<string, never>).stats as Record<string, number>;
  const changed = Object.keys(after).some((k) => after[k] !== before[k]);
  assert.ok(changed, 'экипировка должна влиять на статы');
});

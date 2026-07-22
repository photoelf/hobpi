import { UNITS } from '@hobpi/engine';
import { requirePlayer } from '../auth.ts';
import { getArmy, getPool, setArmy, setPool } from '../db.ts';
import {
  GameError, accrue, build, buildSpot, recruit, stateSnapshot, upgradeSpot,
} from '../game.ts';
import type { Ctx, Route } from '../http.ts';

async function doBuild({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);
  await build(db, p, String(body.key ?? ''));
  return stateSnapshot(db, p);
}

async function doSpot({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);
  await buildSpot(db, p, String(body.key ?? ''));
  return stateSnapshot(db, p);
}

async function doSpotUpgrade({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);
  await upgradeSpot(db, p, String(body.key ?? ''));
  return stateSnapshot(db, p);
}

async function doRecruit({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);
  await recruit(db, p, String(body.unitId ?? ''), Math.floor(Number(body.count ?? 0)));
  return stateSnapshot(db, p);
}

/** Роспуск части стека: бойцы уходят, ресурсы не возвращаются. */
async function dismiss({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const slot = Number(body.slot);
  const army = await getArmy(db, p.id);
  const stack = army.find((a) => a.slot === slot);
  if (!stack) throw new GameError('Нет такого стека');
  const count = Math.min(stack.count, Math.max(1, Math.floor(Number(body.count ?? stack.count))));
  if (count >= stack.count) {
    await db.run('DELETE FROM army WHERE player_id = ? AND slot = ?', p.id, slot);
  } else {
    await db.run(
      'UPDATE army SET count = count - ? WHERE player_id = ? AND slot = ?', count, p.id, slot,
    );
  }
  return stateSnapshot(db, p);
}

/** Перестановка стеков — порядок задаёт расстановку на поле сверху вниз. */
async function arrange({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const order = Array.isArray(body.order) ? (body.order as number[]) : [];
  const army = await getArmy(db, p.id);
  if (order.length !== army.length) throw new GameError('Некорректный порядок');
  const rearranged = order.map((slot) => {
    const s = army.find((a) => a.slot === slot);
    if (!s) throw new GameError('Некорректный порядок');
    return { unitId: s.unitId, count: s.count };
  });
  await setArmy(db, p.id, rearranged);
  return stateSnapshot(db, p);
}

/** Вернуть бойцов из бригады обратно в пул найма (без возврата денег). */
async function toPool({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const slot = Number(body.slot);
  const army = await getArmy(db, p.id);
  const stack = army.find((a) => a.slot === slot);
  if (!stack) throw new GameError('Нет такого стека');
  const u = UNITS[stack.unitId];
  if (!u) throw new GameError('Неизвестный боец');
  const count = Math.min(stack.count, Math.max(1, Math.floor(Number(body.count ?? 1))));
  const pool = await getPool(db, p.id);
  await setPool(db, p.id, stack.unitId, Math.min(u.growth * 2, (pool[stack.unitId] ?? 0) + count));
  if (count >= stack.count) {
    await db.run('DELETE FROM army WHERE player_id = ? AND slot = ?', p.id, slot);
  } else {
    await db.run(
      'UPDATE army SET count = count - ? WHERE player_id = ? AND slot = ?', count, p.id, slot,
    );
  }
  return stateSnapshot(db, p);
}

export const cityRoutes: Route[] = [
  { method: 'POST', path: '/api/city/build', handler: doBuild },
  { method: 'POST', path: '/api/city/spot', handler: doSpot },
  { method: 'POST', path: '/api/city/spot/upgrade', handler: doSpotUpgrade },
  { method: 'POST', path: '/api/army/recruit', handler: doRecruit },
  { method: 'POST', path: '/api/army/dismiss', handler: dismiss },
  { method: 'POST', path: '/api/army/arrange', handler: arrange },
  { method: 'POST', path: '/api/army/toPool', handler: toPool },
];

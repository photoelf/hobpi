import {
  ABILITY_LIST, ARTIFACTS, ARTIFACT_LIST, FACTIONS, FACTION_IDS, HERO_CLASSES,
  MVP_CLASSES, RECRUIT_BUILDINGS, SPECIAL_BUILDINGS, SPOTS, UNIT_LIST,
} from '@hobpi/engine';
import { AuthError, authUser, requirePlayer } from '../auth.ts';
import { getArtifacts, getPlayerByTg, now, updatePlayer } from '../db.ts';
import { GameError, seedNewPlayer, stateSnapshot } from '../game.ts';
import type { Ctx, Route } from '../http.ts';

/** Весь статический контент — клиент кэширует его и не запрашивает повторно. */
async function content() {
  return {
    factions: FACTION_IDS.map((f) => FACTIONS[f]),
    classes: MVP_CLASSES.map((c) => HERO_CLASSES[c]),
    units: UNIT_LIST,
    abilities: ABILITY_LIST,
    artifacts: ARTIFACT_LIST,
    recruitBuildings: RECRUIT_BUILDINGS,
    specialBuildings: SPECIAL_BUILDINGS.map((b) => ({
      key: b.key, name: b.name, maxLevel: b.maxLevel, icon: b.icon, desc: b.desc,
      costs: Array.from({ length: b.maxLevel }, (_, i) => b.cost(i + 1)),
    })),
    spots: SPOTS,
  };
}

async function me({ req, cfg, db }: Ctx) {
  const u = await authUser(req, cfg);
  if (!u) throw new AuthError('Не авторизован');
  const p = await getPlayerByTg(db, u.id);
  if (!p) return { registered: false, suggestedName: u.firstName };
  return { registered: true, state: await stateSnapshot(db, p) };
}

async function start({ req, cfg, db, body }: Ctx) {
  const u = await authUser(req, cfg);
  if (!u) throw new AuthError('Не авторизован');
  if (await getPlayerByTg(db, u.id)) throw new GameError('Профиль уже создан');

  const faction = String(body.faction ?? '');
  const heroClass = String(body.heroClass ?? '');
  if (!FACTION_IDS.includes(faction as never)) throw new GameError('Неизвестная фракция');
  if (!MVP_CLASSES.includes(heroClass)) throw new GameError('Неизвестный класс');

  const cls = HERO_CLASSES[heroClass];
  const name = String(body.name ?? u.firstName).slice(0, 24).trim() || 'Пацан';
  const t = now();

  await db.run(
    `INSERT INTO players (tg_id, name, faction, hero_class, atk, def, power, knowledge,
                          nal, tovar, fuel, fuel_at, income_at, growth_at, created_at, shield_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1500, 5, 10, ?, ?, ?, ?, ?)`,
    u.id, name, faction, heroClass,
    cls.attack, cls.defense, cls.power, cls.knowledge,
    t, t, t, t, t + 48 * 3600 * 1000,
  );

  const p = (await getPlayerByTg(db, u.id))!;
  await seedNewPlayer(db, p);
  return { ok: true, state: await stateSnapshot(db, p) };
}

async function state({ req, cfg, db }: Ctx) {
  return stateSnapshot(db, await requirePlayer(req, cfg, db));
}

async function equip({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const arts = await getArtifacts(db, p.id);
  const own = arts.find((a) => a.id === Number(body.artifactId));
  if (!own) throw new GameError('Такого артефакта нет');
  const def = ARTIFACTS[own.artId];
  if (!def) throw new GameError('Неизвестный артефакт');

  for (const a of arts) {
    if (a.equipped && ARTIFACTS[a.artId]?.slot === def.slot) {
      await db.run('UPDATE artifacts SET equipped = 0 WHERE id = ?', a.id);
    }
  }
  await db.run('UPDATE artifacts SET equipped = 1 WHERE id = ?', own.id);
  return stateSnapshot(db, p);
}

async function unequip({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const arts = await getArtifacts(db, p.id);
  const own = arts.find((a) => a.id === Number(body.artifactId));
  if (!own) throw new GameError('Такого артефакта нет');
  await db.run('UPDATE artifacts SET equipped = 0 WHERE id = ?', own.id);
  return stateSnapshot(db, p);
}

async function rename({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const name = String(body.name ?? '').slice(0, 24).trim();
  if (!name) throw new GameError('Пустая кличка');
  await updatePlayer(db, p.id, { name });
  p.name = name;
  return stateSnapshot(db, p);
}

export const profileRoutes: Route[] = [
  { method: 'GET', path: '/api/content', handler: content },
  { method: 'GET', path: '/api/me', handler: me },
  { method: 'POST', path: '/api/auth/start', handler: start },
  { method: 'GET', path: '/api/state', handler: state },
  { method: 'POST', path: '/api/hero/equip', handler: equip },
  { method: 'POST', path: '/api/hero/unequip', handler: unequip },
  { method: 'POST', path: '/api/hero/rename', handler: rename },
];

/**
 * Доменная логика: начисления, найм, постройки, прокачка, сборка героя для боя.
 * Всё начисление ленивое — считается при обращении игрока, по прошедшему времени.
 */
import {
  ABILITIES, ARTIFACTS, FACTIONS, HERO_CLASSES, RECRUIT_BUILDINGS, SPECIAL_BUILDINGS,
  SPOTS_BY_KEY, UNITS, abilitiesForGuild, levelFromXp, spotIncomeMultiplier, spotSlots,
  sumArtifacts, totalPower, unitOfTier, unitsOfFaction, weeklyEvent, xpForLevel,
} from '@hobpi/engine';
import type { ArmyStackInput, BattleHero, Cost, FactionId, ResourceKey } from '@hobpi/engine';
import {
  getArmy, getArtifacts, getBuildings, getPool, getSpots, now, setPool, updatePlayer,
  type Db, type PlayerRow,
} from './db.ts';

export const INCOME_TICK_MS = 6 * 3600 * 1000;
export const MAX_INCOME_TICKS = 8;
export const GROWTH_TICK_MS = 24 * 3600 * 1000;
export const FUEL_TICK_MS = 12 * 60 * 1000;
export const BASE_FUEL_MAX = 10;
export const BASE_VAULT_CAP = 10000;

export class GameError extends Error {}

export const RANKS = [
  'Пацан с района', 'Бегунок', 'Бригадир', 'Смотрящий', 'Авторитет', 'Вор в законе', 'Хозяин города',
];

export function rankOf(p: PlayerRow): string {
  if (p.rating >= 1500 && p.level >= 20) return RANKS[5];
  if (p.rating >= 1200 && p.level >= 15) return RANKS[4];
  if (p.level >= 10) return RANKS[3];
  if (p.level >= 5) return RANKS[2];
  if (p.wins >= 3) return RANKS[1];
  return RANKS[0];
}

/* ── Ресурсы ─────────────────────────────────────────────────────── */

export const RESOURCE_KEYS: ResourceKey[] = ['nal', 'influence', 'svyazi', 'tovar'];

export function canAfford(p: PlayerRow, cost: Cost): boolean {
  return RESOURCE_KEYS.every((k) => (cost[k] ?? 0) <= p[k]);
}

export async function pay(db: Db, p: PlayerRow, cost: Cost): Promise<void> {
  const patch: Partial<PlayerRow> = {};
  for (const k of RESOURCE_KEYS) {
    const v = cost[k] ?? 0;
    if (v) {
      p[k] -= v;
      patch[k] = p[k];
    }
  }
  await updatePlayer(db, p.id, patch);
}

export async function grant(db: Db, p: PlayerRow, gain: Cost): Promise<void> {
  const cap = await vaultCap(db, p);
  const patch: Partial<PlayerRow> = {};
  for (const k of RESOURCE_KEYS) {
    const v = gain[k] ?? 0;
    if (!v) continue;
    p[k] = k === 'nal' ? Math.min(cap, p[k] + v) : p[k] + v;
    patch[k] = p[k];
  }
  await updatePlayer(db, p.id, patch);
}

export async function vaultCap(db: Db, p: PlayerRow): Promise<number> {
  const b = await getBuildings(db, p.id);
  return Math.round(BASE_VAULT_CAP * (1 + (b.shemy ? 0.5 : 0)) * (1 + p.level * 0.15));
}

async function equippedBonuses(db: Db, playerId: number) {
  const arts = await getArtifacts(db, playerId);
  return sumArtifacts(arts.filter((a) => a.equipped).map((a) => a.artId));
}

export async function fuelMax(db: Db, p: PlayerRow): Promise<number> {
  const b = await getBuildings(db, p.id);
  const arts = await equippedBonuses(db, p.id);
  return BASE_FUEL_MAX + (b.servis ? 2 : 0) + arts.fuelMax;
}

/* ── Начисления ──────────────────────────────────────────────────── */

/** Доход за один тик (6 часов) с учётом точек, «Сходки», события недели и артефактов. */
export async function incomePerTick(db: Db, p: PlayerRow): Promise<Cost> {
  const out: Cost = { nal: 0, influence: 0, svyazi: 0, tovar: 0 };
  for (const s of await getSpots(db, p.id)) {
    const def = SPOTS_BY_KEY[s.key];
    if (!def) continue;
    const m = spotIncomeMultiplier(s.level);
    for (const k of RESOURCE_KEYS) out[k] = (out[k] ?? 0) + (def.income[k] ?? 0) * m;
  }
  const b = await getBuildings(db, p.id);
  if (b.shodka) out.nal = (out.nal ?? 0) + 250 * b.shodka;

  const ev = weeklyEvent().key;
  let mul = 1;
  if (ev === 'majory') mul *= 1.5;
  if (ev === 'oblavy') mul *= 0.75;
  mul *= 1 + (await equippedBonuses(db, p.id)).incomePct / 100;
  if (p.hero_class === 'smotryashchiy') mul *= 1.15;

  for (const k of RESOURCE_KEYS) out[k] = Math.floor((out[k] ?? 0) * mul);
  return out;
}

/** Начисляет доход, прирост бойцов и топливо за прошедшее время. */
export async function accrue(db: Db, p: PlayerRow): Promise<void> {
  const t = now();

  if (!p.income_at) p.income_at = t;
  const incomeTicks = Math.min(MAX_INCOME_TICKS, Math.floor((t - p.income_at) / INCOME_TICK_MS));
  if (incomeTicks > 0) {
    const inc = await incomePerTick(db, p);
    const gain: Cost = {};
    for (const k of RESOURCE_KEYS) gain[k] = (inc[k] ?? 0) * incomeTicks;
    await grant(db, p, gain);
    p.income_at += incomeTicks * INCOME_TICK_MS;
    await updatePlayer(db, p.id, { income_at: p.income_at });
  }

  if (!p.growth_at) p.growth_at = t;
  const growthTicks = Math.floor((t - p.growth_at) / GROWTH_TICK_MS);
  if (growthTicks > 0) {
    await addGrowth(db, p, growthTicks);
    p.growth_at += growthTicks * GROWTH_TICK_MS;
    await updatePlayer(db, p.id, { growth_at: p.growth_at });
  }

  if (!p.fuel_at) p.fuel_at = t;
  const max = await fuelMax(db, p);
  if (p.fuel < max) {
    const b = await getBuildings(db, p.id);
    const tick = b.servis ? FUEL_TICK_MS * 0.8 : FUEL_TICK_MS;
    const gained = Math.floor((t - p.fuel_at) / tick);
    if (gained > 0) {
      p.fuel = Math.min(max, p.fuel + gained);
      p.fuel_at += gained * tick;
      await updatePlayer(db, p.id, { fuel: p.fuel, fuel_at: p.fuel_at });
    }
  } else {
    p.fuel_at = t;
    await updatePlayer(db, p.id, { fuel_at: t });
  }
}

/** Пополняет пул доступных к найму бойцов за N суток. */
async function addGrowth(db: Db, p: PlayerRow, days: number): Promise<void> {
  const b = await getBuildings(db, p.id);
  const pool = await getPool(db, p.id);
  const ev = weeklyEvent().key;
  for (const rb of RECRUIT_BUILDINGS) {
    if (!b[rb.key]) continue;
    const u = unitOfTier(p.faction as FactionId, rb.tier);
    if (!u) continue;
    let weekly = u.growth;
    if (ev === 'kachki' && u.tier <= 3) weekly *= 2;
    const cap = weekly * 2;
    const cur = pool[u.id] ?? 0;
    await setPool(db, p.id, u.id, Math.min(cap, cur + (weekly / 7) * days));
  }
}

/* ── Найм ────────────────────────────────────────────────────────── */

export function recruitCost(p: PlayerRow, unitId: string, count: number): Cost {
  const u = UNITS[unitId];
  if (!u) throw new GameError('Нет такого бойца');
  const discount = p.hero_class === 'major' ? 0.8 : 1;
  const out: Cost = {};
  for (const k of RESOURCE_KEYS) {
    const v = u.cost[k] ?? 0;
    if (v) out[k] = Math.ceil(v * count * discount);
  }
  return out;
}

export async function recruit(
  db: Db, p: PlayerRow, unitId: string, count: number,
): Promise<void> {
  const u = UNITS[unitId];
  if (!u) throw new GameError('Нет такого бойца');
  if (u.faction !== p.faction) throw new GameError('Чужая фракция');
  if (!Number.isFinite(count) || count <= 0) throw new GameError('Некорректное количество');

  const pool = await getPool(db, p.id);
  const available = Math.floor(pool[unitId] ?? 0);
  if (count > available) throw new GameError(`Доступно только ${available}`);

  const cost = recruitCost(p, unitId, count);
  if (!canAfford(p, cost)) throw new GameError('Не хватает ресурсов');

  const army = await getArmy(db, p.id);
  const existing = army.find((a) => a.unitId === unitId);
  if (!existing && army.length >= 7) throw new GameError('В бригаде только 7 мест');

  await pay(db, p, cost);
  await setPool(db, p.id, unitId, (pool[unitId] ?? 0) - count);
  if (existing) {
    await db.run(
      'UPDATE army SET count = count + ? WHERE player_id = ? AND slot = ?',
      count, p.id, existing.slot,
    );
  } else {
    const used = army.map((a) => a.slot);
    let slot = -1;
    for (let i = 0; i < 7; i++) if (!used.includes(i)) { slot = i; break; }
    if (slot < 0) throw new GameError('Нет свободных мест в бригаде');
    await db.run(
      'INSERT INTO army (player_id, slot, unit_id, count) VALUES (?, ?, ?, ?)',
      p.id, slot, unitId, count,
    );
  }
}

/* ── Постройки ───────────────────────────────────────────────────── */

export async function build(db: Db, p: PlayerRow, key: string): Promise<void> {
  const b = await getBuildings(db, p.id);
  const recruitDef = RECRUIT_BUILDINGS.find((x) => x.key === key);
  const specialDef = SPECIAL_BUILDINGS.find((x) => x.key === key);

  if (recruitDef) {
    if (b[key]) throw new GameError('Уже построено');
    const prev = RECRUIT_BUILDINGS.find((x) => x.tier === recruitDef.tier - 1);
    if (prev && !b[prev.key]) throw new GameError(`Сначала нужен «${prev.name}»`);
    if (!canAfford(p, recruitDef.cost)) throw new GameError('Не хватает ресурсов');
    await pay(db, p, recruitDef.cost);
    await db.run('INSERT INTO buildings (player_id, key, level) VALUES (?, ?, 1)', p.id, key);
    return;
  }

  if (specialDef) {
    const level = (b[key] ?? 0) + 1;
    if (level > specialDef.maxLevel) throw new GameError('Максимальный уровень');
    const cost = specialDef.cost(level);
    if (!canAfford(p, cost)) throw new GameError('Не хватает ресурсов');
    await pay(db, p, cost);
    await db.run(
      `INSERT INTO buildings (player_id, key, level) VALUES (?, ?, ?)
       ON CONFLICT(player_id, key) DO UPDATE SET level = excluded.level`,
      p.id, key, level,
    );
    return;
  }

  throw new GameError('Нет такого здания');
}

export async function buildSpot(db: Db, p: PlayerRow, key: string): Promise<void> {
  const def = SPOTS_BY_KEY[key];
  if (!def) throw new GameError('Нет такой точки');
  const spots = await getSpots(db, p.id);
  if (spots.some((s) => s.key === key)) throw new GameError('Такая точка уже есть');
  if (spots.length >= spotSlots(p.level)) throw new GameError('Нет свободных слотов под точки');
  if (!canAfford(p, def.buildCost)) throw new GameError('Не хватает ресурсов');
  await pay(db, p, def.buildCost);
  await db.run('INSERT INTO spots (player_id, key, level) VALUES (?, ?, 1)', p.id, key);
}

export async function upgradeSpot(db: Db, p: PlayerRow, key: string): Promise<void> {
  const def = SPOTS_BY_KEY[key];
  if (!def) throw new GameError('Нет такой точки');
  const spots = await getSpots(db, p.id);
  const spot = spots.find((s) => s.key === key);
  if (!spot) throw new GameError('Точка не построена');
  if (spot.level >= 3) throw new GameError('Максимальный уровень');
  const m = Math.pow(2.5, spot.level);
  const cost: Cost = {};
  for (const k of RESOURCE_KEYS) {
    const v = def.buildCost[k] ?? 0;
    if (v) cost[k] = Math.round(v * m);
  }
  if (!canAfford(p, cost)) throw new GameError('Не хватает ресурсов');
  await pay(db, p, cost);
  await db.run('UPDATE spots SET level = level + 1 WHERE player_id = ? AND key = ?', p.id, key);
}

/* ── Герой ───────────────────────────────────────────────────────── */

export interface HeroStats {
  attack: number;
  defense: number;
  power: number;
  knowledge: number;
  morale: number;
  luck: number;
  speedBonus: number;
}

export async function heroStats(db: Db, p: PlayerRow): Promise<HeroStats> {
  const a = await equippedBonuses(db, p.id);
  return {
    attack: p.atk + a.attack,
    defense: p.def + a.defense,
    power: p.power + a.power,
    knowledge: p.knowledge + a.knowledge,
    morale: a.morale + (p.hero_class === 'dj' ? 1 : 0),
    luck: a.luck + (p.hero_class === 'dj' ? 1 : 0),
    speedBonus: a.speed,
  };
}

/** Собирает героя для боевого движка: статы, приёмы, перки класса. */
export async function battleHero(db: Db, p: PlayerRow): Promise<BattleHero> {
  const s = await heroStats(db, p);
  const b = await getBuildings(db, p.id);
  const arts = await equippedBonuses(db, p.id);
  const cls = HERO_CLASSES[p.hero_class];
  const known = new Set(abilitiesForGuild(b.sigarnaya ?? 1));
  if (cls) known.add(cls.startAbility);

  return {
    name: p.name,
    faction: p.faction as FactionId,
    attack: s.attack,
    defense: s.defense,
    power: s.power,
    knowledge: s.knowledge + Math.floor(arts.manaFlat / 10),
    morale: s.morale,
    luck: s.luck,
    speedBonus: s.speedBonus,
    spellCostMul: 1 + arts.spellCostPct / 100,
    spellSchoolMul: p.hero_class === 'oper' ? { control: 0.7 } : undefined,
    damagePct: p.hero_class === 'avtoritet' ? 5 : 0,
    abilities: [...known].filter((id) => ABILITIES[id]),
  };
}

export async function armyInput(db: Db, playerId: number): Promise<ArmyStackInput[]> {
  const army = await getArmy(db, playerId);
  return army.map((a) => ({ unitId: a.unitId, count: a.count }));
}

export async function playerPower(db: Db, p: PlayerRow): Promise<number> {
  const s = await heroStats(db, p);
  return totalPower(await armyInput(db, p.id), s);
}

/** Начисляет опыт и повышает уровень, распределяя очки по весам класса. */
export async function addXp(db: Db, p: PlayerRow, xp: number): Promise<{ levelsGained: number }> {
  const before = p.level;
  p.xp += xp;
  const lvl = levelFromXp(p.xp);
  const gained = Math.max(0, lvl - before);
  const weights = HERO_CLASSES[p.hero_class]?.growth ?? [25, 25, 25, 25];
  const total = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < gained; i++) {
    // детерминированное распределение: по кругу, пропорционально весам
    const roll = ((before + i) * 37) % total;
    let acc = 0;
    let idx = 0;
    for (let k = 0; k < weights.length; k++) {
      acc += weights[k];
      if (roll < acc) { idx = k; break; }
    }
    if (idx === 0) p.atk++;
    else if (idx === 1) p.def++;
    else if (idx === 2) p.power++;
    else p.knowledge++;
  }
  p.level = lvl;
  await updatePlayer(db, p.id, {
    xp: p.xp, level: p.level, atk: p.atk, def: p.def, power: p.power, knowledge: p.knowledge,
  });
  return { levelsGained: gained };
}

/* ── Снапшот состояния для клиента ───────────────────────────────── */

export async function stateSnapshot(db: Db, p: PlayerRow) {
  await accrue(db, p);
  const [buildings, spots, pool, arts, s, inc, cap, fmax, power, army] = await Promise.all([
    getBuildings(db, p.id),
    getSpots(db, p.id),
    getPool(db, p.id),
    getArtifacts(db, p.id),
    heroStats(db, p),
    incomePerTick(db, p),
    vaultCap(db, p),
    fuelMax(db, p),
    playerPower(db, p),
    getArmy(db, p.id),
  ]);

  return {
    player: {
      id: p.id,
      name: p.name,
      faction: p.faction,
      factionName: FACTIONS[p.faction as FactionId]?.name ?? p.faction,
      heroClass: p.hero_class,
      heroClassName: HERO_CLASSES[p.hero_class]?.name ?? p.hero_class,
      level: p.level,
      xp: p.xp,
      xpCurrent: xpForLevel(p.level),
      xpNext: xpForLevel(p.level + 1),
      rank: rankOf(p),
      stats: s,
      nal: p.nal,
      influence: p.influence,
      svyazi: p.svyazi,
      tovar: p.tovar,
      vaultCap: cap,
      fuel: p.fuel,
      fuelMax: fmax,
      rating: p.rating,
      wins: p.wins,
      losses: p.losses,
      power,
    },
    buildings,
    spots,
    spotSlots: spotSlots(p.level),
    army,
    pool: Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, Math.floor(v)])),
    artifacts: arts,
    incomePerTick: inc,
    nextIncomeIn: Math.max(0, INCOME_TICK_MS - (now() - p.income_at)),
    weekly: weeklyEvent(),
    roster: unitsOfFaction(p.faction as FactionId).map((u) => u.id),
  };
}

/** Стартовое состояние нового профиля. */
export async function seedNewPlayer(db: Db, p: PlayerRow): Promise<void> {
  await db.run('INSERT OR IGNORE INTO buildings (player_id, key, level) VALUES (?, ?, 1)', p.id, 'dvor');
  await db.run('INSERT OR IGNORE INTO buildings (player_id, key, level) VALUES (?, ?, 1)', p.id, 'sigarnaya');
  await db.run('INSERT OR IGNORE INTO spots (player_id, key, level) VALUES (?, ?, 1)', p.id, 'larek');
  const t1 = unitOfTier(p.faction as FactionId, 1);
  if (t1) {
    await db.run(
      'INSERT OR IGNORE INTO army (player_id, slot, unit_id, count) VALUES (?, 0, ?, ?)',
      p.id, t1.id, 20,
    );
    await setPool(db, p.id, t1.id, t1.growth);
  }
  for (const a of ['sportivka', 'kepka']) {
    if (ARTIFACTS[a]) {
      await db.run('INSERT INTO artifacts (player_id, art_id, equipped) VALUES (?, ?, 1)', p.id, a);
    }
  }
}

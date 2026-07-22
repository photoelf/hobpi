/**
 * Генерация нейтральных «дворов» для PvE — аналог wandering monsters из HoMM3.
 * Сила подбирается от силы бригады игрока, состав — от случайной фракции.
 */
import {
  ARTIFACT_LIST, DROP_WEIGHTS, FACTION_IDS, FACTIONS, armyPower, rng, unitsOfFaction,
} from '@hobpi/engine';
import type { ArmyStackInput, BattleHero, FactionId, Rarity } from '@hobpi/engine';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY: Record<Difficulty, { mul: number; name: string; reward: number }> = {
  easy: { mul: 0.55, name: 'Шпана у ларька', reward: 0.8 },
  normal: { mul: 0.9, name: 'Чужая бригада', reward: 1 },
  hard: { mul: 1.35, name: 'Серьёзные люди', reward: 1.5 },
};

const NAMES: Record<Difficulty, string[]> = {
  easy: ['Двор на Салова', 'Шпана у «Пятёрочки»', 'Пацаны с гаражей', 'Алкаши у ларька'],
  normal: ['Бригада с Обводного', 'Ребята из промзоны', 'Люди с рынка', 'Смена с автосервиса'],
  hard: ['Серьёзные с Крестовского', 'Охрана порта', 'Люди смотрящего', 'Бывшие спортсмены'],
};

export interface NeutralCamp {
  id: string;
  name: string;
  faction: FactionId;
  difficulty: Difficulty;
  army: ArmyStackInput[];
  power: number;
  hero: BattleHero;
  reward: { nal: number; tovar: number; influence: number; xp: number };
}

/** Собирает нейтральную армию с целевой силой `target`. */
function buildArmy(h: rng.RngHolder, faction: FactionId, target: number): ArmyStackInput[] {
  const line = unitsOfFaction(faction);
  // берём 3–5 тиров подряд, чем сильнее лагерь — тем выше стартовый тир
  const size = rng.nextInt(h, 3, 5);
  const maxStart = Math.max(0, line.length - size);
  const start = rng.nextInt(h, 0, maxStart);
  const chosen = line.slice(start, start + size);

  // пропорции по недельному приросту — как у живого игрока
  const weights = chosen.map((u) => u.growth);
  const draft: ArmyStackInput[] = chosen.map((u, i) => ({ unitId: u.id, count: weights[i] }));
  const base = armyPower(draft);
  if (base <= 0) return draft;
  const k = target / base;

  return draft
    .map((a) => ({ unitId: a.unitId, count: Math.max(1, Math.round(a.count * k)) }))
    .filter((a) => a.count > 0);
}

export function generateCamp(seed: number, playerPower: number, difficulty: Difficulty): NeutralCamp {
  const h: rng.RngHolder = { rng: seed >>> 0 };
  const faction = FACTION_IDS[rng.nextInt(h, 0, FACTION_IDS.length - 1)];
  const d = DIFFICULTY[difficulty];
  const target = Math.max(300, Math.round(playerPower * d.mul));
  const army = buildArmy(h, faction, target);
  const power = armyPower(army);
  const names = NAMES[difficulty];
  const heroLevel = Math.max(0, Math.round(Math.log2(Math.max(1, power / 500))));

  return {
    id: `${difficulty}:${seed}`,
    name: names[rng.nextInt(h, 0, names.length - 1)],
    faction,
    difficulty,
    army,
    power,
    hero: {
      name: FACTIONS[faction].name,
      faction,
      attack: heroLevel,
      defense: heroLevel,
      power: Math.floor(heroLevel / 2),
      knowledge: Math.floor(heroLevel / 2),
      morale: 0,
      luck: 0,
      abilities: heroLevel >= 3 ? ['zapugivanie', 'adrenalin'] : [],
    },
    reward: {
      nal: Math.round(power * 0.32 * d.reward),
      tovar: Math.round(power * 0.002 * d.reward),
      influence: difficulty === 'hard' ? 1 : 0,
      xp: Math.round(power / 8),
    },
  };
}

/** Три лагеря на выбор: лёгкий, обычный, сложный. Обновляются каждые 30 минут. */
export function campsFor(playerPower: number, epoch: number): NeutralCamp[] {
  return (['easy', 'normal', 'hard'] as Difficulty[]).map((d, i) =>
    generateCamp((epoch * 7919 + i * 104729) >>> 0, playerPower, d),
  );
}

/** Дроп артефакта: шанс зависит от сложности, редкость — от весов. */
export function rollArtifact(seed: number, difficulty: Difficulty): string | null {
  const h: rng.RngHolder = { rng: seed >>> 0 };
  const chance = difficulty === 'hard' ? 0.35 : difficulty === 'normal' ? 0.18 : 0.07;
  if (!rng.chance(h, chance)) return null;

  const total = Object.values(DROP_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng.next(h) * total;
  let rarity: Rarity = 'common';
  for (const [r, w] of Object.entries(DROP_WEIGHTS)) {
    roll -= w;
    if (roll <= 0) { rarity = r as Rarity; break; }
  }
  const pool = ARTIFACT_LIST.filter((a) => a.rarity === rarity);
  if (!pool.length) return null;
  return pool[rng.nextInt(h, 0, pool.length - 1)].id;
}

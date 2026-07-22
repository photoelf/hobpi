import type { ArmyStackInput, UnitDef } from './types.ts';
import { UNITS } from './content/units.ts';

/**
 * Оценка боевой ценности бойца (аналог AI Value из HoMM3).
 * Используется для матчмейкинга PvP, генерации PvE-нейтралов и выдачи XP.
 * Абсолютные числа значения не имеют — важны только отношения.
 */
export function unitPower(u: UnitDef): number {
  const avgDmg = (u.minDmg + u.maxDmg) / 2;
  const offense = (u.attack + 5) * avgDmg;
  const survivability = (u.defense + 5) * u.hp;
  let v = Math.sqrt(offense * survivability) * (1 + u.speed / 25);

  // премия за свойства, меняющие исход боя
  const bonus: Record<string, number> = {
    SHOOTER: 0.25,
    FLYER: 0.12,
    NO_RETALIATION: 0.15,
    DOUBLE_STRIKE: 0.3,
    BLINK: 0.18,
    RESURRECT: 0.35,
    ARMOR_BREAK: 0.15,
    SPLASH_NEIGHBORS: 0.2,
    STUN_ONCE: 0.15,
    AURA_MORALE: 0.12,
    AURA_LUCK: 0.12,
    HEAL: 0.15,
    SHIELD_NEIGHBORS: 0.12,
    TAUNT: 0.08,
    SLOW_ON_HIT: 0.08,
    DEBUFF_ATTACK: 0.08,
    DEBUFF_DEFENSE: 0.08,
    LUCKY: 0.06,
    MELEE_NO_PENALTY: 0.05,
  };
  let mul = 1;
  for (const t of u.traits) mul += bonus[t] ?? 0;
  return Math.round(v * mul);
}

export function armyPower(army: ArmyStackInput[]): number {
  let total = 0;
  for (const a of army) {
    const u = UNITS[a.unitId];
    if (!u) continue;
    total += unitPower(u) * a.count;
  }
  return Math.round(total);
}

/** Вклад героя в общую силу: статы усиливают всю бригаду. */
export function heroMultiplier(attack: number, defense: number, power: number): number {
  return 1 + attack * 0.04 + defense * 0.03 + power * 0.02;
}

export function totalPower(
  army: ArmyStackInput[],
  hero: { attack: number; defense: number; power: number },
): number {
  return Math.round(armyPower(army) * heroMultiplier(hero.attack, hero.defense, hero.power));
}

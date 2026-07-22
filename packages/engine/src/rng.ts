/**
 * Детерминированный PRNG mulberry32.
 * Состояние — одно 32-битное число, живёт внутри BattleState, поэтому
 * любой бой полностью воспроизводится из seed + списка действий.
 */

export interface RngHolder {
  rng: number;
}

/** [0, 1) */
export function next(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** целое из [min, max] включительно */
export function nextInt(h: RngHolder, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(next(h) * (max - min + 1));
}

/** true с вероятностью p */
export function chance(h: RngHolder, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return next(h) < p;
}

/** случайный 32-битный seed (для генерации боёв на сервере) */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

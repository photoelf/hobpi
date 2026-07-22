/**
 * Эвристический ИИ. Обслуживает нейтралов в PvE и обороняющегося в асинхронном PvP.
 * Жадный: оценивает каждый доступный ход и берёт лучший. Без просчёта на ход вперёд —
 * этого достаточно до v0.4 (см. docs/10-roadmap.md).
 */
import type { Action, BattleState, Side, Stack } from './types.ts';
import {
  activeStack, applyAction, byId, distance, effAttack, effDefense, effSpeed,
  isAlive, legalCasts, legalMoves, reachable, unitOf,
} from './battle.ts';
import { unitPower } from './power.ts';

/** Средний ожидаемый урон без обращения к RNG. */
function estimateDamage(state: BattleState, att: Stack, def: Stack, ranged: boolean): number {
  const u = unitOf(att);
  const base = ((u.minDmg + u.maxDmg) / 2) * att.count;
  const A = effAttack(state, att);
  const D = effDefense(state, def);
  let mult = 1;
  if (A > D) mult = Math.min(4, 1 + 0.05 * (A - D));
  else if (D > A) mult = Math.max(0.3, 1 - 0.025 * (D - A));
  if (u.shots > 0) {
    if (!ranged) mult *= 0.5;
    else if (distance(att, def) > 8) mult *= 0.5;
  }
  return base * mult;
}

function killsFrom(def: Stack, dmg: number): number {
  const u = unitOf(def);
  if (dmg < def.hpTop) return 0;
  return Math.min(def.count, 1 + Math.floor((dmg - def.hpTop) / u.hp));
}

/** Насколько цель «вкусная»: стрелки и хилеры выше приоритет. */
function threatWeight(s: Stack): number {
  const u = unitOf(s);
  let w = 1;
  if (u.shots > 0) w += 0.6;
  if (u.traits.includes('HEAL') || u.traits.includes('RESURRECT')) w += 0.5;
  if (u.traits.includes('AURA_MORALE') || u.traits.includes('AURA_LUCK')) w += 0.3;
  return w;
}

function targetScore(state: BattleState, att: Stack, def: Stack, ranged: boolean): number {
  const dmg = estimateDamage(state, att, def, ranged);
  const kills = killsFrom(def, dmg);
  const pv = unitPower(unitOf(def));
  return (dmg * pv) / Math.max(1, unitOf(def).hp) + kills * pv * 0.5 * threatWeight(def);
}

function retaliationCost(state: BattleState, att: Stack, def: Stack): number {
  if (unitOf(att).traits.includes('NO_RETALIATION') || def.retaliated) return 0;
  const dmg = estimateDamage(state, def, att, false);
  const kills = killsFrom(att, dmg);
  return kills * unitPower(unitOf(att)) * 0.6;
}

/** Выбирает действие для активного стека. */
export function chooseAction(state: BattleState): Action {
  const s = activeStack(state);
  const legal = legalMoves(state);
  if (!s || !legal) return { type: 'defend' };

  // 1. Лечение — если союзник потерял заметную часть стека
  if (legal.healTargets.length) {
    let best: { id: number; miss: number } | null = null;
    for (const id of legal.healTargets) {
      const t = byId(state, id);
      const u = unitOf(t);
      const miss = (t.initialCount - t.count) * u.hp + (u.hp - t.hpTop);
      if (miss > u.hp * 0.5 && (!best || miss > best.miss)) best = { id, miss };
    }
    if (best) return { type: 'heal', targetId: best.id };
  }

  // 2. Выстрел
  let shootBest: { id: number; score: number } | null = null;
  for (const id of legal.shootTargets) {
    const score = targetScore(state, s, byId(state, id), true);
    if (!shootBest || score > shootBest.score) shootBest = { id, score };
  }

  // 3. Ближний бой
  let meleeBest: { t: (typeof legal.meleeTargets)[number]; score: number } | null = null;
  for (const t of legal.meleeTargets) {
    const def = byId(state, t.targetId);
    const score = targetScore(state, s, def, false) - retaliationCost(state, s, def);
    if (!meleeBest || score > meleeBest.score) meleeBest = { t, score };
  }

  if (shootBest && (!meleeBest || shootBest.score >= meleeBest.score)) {
    return { type: 'shoot', targetId: shootBest.id };
  }
  if (meleeBest && meleeBest.score > 0) {
    return { type: 'attack', targetId: meleeBest.t.targetId, x: meleeBest.t.x, y: meleeBest.t.y };
  }

  // 4. Сближение с самой ценной целью
  const enemies = state.stacks.filter((o) => o.side !== s.side && isAlive(o));
  if (enemies.length && legal.moveCells.length) {
    const target = enemies
      .map((e) => ({ e, v: unitPower(unitOf(e)) * e.count * threatWeight(e) }))
      .sort((a, b) => b.v - a.v)[0].e;
    let best: { x: number; y: number; d: number } | null = null;
    const reach = reachable(state, s);
    for (const c of legal.moveCells) {
      const d = Math.max(Math.abs(c.x - target.x), Math.abs(c.y - target.y));
      const steps = reach.get(c.y * 100 + c.x) ?? 99;
      // при равной дистанции предпочитаем не тратить лишние шаги
      if (!best || d < best.d || (d === best.d && steps < (best as any).steps)) {
        best = { x: c.x, y: c.y, d };
        (best as any).steps = steps;
      }
    }
    if (best) {
      const now = Math.max(Math.abs(s.x - target.x), Math.abs(s.y - target.y));
      if (best.d < now) return { type: 'move', x: best.x, y: best.y };
    }
  }

  // 5. Стрелок без патронов и без целей — ждёт, остальные защищаются
  if (legal.canWait && unitOf(s).shots > 0 && s.shotsLeft === 0) return { type: 'wait' };
  if (meleeBest) {
    return { type: 'attack', targetId: meleeBest.t.targetId, x: meleeBest.t.x, y: meleeBest.t.y };
  }
  return { type: 'defend' };
}

/** Решает, применить ли приём героя. Возвращает действие или null. */
export function chooseCast(state: BattleState, side: Side): Action | null {
  if (state.round < 2) return null;
  const available = legalCasts(state, side);
  if (!available.length) return null;

  const enemies = state.stacks.filter((s) => s.side !== side && isAlive(s));
  const allies = state.stacks.filter((s) => s.side === side && isAlive(s));
  if (!enemies.length || !allies.length) return null;

  const strongestEnemy = enemies
    .map((e) => ({ e, v: unitPower(unitOf(e)) * e.count }))
    .sort((a, b) => b.v - a.v)[0].e;

  const woundedAlly = allies
    .map((a) => ({ a, miss: (a.initialCount - a.count) * unitOf(a).hp }))
    .sort((x, y) => y.miss - x.miss)[0];

  // приоритет: убрать угрозу → усилить своих → добить
  const order = ['oblava', 'naezd', 'zapugivanie', 'fonarik', 'sanitary', 'sbor', 'adrenalin'];
  for (const id of order) {
    if (!available.includes(id)) continue;
    switch (id) {
      case 'oblava':
      case 'naezd':
      case 'zapugivanie':
        return { type: 'cast', abilityId: id, targetId: strongestEnemy.id };
      case 'fonarik': {
        const shooter = enemies.find((e) => unitOf(e).shots > 0 && e.shotsLeft > 0);
        if (shooter) return { type: 'cast', abilityId: id, targetId: shooter.id };
        break;
      }
      case 'sanitary':
        if (woundedAlly && woundedAlly.miss > unitOf(woundedAlly.a).hp) {
          return { type: 'cast', abilityId: id, targetId: woundedAlly.a.id };
        }
        break;
      case 'sbor':
        if (allies.length >= 3) return { type: 'cast', abilityId: id };
        break;
      case 'adrenalin': {
        const fastest = allies.sort((a, b) => effSpeed(state, b) - effSpeed(state, a))[0];
        return { type: 'cast', abilityId: id, targetId: fastest.id };
      }
    }
  }
  return null;
}

/**
 * Прокручивает ходы, пока активный стек принадлежит ИИ-стороне.
 * `aiSides` — стороны под управлением ИИ.
 */
export function runAI(state: BattleState, aiSides: Side[], maxSteps = 5000): void {
  let guard = 0;
  while (!state.finished && guard++ < maxSteps) {
    const s = activeStack(state);
    if (!s || !aiSides.includes(s.side)) return;
    const cast = chooseCast(state, s.side);
    if (cast) {
      try {
        applyAction(state, cast);
      } catch {
        /* приём оказался нелегален — просто ходим */
      }
      if (state.finished) return;
      if (activeStack(state)?.id !== s.id) continue;
    }
    applyAction(state, chooseAction(state));
  }
}

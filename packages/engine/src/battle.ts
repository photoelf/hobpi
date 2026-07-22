/**
 * Ядро пошагового боя. Детерминированно: одинаковые (seed, setup, actions[])
 * всегда дают одинаковый лог. Работает и на сервере, и в браузере.
 *
 * Правила — docs/03-combat.md
 */
import type {
  Action, BattleResult, BattleSetup, BattleState, Effect,
  EffectKind, HeroState, Side, Stack, UnitDef,
} from './types.ts';
import { FACTIONS } from './content/factions.ts';
import { UNITS } from './content/units.ts';
import { ABILITIES } from './content/abilities.ts';
import * as R from './rng.ts';

export const FIELD_W = 12;
export const FIELD_H = 9;
export const MAX_ROUNDS = 30;
export const MAX_STACKS = 7;
/** Шаг вероятности на единицу морали/удачи (HoMM3: ~4.2%) */
const MORALE_STEP = 0.042;
const SHOOT_RANGE_PENALTY = 8;

/* ── Базовые хелперы ─────────────────────────────────────────────── */

export function unitOf(s: Stack): UnitDef {
  const u = UNITS[s.unitId];
  if (!u) throw new Error(`Неизвестный боец: ${s.unitId}`);
  return u;
}

export const isAlive = (s: Stack): boolean => s.count > 0;

export function byId(state: BattleState, id: number): Stack {
  const s = state.stacks.find((x) => x.id === id);
  if (!s) throw new Error(`Нет стека #${id}`);
  return s;
}

export function activeStack(state: BattleState): Stack | null {
  return state.activeId === null ? null : byId(state, state.activeId);
}

export function effHp(s: Stack): number {
  if (s.count <= 0) return 0;
  return (s.count - 1) * unitOf(s).hp + s.hpTop;
}

const cheb = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const distance = (a: Stack, b: Stack) => cheb(a.x, a.y, b.x, b.y);

export const adjacent = (a: Stack, b: Stack) => distance(a, b) === 1;

const key = (x: number, y: number) => y * 100 + x;

function has(s: Stack, trait: string): boolean {
  return unitOf(s).traits.includes(trait as never);
}

/* ── Эффекты и производные статы ─────────────────────────────────── */

function effSum(s: Stack, kind: EffectKind): number {
  let v = 0;
  for (const e of s.effects) if (e.kind === kind) v += e.value;
  return v;
}

function addEffect(state: BattleState, s: Stack, e: Effect): void {
  // одинаковый тег не стакается — обновляем длительность
  const existing = s.effects.find((x) => x.tag === e.tag);
  if (existing) {
    existing.rounds = Math.max(existing.rounds, e.rounds);
    existing.value = e.value;
  } else {
    s.effects.push(e);
  }
  state.log.push({
    t: 'effect', stackId: s.id, kind: e.kind, value: e.value, rounds: e.rounds, tag: e.tag,
  });
}

/** Максимальная аура среди живых союзников (ауры не складываются). */
function aura(state: BattleState, side: Side, trait: 'AURA_MORALE' | 'AURA_LUCK'): number {
  let best = 0;
  for (const s of state.stacks) {
    if (s.side !== side || !isAlive(s)) continue;
    const u = unitOf(s);
    if (!u.traits.includes(trait)) continue;
    best = Math.max(best, (trait === 'AURA_MORALE' ? u.auraMorale : u.auraLuck) ?? 1);
  }
  return best;
}

const clamp3 = (v: number) => Math.max(-3, Math.min(3, v));

export function moraleOf(state: BattleState, s: Stack): number {
  const hero = state.heroes[s.side];
  let m = hero.morale + aura(state, s.side, 'AURA_MORALE') + effSum(s, 'morale');
  if (FACTIONS[hero.faction].bonusKey === 'castle_morale') m += 1;
  // «наезд» гопников: в первом раунде противнику −1 мораль
  const foe = state.heroes[s.side === 'A' ? 'B' : 'A'];
  if (FACTIONS[foe.faction].bonusKey === 'inferno_intimidate' && state.round <= 1) m -= 1;
  return clamp3(m);
}

export function luckOf(state: BattleState, s: Stack): number {
  const hero = state.heroes[s.side];
  let l = hero.luck + aura(state, s.side, 'AURA_LUCK') + effSum(s, 'luck');
  if (has(s, 'LUCKY')) l += 1;
  return clamp3(l);
}

export function effSpeed(state: BattleState, s: Stack): number {
  const hero = state.heroes[s.side];
  return Math.max(1, unitOf(s).speed + (hero.speedBonus ?? 0) + effSum(s, 'speed'));
}

export function effAttack(state: BattleState, s: Stack): number {
  return Math.max(0, unitOf(s).attack + state.heroes[s.side].attack + effSum(s, 'attack'));
}

export function effDefense(state: BattleState, s: Stack): number {
  const base = unitOf(s).defense + state.heroes[s.side].defense + effSum(s, 'defense');
  const pct = effSum(s, 'defensePct') + (s.defending ? 30 : 0);
  return Math.max(0, base * (1 + pct / 100));
}

/* ── Создание боя ────────────────────────────────────────────────── */

/** Ряды расстановки для N стеков на поле высотой 9. */
function rowsFor(n: number, height: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round(((i + 0.5) * height) / n - 0.5));
  }
  // разводим дубликаты
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  const overflow = out[out.length - 1] - (height - 1);
  if (overflow > 0) for (let i = 0; i < out.length; i++) out[i] -= overflow;
  return out;
}

export function createBattle(setup: BattleSetup): BattleState {
  const width = setup.width ?? FIELD_W;
  const height = setup.height ?? FIELD_H;
  const stacks: Stack[] = [];
  let nextId = 1;

  for (const side of ['A', 'B'] as Side[]) {
    const army = setup[side].army.filter((a) => a.count > 0).slice(0, MAX_STACKS);
    const rows = rowsFor(Math.max(1, army.length), height);
    army.forEach((a, i) => {
      const u = UNITS[a.unitId];
      if (!u) throw new Error(`Неизвестный боец: ${a.unitId}`);
      stacks.push({
        id: nextId++,
        slot: i,
        unitId: a.unitId,
        side,
        count: a.count,
        hpTop: u.hp,
        x: side === 'A' ? 0 : width - 1,
        y: rows[i],
        shotsLeft: u.shots,
        retaliated: false,
        defending: false,
        waited: false,
        stunned: 0,
        used: [],
        effects: [],
        initialCount: a.count,
      });
    });
  }

  const mkHero = (side: Side): HeroState => ({
    ...setup[side].hero,
    mana: Math.max(0, setup[side].hero.knowledge * 10),
    castThisRound: false,
  });

  const state: BattleState = {
    width,
    height,
    rng: setup.seed >>> 0,
    round: 0,
    stacks,
    heroes: { A: mkHero('A'), B: mkHero('B') },
    queue: [],
    waitQueue: [],
    activeId: null,
    moraleUsed: false,
    finished: false,
    winner: null,
    log: [],
    steps: 0,
  };

  beginRound(state);
  advance(state);
  return state;
}

/* ── Раунды и очередь ────────────────────────────────────────────── */

function beginRound(state: BattleState): void {
  if (state.round >= MAX_ROUNDS) {
    endByHp(state);
    return;
  }
  state.round++;
  state.log.push({ t: 'round', n: state.round });

  for (const s of state.stacks) {
    s.retaliated = false;
    s.waited = false;
    s.effects = s.effects
      .map((e) => (e.rounds > 0 ? { ...e, rounds: e.rounds - 1 } : e))
      .filter((e) => e.rounds !== 0);
  }
  state.heroes.A.castThisRound = false;
  state.heroes.B.castThisRound = false;

  state.queue = state.stacks
    .filter(isAlive)
    .sort(
      (a, b) =>
        effSpeed(state, b) - effSpeed(state, a) ||
        (a.side === b.side ? 0 : a.side === 'A' ? -1 : 1) ||
        a.id - b.id,
    )
    .map((s) => s.id);
  state.waitQueue = [];
}

function endByHp(state: BattleState): void {
  const hpA = state.stacks.filter((s) => s.side === 'A').reduce((a, s) => a + effHp(s), 0);
  const hpB = state.stacks.filter((s) => s.side === 'B').reduce((a, s) => a + effHp(s), 0);
  finish(state, hpA === hpB ? null : hpA > hpB ? 'A' : 'B');
}

function finish(state: BattleState, winner: Side | null): void {
  state.finished = true;
  state.winner = winner;
  state.activeId = null;
  state.log.push({ t: 'end', winner });
}

function checkEnd(state: BattleState): void {
  if (state.finished) return;
  const a = state.stacks.some((s) => s.side === 'A' && isAlive(s));
  const b = state.stacks.some((s) => s.side === 'B' && isAlive(s));
  if (!a || !b) finish(state, !a && !b ? null : a ? 'A' : 'B');
}

/** Выбирает следующий активный стек, прокручивая пропуски ходов. */
function advance(state: BattleState): void {
  for (;;) {
    checkEnd(state);
    if (state.finished) return;
    if (++state.steps > 20000) {
      endByHp(state);
      return;
    }

    state.queue = state.queue.filter((id) => isAlive(byId(state, id)));
    state.waitQueue = state.waitQueue.filter((id) => isAlive(byId(state, id)));

    let id: number | undefined;
    if (state.queue.length) {
      id = state.queue[0];
    } else if (state.waitQueue.length) {
      // отложившие ходят после всех, по возрастанию скорости (правило HoMM3)
      state.waitQueue.sort(
        (a, b) => effSpeed(state, byId(state, a)) - effSpeed(state, byId(state, b)) || a - b,
      );
      id = state.waitQueue[0];
    }

    if (id === undefined) {
      beginRound(state);
      if (state.finished) return;
      continue;
    }

    const s = byId(state, id);
    state.activeId = id;
    state.moraleUsed = false;
    s.defending = false;
    state.log.push({ t: 'turn', stackId: id });

    if (s.stunned > 0) {
      s.stunned--;
      popActive(state);
      continue;
    }

    const m = moraleOf(state, s);
    if (m < 0 && R.chance(state, Math.min(0.9, -m * MORALE_STEP))) {
      state.log.push({ t: 'morale', stackId: id, good: false });
      popActive(state);
      continue;
    }

    // «Легенда района» поднимает павших автоматически, один раз за бой
    if (has(s, 'RESURRECT') && !s.used.includes('RESURRECT')) {
      const wounded = state.stacks
        .filter((o) => o.side === s.side && isAlive(o) && o.count < o.initialCount)
        .sort((a, b) => b.initialCount - b.count - (a.initialCount - a.count))[0];
      if (wounded) {
        s.used.push('RESURRECT');
        const amount = s.count * 30;
        const res = healStack(wounded, amount, true);
        state.log.push({
          t: 'heal', stackId: s.id, targetId: wounded.id, amount: res.healed, revived: res.revived,
        });
      }
    }

    return; // ход за игроком/ИИ
  }
}

/** Снимает активный стек с очереди и передаёт ход дальше. */
function popActive(state: BattleState): void {
  const id = state.activeId;
  if (id === null) return;
  state.queue = state.queue.filter((x) => x !== id);
  state.waitQueue = state.waitQueue.filter((x) => x !== id);
  state.activeId = null;
  advance(state);
}

/** Завершает ход стека с проверкой доп. хода по морали. */
function endTurn(state: BattleState): void {
  const id = state.activeId;
  if (id === null) return;
  const s = byId(state, id);
  if (!state.moraleUsed && isAlive(s)) {
    const m = moraleOf(state, s);
    if (m > 0 && R.chance(state, m * MORALE_STEP)) {
      state.moraleUsed = true;
      s.defending = false;
      state.log.push({ t: 'morale', stackId: id, good: true });
      checkEnd(state);
      return; // тот же стек ходит ещё раз
    }
  }
  popActive(state);
}

/* ── Перемещение ─────────────────────────────────────────────────── */

function occupiedSet(state: BattleState, except?: number): Set<number> {
  const set = new Set<number>();
  for (const s of state.stacks) {
    if (!isAlive(s) || s.id === except) continue;
    set.add(key(s.x, s.y));
  }
  return set;
}

/** Клетки, доступные стеку в этот ход: cellKey → число шагов. */
export function reachable(state: BattleState, s: Stack): Map<number, number> {
  const out = new Map<number, number>();
  const speed = effSpeed(state, s);
  const blocked = occupiedSet(state, s.id);
  out.set(key(s.x, s.y), 0);

  if (has(s, 'BLINK')) {
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (!blocked.has(key(x, y))) out.set(key(x, y), 1);
      }
    }
    return out;
  }

  if (has(s, 'FLYER')) {
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const d = cheb(s.x, s.y, x, y);
        if (d <= speed && !blocked.has(key(x, y))) out.set(key(x, y), d);
      }
    }
    return out;
  }

  const q: Array<[number, number, number]> = [[s.x, s.y, 0]];
  while (q.length) {
    const [x, y, d] = q.shift()!;
    if (d >= speed) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const k = key(nx, ny);
        if (blocked.has(k) || out.has(k)) continue;
        out.set(k, d + 1);
        q.push([nx, ny, d + 1]);
      }
    }
  }
  return out;
}

function moveTo(state: BattleState, s: Stack, x: number, y: number): void {
  if (s.x === x && s.y === y) return;
  const fx = s.x;
  const fy = s.y;
  s.x = x;
  s.y = y;
  state.log.push({ t: 'move', stackId: s.id, fx, fy, tx: x, ty: y });
}

/* ── Урон ────────────────────────────────────────────────────────── */

function shieldedBy(state: BattleState, target: Stack): boolean {
  return state.stacks.some(
    (o) => o.side === target.side && o.id !== target.id && isAlive(o) &&
      has(o, 'SHIELD_NEIGHBORS') && adjacent(o, target),
  );
}

function rollDamage(
  state: BattleState,
  att: Stack,
  def: Stack,
  ranged: boolean,
): { dmg: number; lucky: boolean } {
  const u = unitOf(att);
  const base = R.nextInt(state, u.minDmg, u.maxDmg) * att.count;
  const A = effAttack(state, att);
  const D = effDefense(state, def);

  let mult = 1;
  if (A > D) mult = Math.min(4, 1 + 0.05 * (A - D));
  else if (D > A) mult = Math.max(0.3, 1 - 0.025 * (D - A));

  if (u.shots > 0) {
    const heroFaction = FACTIONS[state.heroes[att.side].faction].bonusKey;
    const noPenalty = heroFaction === 'tower_melee' || has(att, 'MELEE_NO_PENALTY');
    if (!ranged && !noPenalty) mult *= 0.5;
    if (ranged && distance(att, def) > SHOOT_RANGE_PENALTY) mult *= 0.5;
  }

  // ярость качалки: первые 3 раунда +10%
  if (FACTIONS[state.heroes[att.side].faction].bonusKey === 'stronghold_rush' && state.round <= 3) {
    mult *= 1.1;
  }

  mult *= 1 + (effSum(att, 'damagePct') + (state.heroes[att.side].damagePct ?? 0)) / 100;
  if (shieldedBy(state, def)) mult *= 0.75;

  let lucky = false;
  const luck = luckOf(state, att);
  if (luck > 0 && R.chance(state, luck * MORALE_STEP)) {
    mult *= 2;
    lucky = true;
  } else if (luck < 0 && R.chance(state, -luck * MORALE_STEP)) {
    mult *= 0.5;
  }

  return { dmg: Math.max(1, Math.floor(base * mult)), lucky };
}

/** Наносит урон стеку. Возвращает число убитых бойцов. */
function applyDamage(state: BattleState, s: Stack, dmg: number): number {
  const u = unitOf(s);
  const before = s.count;
  let rest = dmg;
  if (rest >= s.hpTop) {
    rest -= s.hpTop;
    s.count -= 1;
    if (s.count > 0) {
      const extraKills = Math.min(s.count, Math.floor(rest / u.hp));
      s.count -= extraKills;
      rest -= extraKills * u.hp;
      s.hpTop = s.count > 0 ? u.hp - rest : 0;
      if (s.hpTop <= 0 && s.count > 0) {
        s.count -= 1;
        s.hpTop = s.count > 0 ? u.hp : 0;
      }
    } else {
      s.hpTop = 0;
    }
  } else {
    s.hpTop -= rest;
  }
  if (s.count <= 0) {
    s.count = 0;
    s.hpTop = 0;
    state.log.push({ t: 'death', stackId: s.id });
  }
  return before - s.count;
}

function healStack(s: Stack, amount: number, allowRevive: boolean): { healed: number; revived: number } {
  const u = unitOf(s);
  if (s.count <= 0) return { healed: 0, revived: 0 };
  let healed = Math.min(amount, u.hp - s.hpTop);
  s.hpTop += healed;
  let rest = amount - healed;
  let revived = 0;
  if (allowRevive && rest > 0 && s.count < s.initialCount) {
    revived = Math.min(s.initialCount - s.count, Math.floor(rest / u.hp));
    s.count += revived;
    healed += revived * u.hp;
  }
  return { healed, revived };
}

function applyOnHit(state: BattleState, att: Stack, def: Stack): void {
  if (!isAlive(def)) return;
  if (has(att, 'SLOW_ON_HIT')) {
    addEffect(state, def, { kind: 'speed', value: -2, rounds: 1, positive: false, tag: 'slow' });
  }
  if (has(att, 'ARMOR_BREAK')) {
    addEffect(state, def, { kind: 'defensePct', value: -40, rounds: -1, positive: false, tag: 'armorbreak' });
  }
  if (has(att, 'DEBUFF_ATTACK')) {
    addEffect(state, def, { kind: 'attack', value: -2, rounds: 2, positive: false, tag: 'debuff_atk' });
  }
  if (has(att, 'DEBUFF_DEFENSE')) {
    addEffect(state, def, { kind: 'defensePct', value: -15, rounds: 2, positive: false, tag: 'debuff_def' });
  }
  if (has(att, 'STUN_ONCE') && !att.used.includes('STUN_ONCE')) {
    att.used.push('STUN_ONCE');
    def.stunned = Math.max(def.stunned, 1);
    addEffect(state, def, { kind: 'morale', value: -1, rounds: 1, positive: false, tag: 'stun' });
  }
}

function strike(
  state: BattleState,
  att: Stack,
  def: Stack,
  opts: { ranged: boolean; retaliation: boolean },
): void {
  if (!isAlive(att) || !isAlive(def)) return;
  const { dmg, lucky } = rollDamage(state, att, def, opts.ranged);
  const kills = applyDamage(state, def, dmg);
  state.log.push({
    t: 'attack', stackId: att.id, targetId: def.id, dmg, kills,
    ranged: opts.ranged, retaliation: opts.retaliation, lucky,
  });

  if (has(att, 'SPLASH_NEIGHBORS')) {
    for (const o of state.stacks) {
      if (o.side === def.side && o.id !== def.id && isAlive(o) && adjacent(o, def)) {
        const splash = Math.max(1, Math.floor(dmg * 0.5));
        const k = applyDamage(state, o, splash);
        state.log.push({
          t: 'attack', stackId: att.id, targetId: o.id, dmg: splash, kills: k,
          ranged: opts.ranged, retaliation: false, lucky: false,
        });
      }
    }
  }

  if (!opts.retaliation) applyOnHit(state, att, def);
}

/* ── Действия ────────────────────────────────────────────────────── */

export interface MeleeTarget {
  targetId: number;
  x: number;
  y: number;
}

export interface LegalMoves {
  stackId: number;
  moveCells: Array<{ x: number; y: number }>;
  meleeTargets: MeleeTarget[];
  shootTargets: number[];
  healTargets: number[];
  canWait: boolean;
  canDefend: boolean;
}

/** Есть ли рядом живой враг (блокирует стрельбу). */
function enemyAdjacent(state: BattleState, s: Stack): boolean {
  return state.stacks.some((o) => o.side !== s.side && isAlive(o) && adjacent(o, s));
}

/** Провокация: если рядом стоит враг с TAUNT — бить можно только его. */
function tauntFilter(state: BattleState, s: Stack, targets: Stack[]): Stack[] {
  const taunters = state.stacks.filter(
    (o) => o.side !== s.side && isAlive(o) && has(o, 'TAUNT') && adjacent(o, s),
  );
  if (!taunters.length) return targets;
  const ids = new Set(taunters.map((t) => t.id));
  const filtered = targets.filter((t) => ids.has(t.id));
  return filtered.length ? filtered : targets;
}

export function legalMoves(state: BattleState): LegalMoves | null {
  const s = activeStack(state);
  if (!s || state.finished) return null;
  const reach = reachable(state, s);
  const occupied = occupiedSet(state, s.id);

  const moveCells: Array<{ x: number; y: number }> = [];
  for (const k of reach.keys()) {
    const x = k % 100;
    const y = Math.floor(k / 100);
    if (x === s.x && y === s.y) continue;
    if (!occupied.has(k)) moveCells.push({ x, y });
  }

  const enemies = state.stacks.filter((o) => o.side !== s.side && isAlive(o));
  const melee: MeleeTarget[] = [];
  for (const e of tauntFilter(state, s, enemies)) {
    let best: MeleeTarget | null = null;
    let bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const cx = e.x + dx;
        const cy = e.y + dy;
        if (cx < 0 || cy < 0 || cx >= state.width || cy >= state.height) continue;
        const k = key(cx, cy);
        const isSelf = cx === s.x && cy === s.y;
        if (!isSelf && (occupied.has(k) || !reach.has(k))) continue;
        const d = isSelf ? -1 : reach.get(k)!;
        if (d < bestD) {
          bestD = d;
          best = { targetId: e.id, x: cx, y: cy };
        }
      }
    }
    if (best) melee.push(best);
  }

  const canShoot = unitOf(s).shots > 0 && s.shotsLeft > 0 && !enemyAdjacent(state, s);
  const shootTargets = canShoot ? enemies.map((e) => e.id) : [];

  const healTargets = has(s, 'HEAL')
    ? state.stacks
        .filter(
          (o) => o.side === s.side && o.id !== s.id && isAlive(o) &&
            adjacent(o, s) && (o.hpTop < unitOf(o).hp || o.count < o.initialCount),
        )
        .map((o) => o.id)
    : [];

  return {
    stackId: s.id,
    moveCells,
    meleeTargets: melee,
    shootTargets,
    healTargets,
    canWait: !s.waited,
    canDefend: true,
  };
}

/** Список приёмов, доступных герою прямо сейчас. */
export function legalCasts(state: BattleState, side: Side): string[] {
  const h = state.heroes[side];
  if (state.finished || h.castThisRound) return [];
  return h.abilities.filter((id) => {
    const a = ABILITIES[id];
    return a && manaCost(h, a.id) <= h.mana;
  });
}

export function manaCost(h: HeroState, abilityId: string): number {
  const a = ABILITIES[abilityId];
  if (!a) return Infinity;
  const school = h.spellSchoolMul?.[a.school] ?? 1;
  return Math.max(1, Math.round(a.cost * (h.spellCostMul ?? 1) * school));
}

export class IllegalActionError extends Error {}

/** Применяет действие активного стека (или приём героя). Мутирует состояние. */
export function applyAction(state: BattleState, action: Action): void {
  if (state.finished) throw new IllegalActionError('Бой уже окончен');

  if (action.type === 'cast') {
    const s = activeStack(state);
    if (!s) throw new IllegalActionError('Нет активного стека');
    castAbility(state, s.side, action.abilityId, action.targetId, action.x, action.y);
    return;
  }

  const s = activeStack(state);
  if (!s) throw new IllegalActionError('Нет активного стека');
  const legal = legalMoves(state);
  if (!legal) throw new IllegalActionError('Нет доступных действий');

  switch (action.type) {
    case 'move': {
      const ok = legal.moveCells.some((c) => c.x === action.x && c.y === action.y);
      if (!ok) throw new IllegalActionError('Недостижимая клетка');
      moveTo(state, s, action.x, action.y);
      endTurn(state);
      return;
    }
    case 'attack': {
      const t = legal.meleeTargets.find(
        (m) => m.targetId === action.targetId && m.x === action.x && m.y === action.y,
      );
      if (!t) throw new IllegalActionError('Недоступная цель для атаки');
      const def = byId(state, action.targetId);
      moveTo(state, s, t.x, t.y);
      strike(state, s, def, { ranged: false, retaliation: false });
      if (isAlive(def) && isAlive(s) && !has(s, 'NO_RETALIATION') && !def.retaliated) {
        def.retaliated = true;
        strike(state, def, s, { ranged: false, retaliation: true });
      }
      if (has(s, 'DOUBLE_STRIKE') && isAlive(def) && isAlive(s)) {
        strike(state, s, def, { ranged: false, retaliation: false });
      }
      endTurn(state);
      return;
    }
    case 'shoot': {
      if (!legal.shootTargets.includes(action.targetId)) {
        throw new IllegalActionError('Нельзя стрелять по этой цели');
      }
      s.shotsLeft -= 1;
      const def = byId(state, action.targetId);
      strike(state, s, def, { ranged: true, retaliation: false });
      endTurn(state);
      return;
    }
    case 'heal': {
      if (!legal.healTargets.includes(action.targetId)) {
        throw new IllegalActionError('Нельзя лечить эту цель');
      }
      const t = byId(state, action.targetId);
      const pct = unitOf(s).healPct ?? 0.1;
      const amount = Math.round(unitOf(t).hp * t.initialCount * pct);
      const res = healStack(t, amount, false);
      state.log.push({
        t: 'heal', stackId: s.id, targetId: t.id, amount: res.healed, revived: res.revived,
      });
      endTurn(state);
      return;
    }
    case 'defend': {
      s.defending = true;
      state.log.push({ t: 'defend', stackId: s.id });
      popActive(state);
      return;
    }
    case 'wait': {
      if (s.waited) throw new IllegalActionError('Стек уже ждал в этом раунде');
      s.waited = true;
      state.log.push({ t: 'wait', stackId: s.id });
      state.queue = state.queue.filter((x) => x !== s.id);
      if (!state.waitQueue.includes(s.id)) state.waitQueue.push(s.id);
      state.activeId = null;
      advance(state);
      return;
    }
    default:
      throw new IllegalActionError('Неизвестное действие');
  }
}

/* ── Приёмы героя ────────────────────────────────────────────────── */

function castAbility(
  state: BattleState,
  side: Side,
  abilityId: string,
  targetId?: number,
  x?: number,
  y?: number,
): void {
  const h = state.heroes[side];
  const a = ABILITIES[abilityId];
  if (!a) throw new IllegalActionError('Неизвестный приём');
  if (!h.abilities.includes(abilityId)) throw new IllegalActionError('Приём недоступен');
  if (h.castThisRound) throw new IllegalActionError('Приём уже применён в этом раунде');
  const cost = manaCost(h, abilityId);
  if (h.mana < cost) throw new IllegalActionError('Не хватает связей');

  const target = targetId !== undefined ? byId(state, targetId) : null;
  const needEnemy = a.target === 'enemy';
  const needAlly = a.target === 'ally' || a.target === 'cell_ally';
  if ((needEnemy || needAlly) && (!target || !isAlive(target))) {
    throw new IllegalActionError('Нужна живая цель');
  }
  if (needEnemy && target!.side === side) throw new IllegalActionError('Цель должна быть вражеской');
  if (needAlly && target!.side !== side) throw new IllegalActionError('Цель должна быть своей');

  h.mana -= cost;
  h.castThisRound = true;
  const p = Math.max(1, h.power);
  let value = 0;

  switch (abilityId) {
    case 'adrenalin':
      addEffect(state, target!, { kind: 'speed', value: 2, rounds: 3, positive: true, tag: 'adrenalin_s' });
      addEffect(state, target!, { kind: 'morale', value: 1, rounds: 3, positive: true, tag: 'adrenalin_m' });
      break;
    case 'sbor':
      for (const o of state.stacks) {
        if (o.side === side && isAlive(o)) {
          addEffect(state, o, { kind: 'morale', value: 2, rounds: 2, positive: true, tag: 'sbor' });
        }
      }
      break;
    case 'fonarik':
      addEffect(state, target!, { kind: 'damagePct', value: -50, rounds: 2, positive: false, tag: 'fonarik' });
      break;
    case 'oblava':
      target!.stunned = Math.max(target!.stunned, 1);
      break;
    case 'dokumenty':
      target!.effects = target!.effects.filter((e) => !e.positive);
      break;
    case 'zapugivanie':
      addEffect(state, target!, { kind: 'attack', value: -3, rounds: 3, positive: false, tag: 'zapug_a' });
      addEffect(state, target!, { kind: 'morale', value: -1, rounds: 3, positive: false, tag: 'zapug_m' });
      break;
    case 'sanitary': {
      const res = healStack(target!, p * 25, true);
      value = res.healed;
      state.log.push({
        t: 'heal', stackId: target!.id, targetId: target!.id, amount: res.healed, revived: res.revived,
      });
      break;
    }
    case 'bolnichka': {
      if (x === undefined || y === undefined) throw new IllegalActionError('Нужна клетка');
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
        throw new IllegalActionError('Клетка вне поля');
      }
      if (occupiedSet(state, target!.id).has(key(x, y))) throw new IllegalActionError('Клетка занята');
      moveTo(state, target!, x, y);
      break;
    }
    case 'naezd': {
      const dmg = p * 20;
      value = applyDamage(state, target!, dmg);
      state.log.push({
        t: 'attack', stackId: -1, targetId: target!.id, dmg, kills: value,
        ranged: true, retaliation: false, lucky: false,
      });
      break;
    }
    default:
      throw new IllegalActionError('Приём не реализован');
  }

  state.log.push({ t: 'cast', side, abilityId, targetId, value });
  checkEnd(state);
}

/* ── Результат ───────────────────────────────────────────────────── */

export function battleResult(state: BattleState, setup: BattleSetup): BattleResult {
  const survivors: Record<Side, number[]> = { A: [], B: [] };
  for (const side of ['A', 'B'] as Side[]) {
    const army = setup[side].army.filter((a) => a.count > 0).slice(0, MAX_STACKS);
    survivors[side] = army.map((_, i) => {
      const st = state.stacks.find((s) => s.side === side && s.slot === i);
      return st ? st.count : 0;
    });
  }
  return { winner: state.winner, rounds: state.round, survivors, log: state.log };
}

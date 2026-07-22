/** Общие типы движка боя и контента. */

export type Side = 'A' | 'B';

export type FactionId = 'castle' | 'stronghold' | 'inferno' | 'tower';

export type ResourceKey = 'nal' | 'influence' | 'svyazi' | 'tovar';

export type Cost = Partial<Record<ResourceKey, number>>;

/** Свойства бойцов. Подробности — docs/03-combat.md §9. */
export type Trait =
  | 'SHOOTER'
  | 'FLYER'
  | 'NO_RETALIATION'
  | 'DOUBLE_STRIKE'
  | 'TAUNT'
  | 'AURA_MORALE'
  | 'AURA_LUCK'
  | 'HEAL'
  | 'RESURRECT'
  | 'SLOW_ON_HIT'
  | 'ARMOR_BREAK'
  | 'SHIELD_NEIGHBORS'
  | 'DEBUFF_ATTACK'
  | 'DEBUFF_DEFENSE'
  | 'SPLASH_NEIGHBORS'
  | 'BLINK'
  | 'STUN_ONCE'
  | 'LUCKY'
  | 'MELEE_NO_PENALTY';

export interface UnitDef {
  id: string;
  name: string;
  faction: FactionId;
  tier: number;
  attack: number;
  defense: number;
  minDmg: number;
  maxDmg: number;
  hp: number;
  speed: number;
  /** 0 — ближник */
  shots: number;
  /** недельный прирост при базовом здании */
  growth: number;
  cost: Cost;
  traits: Trait[];
  /** сила ауры морали (для AURA_MORALE) */
  auraMorale?: number;
  /** сила ауры удачи (для AURA_LUCK) */
  auraLuck?: number;
  /** доля макс. ХП стека, которую восстанавливает HEAL */
  healPct?: number;
  icon: string;
  desc: string;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  tagline: string;
  district: string;
  color: string;
  icon: string;
  /** описание фракционного бонуса для UI */
  bonus: string;
  /** ключ бонуса, обрабатывается движком */
  bonusKey: 'castle_morale' | 'stronghold_rush' | 'inferno_intimidate' | 'tower_melee';
}

export interface HeroClassDef {
  id: string;
  name: string;
  kind: 'might' | 'magic' | 'hybrid';
  attack: number;
  defense: number;
  power: number;
  knowledge: number;
  /** веса роста статов при повышении уровня */
  growth: [number, number, number, number];
  startAbility: string;
  perk: string;
  icon: string;
}

export type AbilitySchool = 'buff' | 'debuff' | 'control' | 'support' | 'damage';

export interface AbilityDef {
  id: string;
  name: string;
  school: AbilitySchool;
  /** уровень «Сигарной комнаты», с которого доступен */
  level: number;
  cost: number;
  /** на кого нацелен */
  target: 'ally' | 'enemy' | 'all_allies' | 'cell_ally';
  desc: string;
  icon: string;
}

export type ArtifactSlot =
  | 'head' | 'neck' | 'torso' | 'hands' | 'legs' | 'car' | 'phone' | 'weapon';

export type Rarity = 'common' | 'good' | 'rare' | 'relic';

export interface ArtifactDef {
  id: string;
  name: string;
  slot: ArtifactSlot;
  rarity: Rarity;
  /** бонусы к статам героя */
  attack?: number;
  defense?: number;
  power?: number;
  knowledge?: number;
  morale?: number;
  luck?: number;
  speed?: number;
  /** проценты для метаигры */
  incomePct?: number;
  manaFlat?: number;
  spellCostPct?: number;
  fuelMax?: number;
  icon: string;
  desc: string;
}

/* ── Бой ────────────────────────────────────────────────────────────── */

export interface BattleHero {
  name: string;
  faction: FactionId;
  attack: number;
  defense: number;
  power: number;
  knowledge: number;
  morale: number;
  luck: number;
  /** бонус к ходу всех стеков (артефакты, навыки) */
  speedBonus?: number;
  /** множитель стоимости приёмов, 1 = базовая */
  spellCostMul?: number;
  /** множитель стоимости приёмов по школам (перки классов) */
  spellSchoolMul?: Partial<Record<AbilitySchool, number>>;
  /** глобальный процентный бонус к урону бригады (перки классов) */
  damagePct?: number;
  /** доступные приёмы */
  abilities: string[];
}

export interface ArmyStackInput {
  unitId: string;
  count: number;
}

export interface BattleSideInput {
  hero: BattleHero;
  army: ArmyStackInput[];
}

export interface BattleSetup {
  seed: number;
  A: BattleSideInput;
  B: BattleSideInput;
  /** ширина/высота поля; по умолчанию 12×9 */
  width?: number;
  height?: number;
}

export type EffectKind =
  | 'speed'
  | 'attack'
  | 'defense'
  | 'morale'
  | 'luck'
  | 'damagePct'
  | 'defensePct';

export interface Effect {
  kind: EffectKind;
  value: number;
  /** сколько раундов осталось; -1 — до конца боя */
  rounds: number;
  positive: boolean;
  tag: string;
}

export interface Stack {
  id: number;
  /** индекс в исходном массиве армии своей стороны */
  slot: number;
  unitId: string;
  side: Side;
  count: number;
  hpTop: number;
  x: number;
  y: number;
  shotsLeft: number;
  /** использовал ответку в этом раунде */
  retaliated: boolean;
  defending: boolean;
  /** отложил ход в этом раунде */
  waited: boolean;
  /** пропускает N ходов */
  stunned: number;
  /** одноразовые способности, уже использованные */
  used: string[];
  effects: Effect[];
  /** сколько бойцов было изначально (для подсчёта потерь) */
  initialCount: number;
}

export interface HeroState extends BattleHero {
  mana: number;
  castThisRound: boolean;
}

export type BattleEvent =
  | { t: 'round'; n: number }
  | { t: 'turn'; stackId: number }
  | { t: 'move'; stackId: number; fx: number; fy: number; tx: number; ty: number }
  | {
      t: 'attack';
      stackId: number;
      targetId: number;
      dmg: number;
      kills: number;
      ranged: boolean;
      retaliation: boolean;
      lucky: boolean;
    }
  | { t: 'heal'; stackId: number; targetId: number; amount: number; revived: number }
  | { t: 'cast'; side: Side; abilityId: string; targetId?: number; value: number }
  | { t: 'morale'; stackId: number; good: boolean }
  | { t: 'defend'; stackId: number }
  | { t: 'wait'; stackId: number }
  | { t: 'effect'; stackId: number; kind: EffectKind; value: number; rounds: number; tag: string }
  | { t: 'death'; stackId: number }
  | { t: 'end'; winner: Side | null };

export type Action =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: number; x: number; y: number }
  | { type: 'shoot'; targetId: number }
  | { type: 'heal'; targetId: number }
  | { type: 'defend' }
  | { type: 'wait' }
  | { type: 'cast'; abilityId: string; targetId?: number; x?: number; y?: number };

export interface BattleState {
  width: number;
  height: number;
  rng: number;
  round: number;
  stacks: Stack[];
  heroes: Record<Side, HeroState>;
  /** очередь id стеков в текущем раунде */
  queue: number[];
  /** отложившие ход */
  waitQueue: number[];
  activeId: number | null;
  /** активному стеку уже дали доп. ход по морали */
  moraleUsed: boolean;
  finished: boolean;
  winner: Side | null;
  log: BattleEvent[];
  /** страховка от бесконечных циклов */
  steps: number;
}

export interface BattleResult {
  winner: Side | null;
  rounds: number;
  /** сколько бойцов осталось в каждом стеке, по индексам входной армии */
  survivors: Record<Side, number[]>;
  log: BattleEvent[];
}

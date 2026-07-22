import type { HeroClassDef } from '../types.ts';

/** Классы героев. В MVP доступны первые три (см. MVP_CLASSES). */
const LIST: HeroClassDef[] = [
  {
    id: 'avtoritet', name: 'Авторитет', kind: 'might',
    attack: 4, defense: 3, power: 1, knowledge: 1,
    growth: [40, 30, 15, 15], startAbility: 'sbor',
    perk: '+5% урона всей бригады', icon: '🎩',
  },
  {
    id: 'oper', name: 'Опер', kind: 'magic',
    attack: 2, defense: 3, power: 3, knowledge: 2,
    growth: [20, 25, 30, 25], startAbility: 'oblava',
    perk: 'Приёмы-контроль стоят −30% связей', icon: '🚔',
  },
  {
    id: 'major', name: 'Мажор-бизнесмен', kind: 'magic',
    attack: 1, defense: 2, power: 3, knowledge: 4,
    growth: [15, 20, 30, 35], startAbility: 'sanitary',
    perk: '−20% стоимости найма бойцов', icon: '🕶️',
  },
  /* ── за пределами MVP ─────────────────────────────────────────── */
  {
    id: 'smotryashchiy', name: 'Смотрящий', kind: 'hybrid',
    attack: 2, defense: 3, power: 2, knowledge: 2,
    growth: [25, 30, 25, 20], startAbility: 'zapugivanie',
    perk: '+15% дохода со всех точек', icon: '🕴️',
  },
  {
    id: 'trener', name: 'Качок-тренер', kind: 'might',
    attack: 3, defense: 4, power: 1, knowledge: 1,
    growth: [35, 35, 15, 15], startAbility: 'adrenalin',
    perk: 'Бойцы T1–T3 получают +2 атаки', icon: '💪',
  },
  {
    id: 'dj', name: 'Диджей', kind: 'magic',
    attack: 2, defense: 2, power: 3, knowledge: 3,
    growth: [20, 20, 30, 30], startAbility: 'adrenalin',
    perk: '+1 к удаче и морали бригады', icon: '🎧',
  },
];

export const HERO_CLASSES: Record<string, HeroClassDef> = Object.fromEntries(
  LIST.map((h) => [h.id, h]),
);

export const HERO_CLASS_LIST = LIST;

/** Классы, доступные игроку в MVP. */
export const MVP_CLASSES = ['avtoritet', 'oper', 'major'];

/** XP, необходимый для достижения уровня L. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(1000 * Math.pow(level - 1, 1.5));
}

/** Уровень по накопленному XP. */
export function levelFromXp(xp: number): number {
  let l = 1;
  while (l < 50 && xp >= xpForLevel(l + 1)) l++;
  return l;
}

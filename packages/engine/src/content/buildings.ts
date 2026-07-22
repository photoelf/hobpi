import type { Cost } from '../types.ts';

/* ── Здания найма ────────────────────────────────────────────────── */

export interface RecruitBuildingDef {
  key: string;
  name: string;
  tier: number;
  cost: Cost;
  icon: string;
  desc: string;
}

export const RECRUIT_BUILDINGS: RecruitBuildingDef[] = [
  { key: 'dvor', name: 'Двор', tier: 1, cost: { nal: 500 }, icon: '🏚️', desc: 'Открывает найм бойцов 1-го тира.' },
  { key: 'ploshchadka', name: 'Спортплощадка', tier: 2, cost: { nal: 1000, tovar: 5 }, icon: '🏀', desc: 'Открывает найм бойцов 2-го тира.' },
  { key: 'ohrana', name: 'Пункт охраны', tier: 3, cost: { nal: 2000, tovar: 10 }, icon: '🛎️', desc: 'Открывает найм бойцов 3-го тира.' },
  { key: 'garazh', name: 'Гараж', tier: 4, cost: { nal: 4000, tovar: 20, influence: 2 }, icon: '🔧', desc: 'Открывает найм бойцов 4-го тира.' },
  { key: 'shtab', name: 'Штаб бригады', tier: 5, cost: { nal: 8000, tovar: 35, influence: 5 }, icon: '🏢', desc: 'Открывает найм бойцов 5-го тира.' },
  { key: 'masterskaya', name: 'Мастерская', tier: 6, cost: { nal: 15000, tovar: 60, influence: 12 }, icon: '⚙️', desc: 'Открывает найм бойцов 6-го тира.' },
  { key: 'osobnyak', name: 'Особняк', tier: 7, cost: { nal: 30000, tovar: 100, influence: 25 }, icon: '🏛️', desc: 'Открывает найм бойцов 7-го тира.' },
];

/* ── Экономические и спец-здания ─────────────────────────────────── */

export interface SpecialBuildingDef {
  key: string;
  name: string;
  maxLevel: number;
  /** цена уровня N (1-индексация) */
  cost: (level: number) => Cost;
  icon: string;
  desc: string;
}

export const SPECIAL_BUILDINGS: SpecialBuildingDef[] = [
  {
    key: 'shodka', name: 'Сходка', maxLevel: 4,
    cost: (l) => ({ nal: 1500 * l }), icon: '🤝',
    desc: '+250 налика к каждому тику дохода за уровень.',
  },
  {
    key: 'shemy', name: 'Серые схемы', maxLevel: 1,
    cost: () => ({ nal: 5000, tovar: 20, influence: 5 }), icon: '📈',
    desc: '+10% от казны раз в неделю и +50% к потолку казны.',
  },
  {
    key: 'sigarnaya', name: 'Сигарная комната', maxLevel: 5,
    cost: (l) => ({ nal: 2000 * l, svyazi: l > 2 ? 5 * l : 0 }), icon: '🚬',
    desc: 'Открывает приёмы героя. Уровень N → приёмы до уровня N.',
  },
  {
    key: 'servis', name: 'Сервис меринов', maxLevel: 1,
    cost: () => ({ nal: 3500, tovar: 15 }), icon: '🛠️',
    desc: '+2 к максимуму топлива, −20% времени восстановления.',
  },
  {
    key: 'baraholka', name: 'Барахолка', maxLevel: 3,
    cost: (l) => ({ nal: 1000 * l, tovar: 5 * l }), icon: '🏪',
    desc: 'Обмен ресурсов. Курс улучшается с уровнем.',
  },
];

export const BUILDINGS_BY_KEY: Record<string, RecruitBuildingDef | SpecialBuildingDef> =
  Object.fromEntries([
    ...RECRUIT_BUILDINGS.map((b) => [b.key, b] as const),
    ...SPECIAL_BUILDINGS.map((b) => [b.key, b] as const),
  ]);

/* ── Точки дохода ────────────────────────────────────────────────── */

export interface SpotDef {
  key: string;
  name: string;
  /** доход за один тик (6 часов) на 1-м уровне */
  income: Cost;
  buildCost: Cost;
  icon: string;
  desc: string;
}

export const SPOTS: SpotDef[] = [
  { key: 'larek', name: 'Ларёк', income: { nal: 120 }, buildCost: { nal: 400 }, icon: '🏪', desc: 'Пиво, сигареты, чипсы. Мелочь, а капает.' },
  { key: 'parkovka', name: 'Парковка', income: { nal: 200 }, buildCost: { nal: 900 }, icon: '🅿️', desc: 'Шлагбаум и человек в будке. Бизнес-модель века.' },
  { key: 'servis', name: 'Автосервис', income: { nal: 150, tovar: 4 }, buildCost: { nal: 1200 }, icon: '🔩', desc: 'Чинят, красят, перебивают. Источник товара.' },
  { key: 'rynok', name: 'Рынок', income: { nal: 100, tovar: 8 }, buildCost: { nal: 1500, tovar: 10 }, icon: '🍉', desc: 'Место силы. Товар течёт рекой.' },
  { key: 'klub', name: 'Ночной клуб', income: { nal: 400, influence: 2 }, buildCost: { nal: 3000, tovar: 25 }, icon: '🎶', desc: 'Днём пусто, ночью — весь город. Даёт влияние.' },
  { key: 'kabinet', name: 'Кабинет «решалы»', income: { nal: 60, svyazi: 3 }, buildCost: { nal: 2500, influence: 5 }, icon: '☎️', desc: 'Два стула, стол и телефон. Даёт связи.' },
];

export const SPOTS_BY_KEY: Record<string, SpotDef> = Object.fromEntries(
  SPOTS.map((s) => [s.key, s]),
);

/** Множитель дохода за уровень точки (уровни 1–3). */
export function spotIncomeMultiplier(level: number): number {
  return Math.pow(1.8, level - 1);
}

/** Цена апгрейда точки до уровня `level`. */
export function spotUpgradeCost(def: SpotDef, level: number): Cost {
  const m = Math.pow(2.5, level - 1);
  const out: Cost = {};
  for (const [k, v] of Object.entries(def.buildCost)) {
    out[k as keyof Cost] = Math.round((v as number) * m);
  }
  return out;
}

export const MAX_SPOT_LEVEL = 3;

/** Слотов под точки: 3 на старте, +1 за каждые 5 уровней героя, максимум 8. */
export function spotSlots(heroLevel: number): number {
  return Math.min(8, 3 + Math.floor(heroLevel / 5));
}

/* ── Недельные события ───────────────────────────────────────────── */

export interface WeeklyEventDef {
  key: string;
  name: string;
  desc: string;
  icon: string;
}

export const WEEKLY_EVENTS: WeeklyEventDef[] = [
  { key: 'kachki', name: 'Неделя качков', desc: '×2 прирост бойцов 1–3 тиров.', icon: '💪' },
  { key: 'majory', name: 'Неделя мажоров', desc: '+50% дохода со всех точек.', icon: '🥂' },
  { key: 'oblavy', name: 'Неделя облав', desc: '−25% дохода, но ×2 влияния за победы в PvP.', icon: '🚔' },
  { key: 'razborki', name: 'Неделя разборок', desc: 'PvP не тратит топливо, ×1.5 рейтинга.', icon: '⚔️' },
  { key: 'barygi', name: 'Неделя барыг', desc: 'Курс обмена 1:1, товар вдвое дешевле.', icon: '💱' },
  { key: 'tishina', name: 'Неделя тишины', desc: '+2 к максимуму приёмов, приёмы −30% связей.', icon: '🤫' },
];

/** Событие недели детерминировано по номеру ISO-недели — у всех игроков одинаковое. */
export function weeklyEvent(date = new Date()): WeeklyEventDef {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.floor((date.getTime() - start) / (7 * 24 * 3600 * 1000));
  return WEEKLY_EVENTS[((week % WEEKLY_EVENTS.length) + WEEKLY_EVENTS.length) % WEEKLY_EVENTS.length];
}

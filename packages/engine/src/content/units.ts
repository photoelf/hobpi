import type { FactionId, UnitDef } from '../types.ts';

/**
 * 4 фракции × 7 тиров = 28 бойцов.
 * Балансный ориентир: боец тира N примерно вдвое «дороже и сильнее» тира N−1,
 * но недельный прирост падает быстрее — топ дефицитен.
 */
const LIST: UnitDef[] = [
  /* ── Старые авторитеты (Castle) ─────────────────────────────────── */
  {
    id: 'cas1', name: 'Дворовый пацан', faction: 'castle', tier: 1,
    attack: 4, defense: 5, minDmg: 2, maxDmg: 3, hp: 10, speed: 4, shots: 0,
    growth: 14, cost: { nal: 60 }, traits: [], icon: '🧍',
    desc: 'Дёшев, многочислен, ничего не умеет. Зато свой.',
  },
  {
    id: 'cas2', name: 'Стритфайтер', faction: 'castle', tier: 2,
    attack: 6, defense: 5, minDmg: 2, maxDmg: 4, hp: 10, speed: 5, shots: 8,
    growth: 8, cost: { nal: 100 }, traits: ['SHOOTER'], icon: '🍾',
    desc: 'Кидает всё, что под руку попадётся. Восемь бросков — и всё.',
  },
  {
    id: 'cas3', name: 'Охранник ТЦ', faction: 'castle', tier: 3,
    attack: 5, defense: 8, minDmg: 3, maxDmg: 6, hp: 25, speed: 5, shots: 0,
    growth: 7, cost: { nal: 150 }, traits: ['TAUNT'], icon: '🛡️',
    desc: 'Стоит стеной. Соседние враги обязаны бить именно его.',
  },
  {
    id: 'cas4', name: 'Курьер на «мерине»', faction: 'castle', tier: 4,
    attack: 9, defense: 8, minDmg: 5, maxDmg: 8, hp: 30, speed: 9, shots: 0,
    growth: 4, cost: { nal: 260 }, traits: ['FLYER'], icon: '🚗',
    desc: 'Проезжает сквозь любые ряды. Правила — не для него.',
  },
  {
    id: 'cas5', name: 'Смотрящий', faction: 'castle', tier: 5,
    attack: 10, defense: 10, minDmg: 8, maxDmg: 11, hp: 45, speed: 6, shots: 0,
    growth: 3, cost: { nal: 400, tovar: 1 }, traits: ['AURA_MORALE'], auraMorale: 1,
    icon: '🕴️', desc: 'Пока он на поле — все держат себя в руках. +1 мораль своим.',
  },
  {
    id: 'cas6', name: 'Киллер', faction: 'castle', tier: 6,
    attack: 15, defense: 10, minDmg: 11, maxDmg: 19, hp: 60, speed: 7, shots: 4,
    growth: 2, cost: { nal: 700, tovar: 2 }, traits: ['SHOOTER', 'NO_RETALIATION'],
    icon: '🎯', desc: 'Четыре патрона, ноль ответок. Работает тихо.',
  },
  {
    id: 'cas7', name: 'Легенда района', faction: 'castle', tier: 7,
    attack: 20, defense: 20, minDmg: 28, maxDmg: 38, hp: 180, speed: 8, shots: 0,
    growth: 1, cost: { nal: 2500, influence: 3 }, traits: ['RESURRECT', 'AURA_MORALE'],
    auraMorale: 2, icon: '👑',
    desc: 'Один раз за бой поднимает павших своих. +2 морали бригаде.',
  },

  /* ── Качалка (Stronghold) ───────────────────────────────────────── */
  {
    id: 'str1', name: 'Пацан с турника', faction: 'stronghold', tier: 1,
    attack: 4, defense: 3, minDmg: 1, maxDmg: 2, hp: 12, speed: 5, shots: 0,
    growth: 14, cost: { nal: 55 }, traits: [], icon: '🤸',
    desc: 'Подтягивается тридцать раз. Бьёт — так себе.',
  },
  {
    id: 'str2', name: 'Боксёр-любитель', faction: 'stronghold', tier: 2,
    attack: 6, defense: 4, minDmg: 2, maxDmg: 4, hp: 14, speed: 6, shots: 0,
    growth: 8, cost: { nal: 110 }, traits: ['LUCKY'], icon: '🥊',
    desc: 'Ставит удар. Личная удача +1 — часто попадает вдвое сильнее.',
  },
  {
    id: 'str3', name: 'Борец', faction: 'stronghold', tier: 3,
    attack: 7, defense: 6, minDmg: 3, maxDmg: 5, hp: 28, speed: 5, shots: 0,
    growth: 7, cost: { nal: 170 }, traits: ['SLOW_ON_HIT'], icon: '🤼',
    desc: 'Хватает и не пускает: −2 к ходу цели на раунд.',
  },
  {
    id: 'str4', name: 'Тренер-диетолог', faction: 'stronghold', tier: 4,
    attack: 7, defense: 7, minDmg: 4, maxDmg: 6, hp: 32, speed: 6, shots: 0,
    growth: 4, cost: { nal: 280 }, traits: ['HEAL'], healPct: 0.15, icon: '🥤',
    desc: 'Вместо удара откачивает соседей: +15% макс. ХП стеку.',
  },
  {
    id: 'str5', name: 'Вышибала клуба', faction: 'stronghold', tier: 5,
    attack: 9, defense: 14, minDmg: 6, maxDmg: 9, hp: 60, speed: 5, shots: 0,
    growth: 3, cost: { nal: 430, tovar: 1 }, traits: ['SHIELD_NEIGHBORS'], icon: '🚪',
    desc: 'Прикрывает своих: −25% урона по соседним стекам.',
  },
  {
    id: 'str6', name: 'ММА-звезда', faction: 'stronghold', tier: 6,
    attack: 14, defense: 12, minDmg: 10, maxDmg: 16, hp: 70, speed: 8, shots: 0,
    growth: 2, cost: { nal: 750, tovar: 2 }, traits: ['DOUBLE_STRIKE'], icon: '🥋',
    desc: 'Бьёт дважды за ход. Ответку получает один раз.',
  },
  {
    id: 'str7', name: 'Божество качалки', faction: 'stronghold', tier: 7,
    attack: 20, defense: 16, minDmg: 22, maxDmg: 38, hp: 160, speed: 7, shots: 0,
    growth: 1, cost: { nal: 2600, influence: 3 }, traits: ['ARMOR_BREAK', 'NO_RETALIATION'],
    icon: '🏋️', desc: 'Ломает броню цели на −40% до конца боя. Ответок не получает.',
  },

  /* ── Гопники (Inferno) ──────────────────────────────────────────── */
  {
    id: 'inf1', name: 'Мелкий с района', faction: 'inferno', tier: 1,
    attack: 4, defense: 3, minDmg: 1, maxDmg: 2, hp: 10, speed: 5, shots: 0,
    growth: 14, cost: { nal: 50 }, traits: [], icon: '🚬',
    desc: 'Быстрый, наглый, дохлый. Берут количеством.',
  },
  {
    id: 'inf2', name: 'Гопник с семками', faction: 'inferno', tier: 2,
    attack: 6, defense: 5, minDmg: 2, maxDmg: 3, hp: 12, speed: 6, shots: 6,
    growth: 8, cost: { nal: 105 }, traits: ['SHOOTER'], icon: '🌻',
    desc: 'Швыряет всё подряд с шести шагов. Потом заканчивается.',
  },
  {
    id: 'inf3', name: 'Подъездный', faction: 'inferno', tier: 3,
    attack: 7, defense: 5, minDmg: 4, maxDmg: 6, hp: 22, speed: 6, shots: 0,
    growth: 7, cost: { nal: 160 }, traits: ['NO_RETALIATION'], icon: '🚪',
    desc: 'Бьёт исподтишка — ответки не получает.',
  },
  {
    id: 'inf4', name: 'Барыга', faction: 'inferno', tier: 4,
    attack: 8, defense: 7, minDmg: 5, maxDmg: 8, hp: 30, speed: 6, shots: 0,
    growth: 4, cost: { nal: 270 }, traits: ['DEBUFF_ATTACK'], icon: '💼',
    desc: 'Портит настроение: −2 к атаке цели на 2 раунда.',
  },
  {
    id: 'inf5', name: 'Наёмник с рынка', faction: 'inferno', tier: 5,
    attack: 12, defense: 10, minDmg: 9, maxDmg: 13, hp: 50, speed: 7, shots: 0,
    growth: 3, cost: { nal: 420, tovar: 1 }, traits: [], icon: '🔪',
    desc: 'Работает за налик, без вопросов и без изысков.',
  },
  {
    id: 'inf6', name: 'Отморозок', faction: 'inferno', tier: 6,
    attack: 16, defense: 11, minDmg: 13, maxDmg: 19, hp: 65, speed: 11, shots: 0,
    growth: 2, cost: { nal: 760, tovar: 2 }, traits: ['BLINK'], icon: '⚡',
    desc: 'Рывок в любую точку поля. Достаёт стрелков в первом же раунде.',
  },
  {
    id: 'inf7', name: 'Смотрящий за окраиной', faction: 'inferno', tier: 7,
    attack: 21, defense: 18, minDmg: 25, maxDmg: 39, hp: 150, speed: 9, shots: 0,
    growth: 1, cost: { nal: 2550, influence: 3 }, traits: ['BLINK', 'SPLASH_NEIGHBORS'],
    icon: '🔥', desc: 'Рывок через поле + задевает всех соседей цели на 50%.',
  },

  /* ── Айтишники (Tower) ──────────────────────────────────────────── */
  {
    id: 'tow1', name: 'Стажёр', faction: 'tower', tier: 1,
    attack: 4, defense: 4, minDmg: 1, maxDmg: 2, hp: 9, speed: 4, shots: 10,
    growth: 14, cost: { nal: 70 }, traits: ['SHOOTER'], icon: '🧑‍💻',
    desc: 'Десять попыток что-то сделать. Обычно мимо, но их много.',
  },
  {
    id: 'tow2', name: 'Эникейщик', faction: 'tower', tier: 2,
    attack: 5, defense: 6, minDmg: 2, maxDmg: 4, hp: 16, speed: 5, shots: 0,
    growth: 8, cost: { nal: 120 }, traits: ['HEAL'], healPct: 0.1, icon: '🔧',
    desc: 'Чинит соседей: +10% макс. ХП стеку вместо атаки.',
  },
  {
    id: 'tow3', name: 'Тестировщик', faction: 'tower', tier: 3,
    attack: 7, defense: 6, minDmg: 4, maxDmg: 6, hp: 20, speed: 5, shots: 8,
    growth: 7, cost: { nal: 180 }, traits: ['SHOOTER', 'DEBUFF_DEFENSE'], icon: '🐞',
    desc: 'Находит баг в обороне: −15% защиты цели на 2 раунда.',
  },
  {
    id: 'tow4', name: 'Сисадмин', faction: 'tower', tier: 4,
    attack: 10, defense: 12, minDmg: 6, maxDmg: 9, hp: 40, speed: 5, shots: 6,
    growth: 4, cost: { nal: 300 }, traits: ['SHOOTER'], icon: '🖥️',
    desc: 'Стрелок, которого тяжело выковырять из серверной.',
  },
  {
    id: 'tow5', name: 'Продакт', faction: 'tower', tier: 5,
    attack: 10, defense: 10, minDmg: 8, maxDmg: 12, hp: 45, speed: 7, shots: 0,
    growth: 3, cost: { nal: 450, tovar: 1 }, traits: ['AURA_LUCK'], auraLuck: 1,
    icon: '📊', desc: 'Всем везёт чуть больше: +1 удачи союзникам.',
  },
  {
    id: 'tow6', name: 'Дрон-курьер', faction: 'tower', tier: 6,
    attack: 15, defense: 12, minDmg: 14, maxDmg: 21, hp: 55, speed: 12, shots: 0,
    growth: 2, cost: { nal: 800, tovar: 2 }, traits: ['FLYER', 'NO_RETALIATION'],
    icon: '🛸', desc: 'Самый быстрый в игре. Летает над рядами, ответок не получает.',
  },
  {
    id: 'tow7', name: 'Кибер-безопасник', faction: 'tower', tier: 7,
    attack: 21, defense: 22, minDmg: 26, maxDmg: 38, hp: 170, speed: 8, shots: 8,
    growth: 1, cost: { nal: 2700, influence: 3 }, traits: ['SHOOTER', 'STUN_ONCE'],
    icon: '🔒', desc: 'Раз за бой кладёт вражеский стек: пропуск следующего хода.',
  },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  LIST.map((u) => [u.id, u]),
);

export const UNIT_LIST = LIST;

export function unitsOfFaction(faction: FactionId): UnitDef[] {
  return LIST.filter((u) => u.faction === faction).sort((a, b) => a.tier - b.tier);
}

export function unitOfTier(faction: FactionId, tier: number): UnitDef | undefined {
  return LIST.find((u) => u.faction === faction && u.tier === tier);
}

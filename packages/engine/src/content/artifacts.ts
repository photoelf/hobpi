import type { ArtifactDef, ArtifactSlot, Rarity } from '../types.ts';

export const SLOT_NAMES: Record<ArtifactSlot, string> = {
  head: 'Голова',
  neck: 'Шея',
  torso: 'Торс',
  hands: 'Руки',
  legs: 'Ноги',
  car: 'Тачка',
  phone: 'Телефон',
  weapon: 'Ствол',
};

export const SLOT_ORDER: ArtifactSlot[] = [
  'head', 'neck', 'torso', 'hands', 'legs', 'weapon', 'car', 'phone',
];

export const RARITY_NAMES: Record<Rarity, string> = {
  common: 'Обычный',
  good: 'Ценный',
  rare: 'Крутой',
  relic: 'Реликвия',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9aa0a6',
  good: '#4caf50',
  rare: '#4a90d9',
  relic: '#e08b2a',
};

const LIST: ArtifactDef[] = [
  { id: 'sportivka', name: 'Спортивка «три полоски»', slot: 'torso', rarity: 'common', attack: 1, morale: 1, icon: '🥋', desc: 'Классика жанра. Сидит как влитая.' },
  { id: 'kepka', name: 'Кепка', slot: 'head', rarity: 'common', defense: 1, icon: '🧢', desc: 'Козырёк вниз — глаз не видно.' },
  { id: 'krossy', name: 'Кроссы «белые»', slot: 'legs', rarity: 'common', speed: 1, icon: '👟', desc: 'Держат чистыми ценой нервов. Зато бегают.' },
  { id: 'pager', name: 'Пейджер', slot: 'phone', rarity: 'common', knowledge: 1, manaFlat: 5, icon: '📟', desc: '«Перезвони, дело есть».' },

  { id: 'cep', name: 'Золотая цепь', slot: 'neck', rarity: 'good', power: 2, icon: '📿', desc: 'Толщина цепи прямо пропорциональна авторитету.' },
  { id: 'rayban', name: 'Очки Ray-Ban', slot: 'head', rarity: 'good', luck: 2, icon: '🕶️', desc: 'В них всё выглядит удачнее.' },
  { id: 'kastet', name: 'Кастет', slot: 'hands', rarity: 'good', attack: 2, icon: '✊', desc: 'Аргумент, не требующий продолжения.' },
  { id: 'barsetka', name: 'Барсетка', slot: 'hands', rarity: 'good', incomePct: 10, icon: '👜', desc: 'В ней всё: документы, налик, чужие обещания.' },
  { id: 'bertsy', name: 'Берцы', slot: 'legs', rarity: 'good', defense: 2, icon: '🥾', desc: 'Тяжело, зато ноге спокойно.' },

  { id: 'nokia', name: 'Nokia 8800', slot: 'phone', rarity: 'rare', knowledge: 2, manaFlat: 15, spellCostPct: -20, icon: '📱', desc: 'Скользит из ладони, как хорошая схема.' },
  { id: 'merin', name: 'Лупатый мерин', slot: 'car', rarity: 'rare', speed: 1, fuelMax: 2, icon: '🚙', desc: 'Фары как глаза. Смотрит прямо в душу района.' },
  { id: 'rolex', name: 'Часы «Ролекс»', slot: 'neck', rarity: 'rare', power: 2, incomePct: 20, icon: '⌚', desc: 'Показывают точное время подъёма денег.' },
  { id: 'pechatka', name: 'Печатка', slot: 'hands', rarity: 'rare', attack: 1, power: 1, morale: 1, icon: '💍', desc: 'Тяжёлая. И на руке, и в разговоре.' },

  { id: 'bmw', name: 'Бэха «пятёрка»', slot: 'car', rarity: 'relic', attack: 2, defense: 2, morale: 1, luck: 1, icon: '🏎️', desc: 'Тонированная в круг. Все всё понимают без слов.' },

  /* Стволы. Все — вымышленные и безмарочные, эффект чисто числовой. */
  { id: 'bita', name: 'Бита «Аргумент»', slot: 'weapon', rarity: 'common', attack: 2, icon: '🏏', desc: 'Лежит в багажнике. Спорт тут ни при чём.' },
  { id: 'nozh', name: 'Нож-бабочка', slot: 'weapon', rarity: 'good', attack: 2, luck: 2, icon: '🔪', desc: 'Крутить научился раньше, чем пользоваться.' },
  { id: 'tt', name: 'ТТ', slot: 'weapon', rarity: 'rare', attack: 4, power: 2, morale: 1, icon: '🔫', desc: 'Тяжёлый, холодный и очень убедительный.' },
  { id: 'obrez', name: 'Обрез', slot: 'weapon', rarity: 'relic', attack: 5, defense: 2, morale: 2, luck: 3, icon: '💥', desc: 'Разговор короткий. Ствол — ещё короче.' },
];

export const ARTIFACTS: Record<string, ArtifactDef> = Object.fromEntries(
  LIST.map((a) => [a.id, a]),
);

export const ARTIFACT_LIST = LIST;

/** Вес выпадения по редкости при дропе с PvE. */
export const DROP_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  good: 28,
  rare: 10,
  relic: 2,
};

export interface ArtifactBonuses {
  attack: number;
  defense: number;
  power: number;
  knowledge: number;
  morale: number;
  luck: number;
  speed: number;
  incomePct: number;
  manaFlat: number;
  spellCostPct: number;
  fuelMax: number;
}

export function emptyBonuses(): ArtifactBonuses {
  return {
    attack: 0, defense: 0, power: 0, knowledge: 0, morale: 0,
    luck: 0, speed: 0, incomePct: 0, manaFlat: 0, spellCostPct: 0, fuelMax: 0,
  };
}

/** Суммирует бонусы экипированных артефактов. */
export function sumArtifacts(ids: string[]): ArtifactBonuses {
  const b = emptyBonuses();
  for (const id of ids) {
    const a = ARTIFACTS[id];
    if (!a) continue;
    b.attack += a.attack ?? 0;
    b.defense += a.defense ?? 0;
    b.power += a.power ?? 0;
    b.knowledge += a.knowledge ?? 0;
    b.morale += a.morale ?? 0;
    b.luck += a.luck ?? 0;
    b.speed += a.speed ?? 0;
    b.incomePct += a.incomePct ?? 0;
    b.manaFlat += a.manaFlat ?? 0;
    b.spellCostPct += a.spellCostPct ?? 0;
    b.fuelMax += a.fuelMax ?? 0;
  }
  return b;
}

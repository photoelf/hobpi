import type { AbilityDef } from '../types.ts';

/** Приёмы героя. «Магия» без магии — см. docs/03-combat.md §10. */
const LIST: AbilityDef[] = [
  {
    id: 'adrenalin', name: 'Адреналин', school: 'buff', level: 1, cost: 6, target: 'ally',
    icon: '💉', desc: '+2 к ходу и +1 морали своему стеку на 3 раунда.',
  },
  {
    id: 'sbor', name: 'Общий сбор', school: 'buff', level: 2, cost: 9, target: 'all_allies',
    icon: '📣', desc: '+2 морали всей бригаде на 2 раунда.',
  },
  {
    id: 'fonarik', name: 'Фонарик в глаза', school: 'debuff', level: 1, cost: 7, target: 'enemy',
    icon: '🔦', desc: '−50% урона вражескому стеку на 2 раунда.',
  },
  {
    id: 'oblava', name: 'Облава', school: 'control', level: 3, cost: 12, target: 'enemy',
    icon: '🚨', desc: 'Вражеский стек пропускает следующий ход.',
  },
  {
    id: 'dokumenty', name: 'Проверка документов', school: 'control', level: 2, cost: 8, target: 'enemy',
    icon: '📋', desc: 'Снимает все усиления с вражеского стека.',
  },
  {
    id: 'zapugivanie', name: 'Запугивание', school: 'debuff', level: 2, cost: 9, target: 'enemy',
    icon: '😠', desc: '−3 атаки и −1 мораль вражескому стеку на 3 раунда.',
  },
  {
    id: 'sanitary', name: 'Санитары', school: 'support', level: 2, cost: 10, target: 'ally',
    icon: '🚑', desc: 'Лечит своему стеку 25 × Авторитет ХП, поднимая павших.',
  },
  {
    id: 'bolnichka', name: 'Связь с больничкой', school: 'support', level: 4, cost: 14, target: 'cell_ally',
    icon: '🏥', desc: 'Переносит свой стек в любую свободную клетку.',
  },
  {
    id: 'naezd', name: 'Наезд', school: 'damage', level: 3, cost: 11, target: 'enemy',
    icon: '💢', desc: 'Прямой урон 20 × Авторитет по вражескому стеку.',
  },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(
  LIST.map((a) => [a.id, a]),
);

export const ABILITY_LIST = LIST;

/** Какие приёмы доступны при данном уровне «Сигарной комнаты». */
export function abilitiesForGuild(level: number): string[] {
  return LIST.filter((a) => a.level <= level).map((a) => a.id);
}

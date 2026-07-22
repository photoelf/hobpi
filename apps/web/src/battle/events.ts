import { ABILITIES, UNITS } from '@hobpi/engine';
import type { BattleEvent, BattleState } from '@hobpi/engine';

const nameOf = (state: BattleState, id: number): string => {
  const s = state.stacks.find((x) => x.id === id);
  return s ? (UNITS[s.unitId]?.name ?? s.unitId) : 'кто-то';
};

/** Человекочитаемая строка события боя для ленты. */
export function describeEvent(state: BattleState, ev: BattleEvent): string | null {
  switch (ev.t) {
    case 'round':
      return `— Раунд ${ev.n} —`;
    case 'attack': {
      const who = ev.stackId === -1 ? 'Наезд' : nameOf(state, ev.stackId);
      const tgt = nameOf(state, ev.targetId);
      const kills = ev.kills ? `, полегло ${ev.kills}` : '';
      const luck = ev.lucky ? ' (фарт!)' : '';
      const kind = ev.retaliation ? 'отвечает' : ev.ranged ? 'достаёт' : 'бьёт';
      return `${who} ${kind} ${tgt}: −${ev.dmg}${kills}${luck}`;
    }
    case 'heal':
      return ev.revived
        ? `${nameOf(state, ev.stackId)} поднимает ${ev.revived} бойцов`
        : `${nameOf(state, ev.stackId)} откачивает ${nameOf(state, ev.targetId)}: +${ev.amount}`;
    case 'cast': {
      const a = ABILITIES[ev.abilityId];
      const side = ev.side === 'A' ? 'Ты' : 'Соперник';
      return `${side}: «${a?.name ?? ev.abilityId}»`;
    }
    case 'morale':
      return ev.good
        ? `${nameOf(state, ev.stackId)} на кураже — ходит ещё раз`
        : `${nameOf(state, ev.stackId)} сдулся и пропускает ход`;
    case 'death':
      return `${nameOf(state, ev.stackId)} — всё`;
    case 'defend':
      return `${nameOf(state, ev.stackId)} встал в глухую`;
    case 'wait':
      return `${nameOf(state, ev.stackId)} выжидает`;
    case 'end':
      return ev.winner === 'A' ? '=== Район твой ===' : ev.winner === 'B' ? '=== Разъехались ни с чем ===' : '=== Ничья ===';
    default:
      return null;
  }
}

/** Стеки, по которым только что прилетело — для вспышки на поле. */
export function hitStacks(events: BattleEvent[]): Set<number> {
  const s = new Set<number>();
  for (const ev of events) if (ev.t === 'attack') s.add(ev.targetId);
  return s;
}

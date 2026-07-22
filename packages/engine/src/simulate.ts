import type { Action, BattleResult, BattleSetup, BattleState, Side } from './types.ts';
import { activeStack, applyAction, battleResult, createBattle } from './battle.ts';
import { runAI } from './ai.ts';

/** Полный автобой: обе стороны ведёт ИИ. */
export function simulate(setup: BattleSetup): BattleResult {
  const state = createBattle(setup);
  runAI(state, ['A', 'B']);
  return battleResult(state, setup);
}

/**
 * Воспроизведение боя из записи. Возвращает финальное состояние.
 * Гарантия детерминизма: те же (seed, setup, actions) → тот же лог.
 */
export function replay(
  setup: BattleSetup,
  actions: Action[],
  aiSides: Side[] = ['B'],
): BattleState {
  const state = createBattle(setup);
  runAI(state, aiSides);
  for (const a of actions) {
    if (state.finished) break;
    applyAction(state, a);
    runAI(state, aiSides);
  }
  return state;
}

/** Сторона, за которую сейчас ход человека (или null). */
export function humanTurn(state: BattleState, side: Side): boolean {
  const s = activeStack(state);
  return !!s && s.side === side && !state.finished;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBattle, applyAction, legalMoves, activeStack, effHp, isAlive } from '../src/battle.ts';
import { simulate, replay } from '../src/simulate.ts';
import { runAI, chooseAction } from '../src/ai.ts';
import { armyPower, unitPower } from '../src/power.ts';
import { UNITS, unitsOfFaction } from '../src/content/units.ts';
import { FACTION_IDS } from '../src/content/factions.ts';
import { abilitiesForGuild } from '../src/content/abilities.ts';
import { xpForLevel, levelFromXp } from '../src/content/heroes.ts';
import type { BattleHero, BattleSetup, FactionId } from '../src/types.ts';

function hero(faction: FactionId, over: Partial<BattleHero> = {}): BattleHero {
  return {
    name: 'Тест', faction, attack: 2, defense: 2, power: 2, knowledge: 3,
    morale: 0, luck: 0, abilities: abilitiesForGuild(3), ...over,
  };
}

function setup(seed: number, fa: FactionId = 'castle', fb: FactionId = 'stronghold'): BattleSetup {
  const a = unitsOfFaction(fa);
  const b = unitsOfFaction(fb);
  return {
    seed,
    A: { hero: hero(fa), army: [
      { unitId: a[0].id, count: 30 },
      { unitId: a[1].id, count: 15 },
      { unitId: a[3].id, count: 6 },
      { unitId: a[5].id, count: 2 },
    ] },
    B: { hero: hero(fb), army: [
      { unitId: b[0].id, count: 30 },
      { unitId: b[2].id, count: 12 },
      { unitId: b[4].id, count: 4 },
      { unitId: b[6].id, count: 1 },
    ] },
  };
}

test('бой создаётся и имеет активный стек', () => {
  const s = createBattle(setup(1));
  assert.equal(s.stacks.length, 8);
  assert.equal(s.round, 1);
  assert.ok(activeStack(s), 'должен быть активный стек');
  assert.ok(!s.finished);
});

test('стартовая расстановка: свои по краям, без наложений', () => {
  const s = createBattle(setup(7));
  const seen = new Set<string>();
  for (const st of s.stacks) {
    assert.ok(st.x >= 0 && st.x < s.width);
    assert.ok(st.y >= 0 && st.y < s.height);
    assert.equal(st.x, st.side === 'A' ? 0 : s.width - 1);
    const k = `${st.side}:${st.x},${st.y}`;
    assert.ok(!seen.has(k), 'стеки не должны накладываться');
    seen.add(k);
  }
});

test('автобой завершается и даёт победителя', () => {
  const r = simulate(setup(42));
  assert.ok(r.rounds >= 1 && r.rounds <= 30);
  assert.ok(r.winner === 'A' || r.winner === 'B' || r.winner === null);
  assert.equal(r.log.at(-1)?.t, 'end');
});

test('автобой детерминирован по seed', () => {
  const a = simulate(setup(12345));
  const b = simulate(setup(12345));
  assert.deepEqual(a.survivors, b.survivors);
  assert.equal(a.winner, b.winner);
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
});

test('разные seed дают разные бои', () => {
  const logs = new Set<string>();
  for (let i = 0; i < 12; i++) logs.add(JSON.stringify(simulate(setup(i)).log));
  assert.ok(logs.size > 1, 'seed должен влиять на исход');
});

test('реплей из записи действий совпадает с исходным боем', () => {
  const st = setup(777);
  const state = createBattle(st);
  runAI(state, ['B']);
  const actions = [];
  let guard = 0;
  while (!state.finished && guard++ < 500) {
    const act = chooseAction(state);
    actions.push(act);
    applyAction(state, act);
    runAI(state, ['B']);
  }
  const restored = replay(st, actions, ['B']);
  assert.equal(restored.winner, state.winner);
  assert.equal(JSON.stringify(restored.log), JSON.stringify(state.log));
});

test('все 4 фракции доигрывают бой друг с другом', () => {
  for (const a of FACTION_IDS) {
    for (const b of FACTION_IDS) {
      const r = simulate(setup(101, a, b));
      assert.equal(r.log.at(-1)?.t, 'end', `${a} vs ${b} должен завершиться`);
    }
  }
});

test('баланс: ни одна фракция не выигрывает больше 80% зеркальных серий', () => {
  const wins: Record<string, number> = {};
  let total = 0;
  for (const a of FACTION_IDS) {
    for (const b of FACTION_IDS) {
      if (a === b) continue;
      for (let seed = 0; seed < 12; seed++) {
        const r = simulate(setup(seed * 31 + 5, a, b));
        total++;
        if (r.winner === 'A') wins[a] = (wins[a] ?? 0) + 1;
        else if (r.winner === 'B') wins[b] = (wins[b] ?? 0) + 1;
      }
    }
  }
  const games = (total * 2) / FACTION_IDS.length;
  for (const f of FACTION_IDS) {
    const wr = (wins[f] ?? 0) / games;
    assert.ok(wr < 0.8, `${f} выигрывает ${(wr * 100).toFixed(0)}% — слишком доминирует`);
  }
});

test('нелегальное действие отклоняется', () => {
  const s = createBattle(setup(9));
  assert.throws(() => applyAction(s, { type: 'move', x: 99, y: 99 }));
  assert.throws(() => applyAction(s, { type: 'shoot', targetId: 12345 }));
});

test('ожидание переносит ход в конец раунда', () => {
  const s = createBattle(setup(3));
  const first = activeStack(s)!.id;
  const legal = legalMoves(s)!;
  if (legal.canWait) {
    applyAction(s, { type: 'wait' });
    assert.notEqual(activeStack(s)?.id, first);
    assert.ok(s.waitQueue.includes(first));
  }
});

test('приём героя тратит связи и работает раз в раунд', () => {
  const st = setup(55);
  const s = createBattle(st);
  const enemy = s.stacks.find((x) => x.side !== activeStack(s)!.side && isAlive(x))!;
  const side = activeStack(s)!.side;
  const before = s.heroes[side].mana;
  applyAction(s, { type: 'cast', abilityId: 'zapugivanie', targetId: enemy.id });
  assert.ok(s.heroes[side].mana < before, 'связи должны тратиться');
  assert.throws(
    () => applyAction(s, { type: 'cast', abilityId: 'zapugivanie', targetId: enemy.id }),
    /раунде/,
  );
});

test('«Наезд» наносит урон вражескому стеку', () => {
  const st = setup(88);
  const s = createBattle(st);
  const side = activeStack(s)!.side;
  const enemy = s.stacks.find((x) => x.side !== side && isAlive(x))!;
  const before = effHp(enemy);
  applyAction(s, { type: 'cast', abilityId: 'naezd', targetId: enemy.id });
  assert.ok(effHp(enemy) < before, 'урон должен пройти');
});

test('оценка силы монотонна по тирам', () => {
  for (const f of FACTION_IDS) {
    const line = unitsOfFaction(f);
    for (let i = 1; i < line.length; i++) {
      assert.ok(
        unitPower(line[i]) > unitPower(line[i - 1]),
        `${f}: T${i + 1} должен быть сильнее T${i}`,
      );
    }
  }
});

test('контент консистентен', () => {
  for (const [id, u] of Object.entries(UNITS)) {
    assert.equal(u.id, id);
    assert.ok(u.minDmg <= u.maxDmg, `${id}: minDmg > maxDmg`);
    assert.ok(u.hp > 0 && u.speed > 0 && u.growth > 0, `${id}: некорректные статы`);
    assert.ok((u.cost.nal ?? 0) > 0, `${id}: нет цены`);
    if (u.traits.includes('SHOOTER')) assert.ok(u.shots > 0, `${id}: стрелок без патронов`);
  }
  for (const f of FACTION_IDS) assert.equal(unitsOfFaction(f).length, 7, `${f}: не 7 тиров`);
});

test('кривая уровней согласована', () => {
  assert.equal(levelFromXp(0), 1);
  for (let l = 2; l <= 20; l++) {
    assert.equal(levelFromXp(xpForLevel(l)), l);
    assert.equal(levelFromXp(xpForLevel(l) - 1), l - 1);
  }
});

test('armyPower растёт с количеством', () => {
  const a = armyPower([{ unitId: 'cas1', count: 10 }]);
  const b = armyPower([{ unitId: 'cas1', count: 20 }]);
  assert.equal(b, a * 2);
});

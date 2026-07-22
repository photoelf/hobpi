/**
 * Автотюнер баланса. Ищет per-фракционный множитель урона, при котором винрейты
 * всех фракций сходятся к 50%, и печатает итоговую таблицу статов для вклейки
 * в content/units.ts.
 *
 * Запуск: node tools/autotune.ts [итераций] [боёв_на_пару]
 *
 * Это не «магический баланс», а автоматизация того, что дизайнер делает руками:
 * ищет масштаб урона линейки. Форму линейки (кто танк, кто стрелок) он не трогает.
 */
import { simulate } from '../packages/engine/src/simulate.ts';
import { FACTION_IDS, FACTIONS } from '../packages/engine/src/content/factions.ts';
import { UNITS, unitsOfFaction } from '../packages/engine/src/content/units.ts';
import { abilitiesForGuild } from '../packages/engine/src/content/abilities.ts';
import type { ArmyStackInput, BattleHero, FactionId } from '../packages/engine/src/types.ts';

const ITERS = Number(process.argv[2] ?? 14);
const N = Number(process.argv[3] ?? 60);
const BUDGET = 12000;

const base = Object.fromEntries(
  Object.values(UNITS).map((u) => [u.id, { min: u.minDmg, max: u.maxDmg }]),
);

const hero = (f: FactionId): BattleHero => ({
  name: 'Тест', faction: f, attack: 2, defense: 2, power: 2, knowledge: 3,
  morale: 0, luck: 0, abilities: abilitiesForGuild(3),
});

const unitCost = (u: { cost: { nal?: number; tovar?: number; influence?: number } }) =>
  (u.cost.nal ?? 0) + (u.cost.tovar ?? 0) * 40 + (u.cost.influence ?? 0) * 400;

const army = (f: FactionId): ArmyStackInput[] => {
  const line = unitsOfFaction(f);
  const perK = line.reduce((s, u) => s + u.growth * unitCost(u), 0);
  const k = BUDGET / perK;
  return line.map((u) => ({ unitId: u.id, count: Math.max(1, Math.round(u.growth * k)) }));
};

/** Применяет множитель урона к линейке фракции (целые числа, min ≥ 1, min ≤ max). */
function applyScale(f: FactionId, scale: number): void {
  for (const u of unitsOfFaction(f)) {
    const b = base[u.id];
    u.minDmg = Math.max(1, Math.round(b.min * scale));
    u.maxDmg = Math.max(u.minDmg, Math.round(b.max * scale));
  }
}

function winRates(): Record<string, number> {
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  for (const a of FACTION_IDS) {
    for (const b of FACTION_IDS) {
      if (a === b) continue;
      for (let s = 0; s < N; s++) {
        const r = simulate({
          seed: (s * 7919 + 13) >>> 0,
          A: { hero: hero(a), army: army(a) },
          B: { hero: hero(b), army: army(b) },
        });
        games[a] = (games[a] ?? 0) + 1;
        games[b] = (games[b] ?? 0) + 1;
        if (r.winner === 'A') wins[a] = (wins[a] ?? 0) + 1;
        else if (r.winner === 'B') wins[b] = (wins[b] ?? 0) + 1;
      }
    }
  }
  return Object.fromEntries(FACTION_IDS.map((f) => [f, (wins[f] ?? 0) / games[f]]));
}

const scale: Record<string, number> = Object.fromEntries(FACTION_IDS.map((f) => [f, 1]));
let best = { spread: Infinity, scale: { ...scale }, wr: {} as Record<string, number> };

for (let it = 1; it <= ITERS; it++) {
  for (const f of FACTION_IDS) applyScale(f, scale[f]);
  const wr = winRates();
  const spread = Math.max(...Object.values(wr)) - Math.min(...Object.values(wr));
  const mark = spread < best.spread ? ' ← лучшая' : '';
  if (spread < best.spread) best = { spread, scale: { ...scale }, wr };
  console.log(
    `#${String(it).padStart(2)}  разброс ${(spread * 100).toFixed(1).padStart(5)}%  ` +
      FACTION_IDS.map(
        (f) => `${f.slice(0, 4)} ${(wr[f] * 100).toFixed(0).padStart(2)}%(×${scale[f].toFixed(3)})`,
      ).join('  ') + mark,
  );
  if (spread < 0.1) break;
  // затухающая коррекция: недобирающие винрейт получают больше урона
  for (const f of FACTION_IDS) {
    const adj = Math.pow(0.5 / Math.max(0.08, wr[f]), 0.1);
    scale[f] = Math.max(0.5, Math.min(2, scale[f] * adj));
  }
}

for (const f of FACTION_IDS) {
  scale[f] = best.scale[f];
  applyScale(f, scale[f]);
}
console.log(`\nЛучшая конфигурация: разброс ${(best.spread * 100).toFixed(1)}%`);

console.log('\nИтоговые значения урона (вклеить в content/units.ts):\n');
for (const f of FACTION_IDS) {
  console.log(`// ${FACTIONS[f].name} (×${scale[f].toFixed(3)})`);
  for (const u of unitsOfFaction(f)) {
    const b = base[u.id];
    const mark = b.min !== u.minDmg || b.max !== u.maxDmg ? '  <-- изменено' : '';
    console.log(`  ${u.id}: minDmg: ${u.minDmg}, maxDmg: ${u.maxDmg}${mark}`);
  }
}
console.log();

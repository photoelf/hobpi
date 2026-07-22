/**
 * Балансный автопрогон: гоняет автобои всех пар фракций и печатает винрейты.
 * Запуск: node tools/balance.ts [боёв_на_пару]
 *
 * Ориентир здоровья баланса: винрейт каждой фракции в коридоре 40–60%.
 */
import { simulate } from '../packages/engine/src/simulate.ts';
import { FACTION_IDS, FACTIONS } from '../packages/engine/src/content/factions.ts';
import { unitsOfFaction } from '../packages/engine/src/content/units.ts';
import { abilitiesForGuild } from '../packages/engine/src/content/abilities.ts';
import { armyPower } from '../packages/engine/src/power.ts';
import type { ArmyStackInput, BattleHero, FactionId } from '../packages/engine/src/types.ts';

const N = Number(process.argv[2] ?? 200);

const hero = (f: FactionId): BattleHero => ({
  name: 'Тест', faction: f, attack: 2, defense: 2, power: 2, knowledge: 3,
  morale: 0, luck: 0, abilities: abilitiesForGuild(3),
});

const BUDGET = Number(process.env.BUDGET ?? 12000);

/**
 * Бригада «за равные деньги»: как у живого игрока, накопившего N налика
 * и скупившего весь доступный недельный прирост пропорционально.
 * Это единственный честный способ сравнивать фракции между собой.
 */
const army = (f: FactionId, budget = BUDGET): ArmyStackInput[] => {
  const line = unitsOfFaction(f);
  // «нормальная» пропорция закупки — по недельному приросту
  const unitCost = (u: (typeof line)[number]) =>
    (u.cost.nal ?? 0) + (u.cost.tovar ?? 0) * 40 + (u.cost.influence ?? 0) * 400;
  const perK = line.reduce((sum, u) => sum + u.growth * unitCost(u), 0);
  const k = budget / perK;
  return line
    .map((u) => ({ unitId: u.id, count: Math.max(1, Math.round(u.growth * k)) }))
    .filter((a) => a.count > 0);
};

const wins: Record<string, number> = {};
const games: Record<string, number> = {};
const matrix: Record<string, Record<string, number>> = {};
let draws = 0;
let totalRounds = 0;
let battles = 0;

for (const a of FACTION_IDS) {
  matrix[a] = {};
  for (const b of FACTION_IDS) {
    if (a === b) continue;
    let aWins = 0;
    for (let s = 0; s < N; s++) {
      const r = simulate({
        seed: (s * 7919 + 13) >>> 0,
        A: { hero: hero(a), army: army(a) },
        B: { hero: hero(b), army: army(b) },
      });
      battles++;
      totalRounds += r.rounds;
      games[a] = (games[a] ?? 0) + 1;
      games[b] = (games[b] ?? 0) + 1;
      if (r.winner === 'A') { wins[a] = (wins[a] ?? 0) + 1; aWins++; }
      else if (r.winner === 'B') wins[b] = (wins[b] ?? 0) + 1;
      else draws++;
    }
    matrix[a][b] = aWins / N;
  }
}

console.log(`\nБоёв: ${battles}, средняя длина: ${(totalRounds / battles).toFixed(1)} раундов, ничьих: ${draws}\n`);

console.log('Общий винрейт:');
for (const f of FACTION_IDS) {
  const wr = ((wins[f] ?? 0) / games[f]) * 100;
  const bar = '█'.repeat(Math.round(wr / 2)).padEnd(50, '·');
  const flag = wr < 40 || wr > 60 ? ' ⚠' : '';
  console.log(`  ${FACTIONS[f].name.padEnd(20)} ${wr.toFixed(1).padStart(5)}%  ${bar}${flag}`);
}

console.log('\nМатрица (строка атакует столбец, % побед строки):');
const head = FACTION_IDS.map((f) => f.slice(0, 6).padStart(7)).join('');
console.log(''.padEnd(20) + head);
for (const a of FACTION_IDS) {
  const row = FACTION_IDS
    .map((b) => (a === b ? '—' : (matrix[a][b] * 100).toFixed(0) + '%').padStart(7))
    .join('');
  console.log(FACTIONS[a].name.slice(0, 19).padEnd(20) + row);
}

console.log('\nСила эталонной бригады (armyPower):');
for (const f of FACTION_IDS) {
  console.log(`  ${FACTIONS[f].name.padEnd(20)} ${armyPower(army(f)).toLocaleString('ru-RU')}`);
}
console.log();

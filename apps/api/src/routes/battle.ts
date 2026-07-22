/**
 * Бои. Сервер — единственный источник истины: клиент присылает только намерение,
 * все расчёты и все награды считаются здесь.
 */
import {
  applyAction, armyPower, battleResult, createBattle, rng, runAI, unitOfTier,
} from '@hobpi/engine';
import type { Action, BattleSetup, BattleState, FactionId } from '@hobpi/engine';
import { requirePlayer } from '../auth.ts';
import {
  getPlayer, now, setArmy, updatePlayer,
  type BattleRow, type Db, type PlayerRow, type SessionRow,
} from '../db.ts';
import {
  GameError, accrue, addXp, armyInput, battleHero, grant, playerPower, stateSnapshot,
} from '../game.ts';
import { campsFor, rollArtifact, type Difficulty } from '../pve.ts';
import type { Ctx, Route } from '../http.ts';

const SESSION_TTL_MS = 30 * 60 * 1000;
const FUEL_PVE = 1;
const FUEL_PVP = 2;
const ELO_K = 32;
/** Кулдаун на повторную атаку одного и того же игрока */
const REATTACK_MS = 6 * 3600 * 1000;
const CAMP_EPOCH_MS = 30 * 60 * 1000;

interface BattleMeta {
  difficulty?: Difficulty;
  campName?: string;
  reward?: { nal: number; tovar: number; influence: number; xp: number };
  defenderName?: string;
  defenderFaction?: string;
  attackerName?: string;
  attackerFaction?: string;
}

async function activeSession(db: Db, playerId: number): Promise<SessionRow | undefined> {
  await db.run('DELETE FROM sessions WHERE expires_at < ?', now());
  return db.get<SessionRow>(
    'SELECT * FROM sessions WHERE player_id = ? ORDER BY id DESC LIMIT 1', playerId,
  );
}

async function spendFuel(db: Db, p: PlayerRow, amount: number): Promise<void> {
  await accrue(db, p);
  if (p.fuel < amount) throw new GameError(`Не хватает топлива (нужно ${amount})`);
  p.fuel -= amount;
  await updatePlayer(db, p.id, { fuel: p.fuel, fuel_at: p.fuel_at || now() });
}

/** Elo с K=32. */
function elo(a: number, b: number, aWon: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (b - a) / 400));
  return Math.round(ELO_K * ((aWon ? 1 : 0) - expected));
}

/** Записывает бой, применяет потери и награды. Возвращает сводку для клиента. */
async function resolve(
  db: Db,
  session: { player_id: number; kind: string; target_id: number | null; seed: number; auto: boolean },
  setup: BattleSetup,
  state: BattleState,
  actions: Action[],
  meta: BattleMeta,
) {
  const result = battleResult(state, setup);
  const p = await getPlayer(db, session.player_id);
  if (!p) throw new GameError('Игрок не найден');
  const won = result.winner === 'A';

  // потери атакующего — реальные
  const newArmy = setup.A.army
    .map((a, i) => ({ unitId: a.unitId, count: result.survivors.A[i] ?? 0 }))
    .filter((a) => a.count > 0);

  // защита от тупика: без бригады игрок не может ни воевать, ни зарабатывать.
  // Район подкидывает горстку пацанов — бесплатно и только когда всё потеряно.
  let rescued = 0;
  if (!newArmy.length) {
    const t1 = unitOfTier(p.faction as FactionId, 1);
    if (t1) {
      rescued = 5;
      newArmy.push({ unitId: t1.id, count: rescued });
    }
  }
  await setArmy(db, p.id, newArmy);

  const summary: Record<string, unknown> = {
    kind: session.kind,
    auto: session.auto,
    winner: result.winner,
    rounds: result.rounds,
    rescued,
    ...meta,
    losses: setup.A.army.map((a, i) => ({
      unitId: a.unitId, before: a.count, after: result.survivors.A[i] ?? 0,
    })),
  };

  if (session.kind === 'pve') {
    if (won && meta.reward) {
      await grant(db, p, {
        nal: meta.reward.nal, tovar: meta.reward.tovar, influence: meta.reward.influence,
      });
      const lvl = await addXp(db, p, meta.reward.xp);
      const art = rollArtifact(session.seed ^ 0x5bf03635, meta.difficulty ?? 'normal');
      if (art) {
        await db.run('INSERT INTO artifacts (player_id, art_id, equipped) VALUES (?, ?, 0)', p.id, art);
      }
      summary.reward = meta.reward;
      summary.artifact = art;
      summary.levelsGained = lvl.levelsGained;
    }
    await updatePlayer(db, p.id, won ? { wins: p.wins + 1 } : { losses: p.losses + 1 });
  } else {
    const d = session.target_id ? await getPlayer(db, session.target_id) : null;
    if (d) {
      // защитник восстанавливает половину павших — цена обороны ниже цены атаки
      const restored = setup.B.army
        .map((a, i) => {
          const alive = result.survivors.B[i] ?? 0;
          return { unitId: a.unitId, count: alive + Math.floor((a.count - alive) * 0.5) };
        })
        .filter((a) => a.count > 0);
      await setArmy(db, d.id, restored);

      const delta = elo(p.rating, d.rating, won);
      await updatePlayer(db, p.id, {
        rating: Math.max(100, p.rating + delta),
        wins: won ? p.wins + 1 : p.wins,
        losses: won ? p.losses : p.losses + 1,
      });
      await updatePlayer(db, d.id, {
        rating: Math.max(100, d.rating - delta),
        wins: won ? d.wins : d.wins + 1,
        losses: won ? d.losses + 1 : d.losses,
        shield_until: won ? now() + 30 * 60 * 1000 : d.shield_until,
      });
      p.rating += delta;

      if (won) {
        const loot = Math.min(3000, Math.floor(d.nal * 0.05));
        if (loot > 0) await updatePlayer(db, d.id, { nal: d.nal - loot });
        await grant(db, p, loot > 0 ? { nal: loot, influence: 2 } : { influence: 2 });
        const xp = Math.round(armyPower(setup.B.army) / 6);
        summary.levelsGained = (await addXp(db, p, xp)).levelsGained;
        summary.loot = loot;
        summary.xp = xp;
      }
      summary.ratingDelta = delta;
    }
  }

  const info = await db.run(
    `INSERT INTO battles (attacker_id, defender_id, kind, auto, seed, setup_json,
                          actions_json, result, summary_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id, session.target_id, session.kind, session.auto ? 1 : 0, session.seed,
    JSON.stringify(setup), JSON.stringify(actions),
    result.winner ?? 'draw', JSON.stringify(summary), now(),
  );

  return { battleId: info.lastInsertRowid, summary, winner: result.winner };
}

/* ── Эндпоинты ───────────────────────────────────────────────────── */

/** Доступные PvE-цели. Обновляются раз в 30 минут, одинаковы при перезаходе. */
async function camps({ req, cfg, db }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);
  const epoch = Math.floor(now() / CAMP_EPOCH_MS);
  return {
    epoch,
    camps: campsFor(await playerPower(db, p), epoch).map((c) => ({
      id: c.id, name: c.name, faction: c.faction, difficulty: c.difficulty,
      power: c.power, army: c.army, reward: c.reward,
    })),
  };
}

/** Текущий незавершённый бой, если игрок вышел из мини-аппа посреди боя. */
async function current({ req, cfg, db }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const s = await activeSession(db, p.id);
  if (!s) return { active: false };
  return {
    active: true,
    battleId: s.id,
    state: JSON.parse(s.state_json),
    setup: JSON.parse(s.setup_json),
    meta: JSON.parse(s.meta_json),
  };
}

async function startBattle({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);

  if (await activeSession(db, p.id)) throw new GameError('Уже идёт бой — сначала закончи его');
  const army = await armyInput(db, p.id);
  if (!army.length) throw new GameError('Бригада пуста — сначала найми бойцов');

  const kind = body.kind === 'pvp' ? 'pvp' : 'pve';
  const auto = !!body.auto;
  const seed = rng.randomSeed();

  let setup: BattleSetup;
  let meta: BattleMeta;
  let targetId: number | null = null;

  if (kind === 'pve') {
    const difficulty = (body.difficulty ?? 'normal') as Difficulty;
    const epoch = Math.floor(now() / CAMP_EPOCH_MS);
    const camp = campsFor(await playerPower(db, p), epoch).find((c) => c.difficulty === difficulty);
    if (!camp) throw new GameError('Лагерь не найден');
    await spendFuel(db, p, FUEL_PVE);
    setup = {
      seed,
      A: { hero: await battleHero(db, p), army },
      B: { hero: camp.hero, army: camp.army },
    };
    meta = {
      difficulty, campName: camp.name, reward: camp.reward,
      attackerName: p.name, attackerFaction: p.faction,
      defenderName: camp.name, defenderFaction: camp.faction,
    };
  } else {
    const d = body.targetId ? await getPlayer(db, Number(body.targetId)) : null;
    if (!d) throw new GameError('Соперник не найден');
    if (d.id === p.id) throw new GameError('Сам себя не отожмёшь');
    if (d.shield_until > now()) throw new GameError('У соперника сейчас щит');

    const recent = await db.get<{ created_at: number }>(
      'SELECT created_at FROM battles WHERE attacker_id = ? AND defender_id = ? ORDER BY id DESC LIMIT 1',
      p.id, d.id,
    );
    if (recent && now() - recent.created_at < REATTACK_MS) {
      throw new GameError('На этого уже наезжали недавно — подожди');
    }
    const dArmy = await armyInput(db, d.id);
    if (!dArmy.length) throw new GameError('У соперника пустая бригада');

    await spendFuel(db, p, FUEL_PVP);
    // напал сам — щит новичка с себя снял: нельзя бить безнаказанно из-под защиты
    if (p.shield_until > now()) {
      p.shield_until = 0;
      await updatePlayer(db, p.id, { shield_until: 0 });
    }
    targetId = d.id;
    setup = {
      seed,
      A: { hero: await battleHero(db, p), army },
      B: { hero: await battleHero(db, d), army: dArmy },
    };
    meta = {
      attackerName: p.name, attackerFaction: p.faction,
      defenderName: d.name, defenderFaction: d.faction,
    };
  }

  if (auto) {
    const state = createBattle(setup);
    runAI(state, ['A', 'B']);
    const res = await resolve(
      db, { player_id: p.id, kind, target_id: targetId, seed, auto: true }, setup, state, [], meta,
    );
    const fresh = (await getPlayer(db, p.id))!;
    return { auto: true, ...res, rounds: state.round, playerState: await stateSnapshot(db, fresh) };
  }

  const state = createBattle(setup);
  runAI(state, ['B']);
  const info = await db.run(
    `INSERT INTO sessions (player_id, kind, target_id, seed, setup_json, state_json,
                           actions_json, meta_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
    p.id, kind, targetId, seed, JSON.stringify(setup), JSON.stringify(state),
    JSON.stringify(meta), now() + SESSION_TTL_MS,
  );

  return { auto: false, battleId: info.lastInsertRowid, setup, state, meta };
}

async function act({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const s = await activeSession(db, p.id);
  if (!s || s.id !== Number(body.battleId)) throw new GameError('Бой не найден');

  const state = JSON.parse(s.state_json) as BattleState;
  const setup = JSON.parse(s.setup_json) as BattleSetup;
  const actions = JSON.parse(s.actions_json) as Action[];
  const meta = JSON.parse(s.meta_json) as BattleMeta;

  const action = body.action as Action | undefined;
  if (!action) throw new GameError('Нет действия');

  applyAction(state, action);
  actions.push(action);
  runAI(state, ['B']);

  if (state.finished) {
    await db.run('DELETE FROM sessions WHERE id = ?', s.id);
    const res = await resolve(
      db, { player_id: p.id, kind: s.kind, target_id: s.target_id, seed: s.seed, auto: false },
      setup, state, actions, meta,
    );
    const fresh = (await getPlayer(db, p.id))!;
    return { state, finished: true, ...res, playerState: await stateSnapshot(db, fresh) };
  }

  await db.run(
    'UPDATE sessions SET state_json = ?, actions_json = ? WHERE id = ?',
    JSON.stringify(state), JSON.stringify(actions), s.id,
  );
  return { state, finished: false };
}

/** Отступление: армия сохраняется как есть, трофеев нет. */
async function retreat({ req, cfg, db, body }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const s = await activeSession(db, p.id);
  if (!s || s.id !== Number(body.battleId)) throw new GameError('Бой не найден');
  await db.run('DELETE FROM sessions WHERE id = ?', s.id);
  return { retreated: true, playerState: await stateSnapshot(db, p) };
}

/** Реплей: клиент восстанавливает бой из seed + действий тем же движком. */
async function replayData({ req, cfg, db, params }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const row = await db.get<BattleRow>('SELECT * FROM battles WHERE id = ?', Number(params.id));
  if (!row) throw new GameError('Бой не найден');
  if (row.attacker_id !== p.id && row.defender_id !== p.id) throw new GameError('Это не твой бой');
  return {
    id: row.id,
    kind: row.kind,
    auto: !!row.auto,
    setup: JSON.parse(row.setup_json),
    actions: JSON.parse(row.actions_json),
    aiSides: row.auto ? ['A', 'B'] : ['B'],
    result: row.result,
    summary: JSON.parse(row.summary_json),
    createdAt: row.created_at,
    viewerSide: row.attacker_id === p.id ? 'A' : 'B',
  };
}

export const battleRoutes: Route[] = [
  { method: 'GET', path: '/api/pve/camps', handler: camps },
  { method: 'GET', path: '/api/battle/current', handler: current },
  { method: 'POST', path: '/api/battle/start', handler: startBattle },
  { method: 'POST', path: '/api/battle/act', handler: act },
  { method: 'POST', path: '/api/battle/retreat', handler: retreat },
  { method: 'GET', path: '/api/battle/:id', handler: replayData },
];

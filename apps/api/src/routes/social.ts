import { FACTIONS } from '@hobpi/engine';
import type { FactionId } from '@hobpi/engine';
import { requirePlayer } from '../auth.ts';
import { now, type PlayerRow } from '../db.ts';
import { accrue, playerPower, rankOf } from '../game.ts';
import type { Ctx, Route } from '../http.ts';

/** Подбор соперников: окно по силе расширяется, пока не наберётся 5 кандидатов. */
async function opponents({ req, cfg, db }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  await accrue(db, p);
  const myPower = await playerPower(db, p);

  const rows = await db.all<PlayerRow>(
    `SELECT * FROM players
     WHERE id != ? AND shield_until < ?
       AND id IN (SELECT DISTINCT player_id FROM army)
     ORDER BY ABS(rating - ?) LIMIT 40`,
    p.id, now(), p.rating,
  );

  const scored = await Promise.all(rows.map(async (o) => {
    const power = await playerPower(db, o);
    return {
      id: o.id,
      name: o.name,
      faction: o.faction,
      factionName: FACTIONS[o.faction as FactionId]?.name ?? o.faction,
      factionIcon: FACTIONS[o.faction as FactionId]?.icon ?? '❓',
      level: o.level,
      rating: o.rating,
      rank: rankOf(o),
      power,
      // относительная сила для UI: <0.85 «слабый», >1.15 «сильный»
      relative: myPower > 0 ? power / myPower : 1,
    };
  }));

  let picked: typeof scored = [];
  for (let window = 0.15; window <= 0.5 && picked.length < 5; window += 0.1) {
    picked = scored.filter((o) => Math.abs(o.relative - 1) <= window);
  }
  if (picked.length < 5) picked = scored.slice(0, 5);

  return { opponents: picked.slice(0, 5), myPower };
}

async function ladder({ req, cfg, db }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const rows = await db.all<Pick<PlayerRow, 'id' | 'name' | 'faction' | 'level' | 'rating' | 'wins' | 'losses'>>(
    'SELECT id, name, faction, level, rating, wins, losses FROM players ORDER BY rating DESC LIMIT 25',
  );
  const place = await db.get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM players WHERE rating > ?', p.rating,
  );

  return {
    top: rows.map((r, i) => ({
      place: i + 1,
      ...r,
      factionIcon: FACTIONS[r.faction as FactionId]?.icon ?? '❓',
      me: r.id === p.id,
    })),
    myPlace: (place?.c ?? 0) + 1,
  };
}

async function history({ req, cfg, db }: Ctx) {
  const p = await requirePlayer(req, cfg, db);
  const rows = await db.all<{
    id: number; attacker_id: number; defender_id: number | null; kind: string;
    auto: number; result: string; summary_json: string; created_at: number;
  }>(
    `SELECT id, attacker_id, defender_id, kind, auto, result, summary_json, created_at
     FROM battles WHERE attacker_id = ? OR defender_id = ?
     ORDER BY id DESC LIMIT 20`,
    p.id, p.id,
  );

  return {
    battles: rows.map((r) => {
      const s = JSON.parse(r.summary_json) as Record<string, unknown>;
      const iAmAttacker = r.attacker_id === p.id;
      const iWon = iAmAttacker ? r.result === 'A' : r.result === 'B';
      return {
        id: r.id,
        kind: r.kind,
        auto: !!r.auto,
        attacked: iAmAttacker,
        won: iWon,
        draw: r.result === 'draw',
        opponent: iAmAttacker ? s.defenderName : s.attackerName,
        rounds: s.rounds,
        ratingDelta: iAmAttacker
          ? s.ratingDelta
          : typeof s.ratingDelta === 'number' ? -s.ratingDelta : undefined,
        createdAt: r.created_at,
      };
    }),
  };
}

export const socialRoutes: Route[] = [
  { method: 'GET', path: '/api/arena/opponents', handler: opponents },
  { method: 'GET', path: '/api/ladder', handler: ladder },
  { method: 'GET', path: '/api/history', handler: history },
];

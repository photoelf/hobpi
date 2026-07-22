/**
 * Доступ к БД через тонкий асинхронный интерфейс.
 *
 * Две реализации:
 *   • Cloudflare D1        — прод (apps/api/src/adapters/d1.ts)
 *   • node:sqlite          — локальная разработка и тесты (adapters/node.ts)
 *
 * D1 — это тот же SQLite, поэтому SQL одинаков для обоих. Интерфейс асинхронный,
 * потому что D1 иначе не умеет; node-адаптер просто оборачивает синхронные вызовы.
 */

export type SqlValue = string | number | null;

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

export interface Db {
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, ...params: SqlValue[]): Promise<T | undefined>;
  run(sql: string, ...params: SqlValue[]): Promise<RunResult>;
}

export const now = (): number => Date.now();

/* ── Строки таблиц ───────────────────────────────────────────────── */

export interface PlayerRow {
  id: number;
  tg_id: string;
  name: string;
  faction: string;
  hero_class: string;
  level: number;
  xp: number;
  atk: number;
  def: number;
  power: number;
  knowledge: number;
  nal: number;
  influence: number;
  svyazi: number;
  tovar: number;
  fuel: number;
  fuel_at: number;
  income_at: number;
  growth_at: number;
  rating: number;
  wins: number;
  losses: number;
  shield_until: number;
  created_at: number;
}

export interface BattleRow {
  id: number;
  attacker_id: number;
  defender_id: number | null;
  kind: string;
  auto: number;
  seed: number;
  setup_json: string;
  actions_json: string;
  result: string;
  summary_json: string;
  created_at: number;
}

export interface SessionRow {
  id: number;
  player_id: number;
  kind: string;
  target_id: number | null;
  seed: number;
  setup_json: string;
  state_json: string;
  actions_json: string;
  meta_json: string;
  expires_at: number;
}

/* ── Запросы ─────────────────────────────────────────────────────── */

export const getPlayerByTg = (db: Db, tgId: string) =>
  db.get<PlayerRow>('SELECT * FROM players WHERE tg_id = ?', tgId);

export const getPlayer = (db: Db, id: number) =>
  db.get<PlayerRow>('SELECT * FROM players WHERE id = ?', id);

export async function updatePlayer(db: Db, id: number, patch: Partial<PlayerRow>): Promise<void> {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sql = `UPDATE players SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  await db.run(sql, ...keys.map((k) => (patch as Record<string, SqlValue>)[k]), id);
}

export async function getBuildings(db: Db, playerId: number): Promise<Record<string, number>> {
  const rows = await db.all<{ key: string; level: number }>(
    'SELECT key, level FROM buildings WHERE player_id = ?', playerId,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.level]));
}

export const getSpots = (db: Db, playerId: number) =>
  db.all<{ key: string; level: number }>(
    'SELECT key, level FROM spots WHERE player_id = ?', playerId,
  );

export async function getArmy(
  db: Db,
  playerId: number,
): Promise<Array<{ slot: number; unitId: string; count: number }>> {
  const rows = await db.all<{ slot: number; unit_id: string; count: number }>(
    'SELECT slot, unit_id, count FROM army WHERE player_id = ? AND count > 0 ORDER BY slot',
    playerId,
  );
  return rows.map((r) => ({ slot: r.slot, unitId: r.unit_id, count: r.count }));
}

export async function setArmy(
  db: Db,
  playerId: number,
  army: Array<{ unitId: string; count: number }>,
): Promise<void> {
  await db.run('DELETE FROM army WHERE player_id = ?', playerId);
  const rows = army.filter((a) => a.count > 0).slice(0, 7);
  for (let i = 0; i < rows.length; i++) {
    await db.run(
      'INSERT INTO army (player_id, slot, unit_id, count) VALUES (?, ?, ?, ?)',
      playerId, i, rows[i].unitId, rows[i].count,
    );
  }
}

export async function getPool(db: Db, playerId: number): Promise<Record<string, number>> {
  const rows = await db.all<{ unit_id: string; count: number }>(
    'SELECT unit_id, count FROM pool WHERE player_id = ?', playerId,
  );
  return Object.fromEntries(rows.map((r) => [r.unit_id, r.count]));
}

export const setPool = (db: Db, playerId: number, unitId: string, count: number) =>
  db.run(
    `INSERT INTO pool (player_id, unit_id, count) VALUES (?, ?, ?)
     ON CONFLICT(player_id, unit_id) DO UPDATE SET count = excluded.count`,
    playerId, unitId, count,
  );

export async function getArtifacts(
  db: Db,
  playerId: number,
): Promise<Array<{ id: number; artId: string; equipped: boolean }>> {
  const rows = await db.all<{ id: number; art_id: string; equipped: number }>(
    'SELECT id, art_id, equipped FROM artifacts WHERE player_id = ? ORDER BY id', playerId,
  );
  return rows.map((r) => ({ id: r.id, artId: r.art_id, equipped: !!r.equipped }));
}

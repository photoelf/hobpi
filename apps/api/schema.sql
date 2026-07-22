-- Схема HoBPI. Один и тот же файл применяется к локальному node:sqlite
-- и к Cloudflare D1: npx wrangler d1 execute hobpi --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  faction     TEXT    NOT NULL,
  hero_class  TEXT    NOT NULL,
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  atk         INTEGER NOT NULL DEFAULT 1,
  def         INTEGER NOT NULL DEFAULT 1,
  power       INTEGER NOT NULL DEFAULT 1,
  knowledge   INTEGER NOT NULL DEFAULT 1,
  nal         INTEGER NOT NULL DEFAULT 0,
  influence   INTEGER NOT NULL DEFAULT 0,
  svyazi      INTEGER NOT NULL DEFAULT 0,
  tovar       INTEGER NOT NULL DEFAULT 0,
  fuel        INTEGER NOT NULL DEFAULT 10,
  fuel_at     INTEGER NOT NULL DEFAULT 0,
  income_at   INTEGER NOT NULL DEFAULT 0,
  growth_at   INTEGER NOT NULL DEFAULT 0,
  rating      INTEGER NOT NULL DEFAULT 1000,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  shield_until INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  player_id INTEGER NOT NULL,
  key       TEXT    NOT NULL,
  level     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, key)
);

CREATE TABLE IF NOT EXISTS spots (
  player_id INTEGER NOT NULL,
  key       TEXT    NOT NULL,
  level     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, key)
);

CREATE TABLE IF NOT EXISTS army (
  player_id INTEGER NOT NULL,
  slot      INTEGER NOT NULL,
  unit_id   TEXT    NOT NULL,
  count     INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot)
);

CREATE TABLE IF NOT EXISTS pool (
  player_id INTEGER NOT NULL,
  unit_id   TEXT    NOT NULL,
  count     REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, unit_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  art_id    TEXT    NOT NULL,
  equipped  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS battles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_id  INTEGER NOT NULL,
  defender_id  INTEGER,
  kind         TEXT    NOT NULL,
  auto         INTEGER NOT NULL DEFAULT 0,
  seed         INTEGER NOT NULL,
  setup_json   TEXT    NOT NULL,
  actions_json TEXT    NOT NULL DEFAULT '[]',
  result       TEXT    NOT NULL,
  summary_json TEXT    NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    INTEGER NOT NULL,
  kind         TEXT    NOT NULL,
  target_id    INTEGER,
  seed         INTEGER NOT NULL,
  setup_json   TEXT    NOT NULL,
  state_json   TEXT    NOT NULL,
  actions_json TEXT    NOT NULL DEFAULT '[]',
  meta_json    TEXT    NOT NULL DEFAULT '{}',
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_rating   ON players(rating);
CREATE INDEX IF NOT EXISTS idx_battles_defender ON battles(defender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_battles_attacker ON battles(attacker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_player  ON sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_player ON artifacts(player_id);
CREATE INDEX IF NOT EXISTS idx_army_player      ON army(player_id);

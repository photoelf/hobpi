import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Db, RunResult, SqlValue } from '../db.ts';

/**
 * Адаптер node:sqlite — локальная разработка и тесты.
 * Схема применяется автоматически из schema.sql, чтобы dev-база не расходилась с прод-D1.
 */
export function nodeDb(dbPath?: string): { db: Db; close: () => void } {
  const path = dbPath ?? process.env.DB_PATH ?? resolve(process.cwd(), 'data/game.db');
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  const schemaPath = resolve(import.meta.dirname, '../../schema.sql');
  sqlite.exec(readFileSync(schemaPath, 'utf8'));

  const db: Db = {
    async all<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...params) as unknown as T[];
    },
    async get<T>(sql: string, ...params: SqlValue[]): Promise<T | undefined> {
      return sqlite.prepare(sql).get(...params) as unknown as T | undefined;
    },
    async run(sql: string, ...params: SqlValue[]): Promise<RunResult> {
      const r = sqlite.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };

  return { db, close: () => sqlite.close() };
}

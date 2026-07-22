import type { Db, RunResult, SqlValue } from '../db.ts';

/** Минимальная часть типов D1, которая нам нужна (чтобы не тянуть @cloudflare/workers-types). */
export interface D1Result<T> {
  results: T[];
  meta: { last_row_id?: number; changes?: number; rows_written?: number };
}

export interface D1PreparedStatement {
  bind(...values: SqlValue[]): D1PreparedStatement;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

/** Адаптер Cloudflare D1. */
export function d1Db(d1: D1Database): Db {
  const stmt = (sql: string, params: SqlValue[]) =>
    params.length ? d1.prepare(sql).bind(...params) : d1.prepare(sql);

  return {
    async all<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
      const r = await stmt(sql, params).all<T>();
      return r.results ?? [];
    },
    async get<T>(sql: string, ...params: SqlValue[]): Promise<T | undefined> {
      const r = await stmt(sql, params).first<T>();
      return r ?? undefined;
    },
    async run(sql: string, ...params: SqlValue[]): Promise<RunResult> {
      const r = await stmt(sql, params).run();
      return {
        lastInsertRowid: Number(r.meta?.last_row_id ?? 0),
        changes: Number(r.meta?.changes ?? r.meta?.rows_written ?? 0),
      };
    },
  };
}

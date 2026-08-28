/**
 * expo-sqlite implementation of DbExecutor.
 * Used at runtime in the app.
 *
 * Lazy-imports `expo-sqlite` so the test environment (no native module)
 * can still use the in-memory fake without breaking import-time.
 */

import type { DbExecutor, Row } from './executor';

type SqliteDb = {
  execAsync: (sql: string, params?: ReadonlyArray<unknown>) => Promise<void>;
  getFirstAsync: <T extends Row>(sql: string, params?: ReadonlyArray<unknown>) => Promise<T | null>;
  getAllAsync: <T extends Row>(sql: string, params?: ReadonlyArray<unknown>) => Promise<T[]>;
  withTransactionAsync: (fn: (tx: TransactionLike) => Promise<void>) => Promise<void>;
};

type TransactionLike = SqliteDb;

let cached: SqliteDb | null = null;

async function getDb(): Promise<SqliteDb> {
  if (cached) return cached;
  // Lazy import — keeps test/jest from trying to load native module
  // at parse time. The `as unknown` cast avoids importing the type
  // at the top level (which also touches the native module via .d.ts).
  const mod = await import('expo-sqlite');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: SqliteDb = (await (mod as any).openDatabaseAsync('mirai_rpg.db')) as SqliteDb;
  // PRAGMA: foreign keys ON, WAL for safe concurrency
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  cached = db;
  return db;
}

function wrap(db: SqliteDb): DbExecutor {
  return {
    exec: (sql, params) => db.execAsync(sql, params),
    one: (sql, params) => db.getFirstAsync(sql, params),
    all: (sql, params) => db.getAllAsync(sql, params),
    withTransaction: async (fn) => {
      let result: unknown;
      await db.withTransactionAsync(async (tx) => {
        const wrapped = wrap(tx as SqliteDb);
        result = await fn(wrapped);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result as any;
    },
  };
}

export async function getExecutor(): Promise<DbExecutor> {
  const db = await getDb();
  return wrap(db);
}

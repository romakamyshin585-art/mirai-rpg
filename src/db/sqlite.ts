/**
 * expo-sqlite implementation of DbExecutor. Used at runtime in the app.
 *
 * Lazy-imports `expo-sqlite` so the test environment (no native module)
 * can still use the in-memory fake without breaking import-time.
 *
 * Why the dual-path exec/run split:
 *   expo-sqlite 15.1.4's NativeDatabase.execAsync accepts params but on
 *   Android production builds it silently drops them for single-statement
 *   INSERT/UPDATE, which surfaces as:
 *     "NOT NULL constraint failed: <column>"
 *   The safe path is runAsync which always uses prepared statements
 *   internally. We dispatch on whether params are present.
 *
 * The MemoryDb in-memory fake (src/db/memory.ts) implements both shapes
 * uniformly, so tests are unaffected by the switch.
 */

import type { DbExecutor, Row } from './executor';

type SqliteDb = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: ReadonlyArray<unknown>) => Promise<unknown>;
  getFirstAsync: <T extends Row>(sql: string, params?: ReadonlyArray<unknown>) => Promise<T | null>;
  getAllAsync: <T extends Row>(sql: string, params?: ReadonlyArray<unknown>) => Promise<T[]>;
  withTransactionAsync: (fn: (tx: TransactionLike) => Promise<void>) => Promise<void>;
};

type TransactionLike = SqliteDb;

let cached: SqliteDb | null = null;
let logCounter = 0;

async function getDb(): Promise<SqliteDb> {
  if (cached) return cached;
  console.log('[MiraiRPG] sqlite: importing expo-sqlite');
  const mod = await import('expo-sqlite');
  console.log('[MiraiRPG] sqlite: opening database');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: SqliteDb = (await (mod as any).openDatabaseAsync('mirai_rpg.db')) as SqliteDb;
  console.log('[MiraiRPG] sqlite: opened, setting PRAGMAs');
  // Each PRAGMA wrapped individually so a single failure (older Android
  // SQLite build) does not kill the whole init.
  try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch (e) { console.warn('[MiraiRPG] PRAGMA fk failed:', e); }
  try { await db.execAsync('PRAGMA journal_mode = WAL;'); } catch (e) { console.warn('[MiraiRPG] PRAGMA wal failed:', e); }
  cached = db;
  console.log('[MiraiRPG] sqlite: ready');
  return db;
}

/**
 * Lightweight, non-sensitive operation logger.
 * Logs: op name, SQL operation (first verb), param count, monotonic seq.
 * Does NOT log: param values, table names beyond what SQL implies, or
 * any data flowing through the parameters.
 */
function logOp(op: string, sql: string, paramCount: number): void {
  const seq = ++logCounter;
  const verb = sql.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? '?';
  console.log(`[MiraiRPG] db.${op}#${seq} op=${verb} params=${paramCount}`);
}

function wrap(db: SqliteDb): DbExecutor {
  return {
    // execAsync on NativeDatabase drops params for INSERT/UPDATE in
    // production. runAsync is prepared-statement and always binds
    // reliably. Multi-statement SQL (schema, PRAGMA) has no params and
    // should keep using execAsync since runAsync is single-statement.
    exec: async (sql, params) => {
      const op = 'exec';
      if (params && params.length > 0) {
        if (typeof db.runAsync !== 'function') {
          // Should not happen on expo-sqlite 15.x, but guard for
          // older native builds in case Expo pre-bundles a fallback.
          logOp(op, sql, params.length);
          await db.execAsync(sql);
          return;
        }
        logOp(op, sql, params.length);
        await db.runAsync(sql, params as unknown as never);
      } else {
        logOp(op, sql, 0);
        await db.execAsync(sql);
      }
    },
    one: (sql, params) => {
      logOp('one', sql, params?.length ?? 0);
      return db.getFirstAsync(sql, params);
    },
    all: (sql, params) => {
      logOp('all', sql, params?.length ?? 0);
      return db.getAllAsync(sql, params);
    },
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

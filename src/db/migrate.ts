import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';
import { createMemoryDb } from './memory';
import type { DbExecutor } from './executor';

/**
 * Apply all schema statements in order. Idempotent.
 *
 * The schema_version row is written using SQL string literals (not bound
 * parameters) on purpose. expo-sqlite 15.1.4's NativeDatabase.execAsync
 * silently drops parameter bindings for single-statement INSERT/UPDATE
 * on Android production builds, which causes:
 *   "NOT NULL constraint failed: config.value"
 * because value comes through as NULL when bound via ?. By inlining the
 * version as a string literal the binding step is skipped entirely and
 * the value is always present. SCHEMA_VERSION is a compile-time constant
 * so the literal is safe.
 */
export async function migrate(db: DbExecutor): Promise<void> {
  const versionLiteral = String(SCHEMA_VERSION);
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.exec(stmt);
  }
  await db.exec(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('schema_version', '${versionLiteral}')`,
  );
  await db.exec(
    `UPDATE config SET value = '${versionLiteral}' WHERE key = 'schema_version'`,
  );
}

/** Returns the schema version stored in DB, or 0 if never migrated. */
export async function getSchemaVersion(db: DbExecutor): Promise<number> {
  const row = await db.one<{ value: string }>(`SELECT value FROM config WHERE key = 'schema_version'`);
  return row ? Number(row.value) : 0;
}

/** Convenience: open memory DB + migrate, ready for unit tests. */
export async function freshMemoryDb(): Promise<DbExecutor> {
  const db = createMemoryDb();
  await migrate(db);
  return db;
}

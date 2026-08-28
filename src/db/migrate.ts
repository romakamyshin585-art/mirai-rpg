import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';
import { createMemoryDb } from './memory';
import type { DbExecutor } from './executor';

/** Apply all schema statements in order. Idempotent. */
export async function migrate(db: DbExecutor): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.exec(stmt);
  }
  // Track schema version in config table (upsert via read-then-write;
  // schema_version is set once at fresh install and never bumped for v1).
  const existing = await db.one<{ value: string }>(
    `SELECT value FROM config WHERE key = 'schema_version'`,
  );
  if (existing) {
    await db.exec(`UPDATE config SET value = ? WHERE key = 'schema_version'`, [String(SCHEMA_VERSION)]);
  } else {
    await db.exec(
      `INSERT INTO config (key, value) VALUES (?, ?)`,
      ['schema_version', String(SCHEMA_VERSION)],
    );
  }
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

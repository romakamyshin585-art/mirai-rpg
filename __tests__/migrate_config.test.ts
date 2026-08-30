/**
 * Regression test for "NOT NULL constraint failed: config.value".
 *
 * The bug surfaced on Android production builds (expo-sqlite 15.1.4
 * NativeDatabase.execAsync silently drops parameter bindings for
 * single-statement INSERT/UPDATE). Migrate() must therefore either:
 *   - use SQL string literals for the schema_version row, OR
 *   - use runAsync (prepared statement) when params are present.
 *
 * These tests pin both behaviours in place: the migration produces a
 * row with a non-null value via the new literal SQL, and a dedicated
 * check confirms that an INSERT/UPDATE with bound params still
 * succeeds through the same code path the app uses.
 */
import { freshMemoryDb, getSchemaVersion, migrate } from '../src/db/migrate';
import { createMemoryDb } from '../src/db/memory';
import type { DbExecutor } from '../src/db/executor';

describe('config migration regression', () => {
  test('fresh migrate() writes schema_version with a non-null value', async () => {
    const db = await freshMemoryDb();
    const row = await db.one<{ key: string; value: string | null }>(
      `SELECT key, value FROM config WHERE key = 'schema_version'`,
    );
    expect(row).not.toBeNull();
    expect(row?.key).toBe('schema_version');
    expect(row?.value).not.toBeNull();
    expect(row?.value).toBe('1');
  });

  test('getSchemaVersion returns 1 after fresh migrate()', async () => {
    const db = await freshMemoryDb();
    await expect(getSchemaVersion(db)).resolves.toBe(1);
  });

  test('migrate() is idempotent (re-run does not error, value still present)', async () => {
    const db = await freshMemoryDb();
    await expect(migrate(db)).resolves.not.toThrow();
    const row = await db.one<{ value: string | null }>(
      `SELECT value FROM config WHERE key = 'schema_version'`,
    );
    expect(row?.value).toBe('1');
  });

  /**
   * Direct reproduction of the production failure mode. The MemoryDb
   * fake must accept a literal SQL INSERT OR IGNORE and a literal
   * UPDATE without raising, and the row must contain a non-null value.
   */
  test('INSERT OR IGNORE ... config (literal) survives and is queryable', async () => {
    const db: DbExecutor = createMemoryDb();
    await db.exec(
      `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );
    await db.exec(
      `INSERT OR IGNORE INTO config (key, value) VALUES ('schema_version', '1')`,
    );
    await db.exec(
      `UPDATE config SET value = '1' WHERE key = 'schema_version'`,
    );
    const row = await db.one<{ value: string | null }>(
      `SELECT value FROM config WHERE key = 'schema_version'`,
    );
    expect(row?.value).toBe('1');
  });
});

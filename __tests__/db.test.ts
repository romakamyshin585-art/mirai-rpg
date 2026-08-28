import { freshMemoryDb, getSchemaVersion } from '../src/db/migrate';
import { createMemoryDb, SCHEMA_STATEMENTS } from '../src/db';

describe('memory db', () => {
  test('starts empty', async () => {
    const db = createMemoryDb();
    const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table'`);
    expect(tables).toEqual([]);
  });

  test('CREATE TABLE IF NOT EXISTS works twice', async () => {
    const db = createMemoryDb();
    await db.exec(`CREATE TABLE IF NOT EXISTS t (id TEXT, v INTEGER)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS t (id TEXT, v INTEGER)`);
    const row = await db.one<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM t`);
    expect(row?.cnt).toBe(0);
  });

  test('INSERT and SELECT roundtrip', async () => {
    const db = createMemoryDb();
    await db.exec(`CREATE TABLE t (id TEXT, v INTEGER)`);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['a', 1]);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['b', 2]);
    const all = await db.all<{ id: string; v: number }>(`SELECT id, v FROM t ORDER BY v ASC`);
    expect(all).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
  });

  test('UPDATE with WHERE', async () => {
    const db = createMemoryDb();
    await db.exec(`CREATE TABLE t (id TEXT, v INTEGER)`);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['a', 1]);
    await db.exec(`UPDATE t SET v = ? WHERE id = ?`, [99, 'a']);
    const row = await db.one<{ v: number }>(`SELECT v FROM t WHERE id = ?`, ['a']);
    expect(row?.v).toBe(99);
  });

  test('DELETE with WHERE', async () => {
    const db = createMemoryDb();
    await db.exec(`CREATE TABLE t (id TEXT, v INTEGER)`);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['a', 1]);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['b', 2]);
    await db.exec(`DELETE FROM t WHERE id = ?`, ['a']);
    const all = await db.all<{ id: string }>(`SELECT id FROM t`);
    expect(all).toEqual([{ id: 'b' }]);
  });

  test('ORDER BY DESC', async () => {
    const db = createMemoryDb();
    await db.exec(`CREATE TABLE t (id TEXT, v INTEGER)`);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['a', 1]);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['b', 5]);
    await db.exec(`INSERT INTO t (id, v) VALUES (?, ?)`, ['c', 3]);
    const all = await db.all<{ id: string; v: number }>(`SELECT id, v FROM t ORDER BY v DESC`);
    expect(all[0]?.v).toBe(5);
    expect(all[2]?.v).toBe(1);
  });
});

describe('migrate', () => {
  test('applies all schema statements', async () => {
    const db = await freshMemoryDb();
    // Each table is queryable (COUNT works without throwing).
    // config is the only one that may have rows (schema_version).
    const dataTables = ['user', 'character', 'stat', 'quest', 'quest_completion', 'achievement', 'achievement_unlock', 'personal_best'];
    for (const n of dataTables) {
      const row = await db.one<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM ${n}`);
      expect(row?.cnt).toBe(0);
    }
    const configRow = await db.one<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM config`);
    expect(configRow?.cnt).toBe(1);
  });

  test('stores schema_version', async () => {
    const db = await freshMemoryDb();
    const v = await getSchemaVersion(db);
    expect(v).toBeGreaterThan(0);
  });

  test('is idempotent', async () => {
    const db = createMemoryDb();
    for (const stmt of SCHEMA_STATEMENTS) {
      await db.exec(stmt);
    }
    for (const stmt of SCHEMA_STATEMENTS) {
      await db.exec(stmt); // second time must not throw
    }
  });
});

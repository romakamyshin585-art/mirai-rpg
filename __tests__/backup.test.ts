/**
 * Backup / restore tests.
 *
 * The behaviour pinned here is the part that silently loses a user's
 * history when it is wrong: system quest ids and achievement ids are
 * `uuid()`s minted at insert time, so after a reinstall every one of them
 * differs. A restore that trusted the ids in the snapshot would either
 * fail on the foreign keys or attach history to nothing. The mapping is by
 * quest **title** and achievement **code**, and these tests simulate a
 * reinstall by building a second database whose ids are all different.
 */

import { freshMemoryDb } from '../src/db';
import { seedIfEmpty } from '../src/seed';
import { QuestRepo } from '../src/repos/quest_repo';
import { AchievementRepo } from '../src/repos/achievement_repo';
import { CharacterService } from '../src/services/character_service';
import { ProgressionService } from '../src/services/progression_service';
import { AchievementService } from '../src/services/achievement_service';
import { buildBackup, parseBackup, restoreBackup, BACKUP_KIND, BACKUP_VERSION } from '../src/services/backup_service';

const USER = 'u_test_backup';

async function seedProfile() {
  const db = await freshMemoryDb();
  await seedIfEmpty(db);
  await new AchievementRepo(db).insertDef({
    code: 'first_quest',
    name: 'Первый квест',
    description: 'd',
    rarity: 'common',
    icon: 'x',
  });
  await db.exec(`INSERT OR IGNORE INTO user (id, name, created_at) VALUES ('${USER}', 'Roman', '2026-01-01T00:00:00.000Z')`);
  const character = new CharacterService(db);
  const progression = new ProgressionService(db);
  const quests = new QuestRepo(db);
  const system = (await quests.listSystemActive()).filter(q => q.category === 'health');
  await character.getOrCreate(USER, 'Hero');
  for (const quest of system.slice(0, 3)) {
    await progression.completeQuest(USER, quest.id);
  }
  return { db, system };
}

describe('backup payload validation', () => {
  test('rejects text that is not JSON', () => {
    const result = parseBackup('not json at all');
    expect(result.ok).toBe(false);
  });

  test('rejects a foreign JSON file', () => {
    const result = parseBackup(JSON.stringify({ kind: 'something-else', version: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('не копия');
  });

  test('rejects a snapshot from a newer app version instead of half-applying it', () => {
    const result = parseBackup(
      JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION + 5, user: { id: 'u', name: 'x' }, completions: [], customQuests: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('новой версии');
  });

  test('rejects a snapshot with no profile', () => {
    const result = parseBackup(
      JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, completions: [], customQuests: [] }),
    );
    expect(result.ok).toBe(false);
  });

  test('accepts a well-formed snapshot and fills in optional blocks', () => {
    const result = parseBackup(
      JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, user: { id: 'u', name: 'x' }, completions: [], customQuests: [] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.stats).toEqual([]);
      expect(result.payload.unlocks).toEqual([]);
      expect(result.payload.preferences).toEqual({});
    }
  });
});

describe('backup round trip across a simulated reinstall', () => {
  test('history survives when every system quest id is different', async () => {
    const source = await seedProfile();
    const payload = await buildBackup(source.db, USER, '0.3.0');
    expect(payload.completions.length).toBe(3);
    // Every completion carries the title, which is the only handle that
    // will still be valid in the next install.
    for (const row of payload.completions) {
      expect(typeof row.quest_title).toBe('string');
      expect(String(row.quest_title).length).toBeGreaterThan(0);
    }

    // "Reinstall": a brand new database, freshly seeded, so every quest and
    // achievement has a new uuid. Assert the ids really did change, or the
    // rest of the test proves nothing.
    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    const sourceQuestIds = new Set((await new QuestRepo(source.db).listSystem()).map(q => q.id));
    const targetQuestIds = new Set((await new QuestRepo(target).listSystem()).map(q => q.id));
    for (const id of targetQuestIds) expect(sourceQuestIds.has(id)).toBe(false);

    const restored = await restoreBackup(target, payload);

    expect(restored.completions).toBe(3);
    expect(restored.orphaned).toBe(0);

    // The completions now point at the *target* database's quest rows, not
    // the source's dangling ids.
    const rows = await target.all<{ quest_id: string }>(
      `SELECT quest_id FROM quest_completion WHERE user_id = '${USER}'`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(targetQuestIds.has(row.quest_id)).toBe(true);
      expect(sourceQuestIds.has(row.quest_id)).toBe(false);
    }
  });

  test('a completion whose quest vanished from the catalogue keeps its history via a stub', async () => {
    const source = await seedProfile();
    const payload = await buildBackup(source.db, USER, '0.3.0');
    // Simulate a quest that was removed from the seed in a later version.
    const completions = payload.completions.map(row => ({ ...row, quest_title: 'Квест, которого больше нет' }));
    const stripped = { ...payload, completions };

    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    const restored = await restoreBackup(target, stripped);

    expect(restored.completions).toBe(3);
    expect(restored.orphaned).toBe(1);
    const rows = await target.all<{ title: string; is_system: number }>(
      `SELECT title, is_system FROM quest WHERE user_id = '${USER}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Квест, которого больше нет');
    expect(rows[0]?.is_system).toBe(0);
  });

  test('a user quest is restored with its own id and its history follows it', async () => {
    const source = await seedProfile();
    const created = await new QuestRepo(source.db).insert({
      user_id: USER,
      title: 'Мой особый квест',
      description: null,
      category: 'career',
      difficulty: 2,
      xp_reward: 40,
      is_system: 0,
      is_active: 1,
    });
    await new ProgressionService(source.db).completeQuest(USER, created.id);

    const payload = await buildBackup(source.db, USER, '0.3.0');
    expect(payload.customQuests).toHaveLength(1);

    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    const restored = await restoreBackup(target, payload);
    expect(restored.customQuests).toBe(1);
    expect(restored.orphaned).toBe(0);

    const mine = (await new QuestRepo(target).listForUser(USER)).filter(q => q.is_system === 0);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.title).toBe('Мой особый квест');
    // Id preserved, so the completion still points at it.
    expect(mine[0]?.id).toBe(created.id);
  });

  test('restoring is idempotent: applying twice does not duplicate history', async () => {
    const source = await seedProfile();
    const payload = await buildBackup(source.db, USER, '0.3.0');

    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    await restoreBackup(target, payload);
    await restoreBackup(target, payload);

    const rows = await target.all(`SELECT id FROM quest_completion WHERE user_id = '${USER}'`);
    expect(rows).toHaveLength(3);
  });

  test('restore does not touch the system catalogue', async () => {
    const source = await seedProfile();
    const payload = await buildBackup(source.db, USER, '0.3.0');
    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    const before = (await new QuestRepo(target).listSystem()).length;
    await restoreBackup(target, payload);
    const after = (await new QuestRepo(target).listSystem()).length;
    expect(after).toBe(before);
  });

  test('unlocks are re-pointed at the new achievement ids', async () => {
    const source = await seedProfile();
    const progression = new ProgressionService(source.db);
    const quests = new QuestRepo(source.db);
    const system = (await quests.listSystemActive()).filter(q => q.category === 'knowledge');
    await progression.completeQuest(USER, system[0]!.id);
    await new AchievementService(source.db).syncFromHistory(USER);

    const payload = await buildBackup(source.db, USER, '0.3.0');
    expect(payload.unlocks.length).toBeGreaterThan(0);
    for (const row of payload.unlocks) expect(typeof row.code).toBe('string');

    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    const restored = await restoreBackup(target, payload);
    expect(restored.unlocks).toBe(payload.unlocks.length);

    const targetIds = new Set((await new AchievementRepo(target).listCatalog()).map(a => a.id));
    const rows = await target.all<{ achievement_id: string }>(
      `SELECT achievement_id FROM achievement_unlock WHERE user_id = '${USER}'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(targetIds.has(row.achievement_id)).toBe(true);
  });

  test('restore replaces, not merges: pre-existing history is gone', async () => {
    const target = await freshMemoryDb();
    await seedIfEmpty(target);
    await new AchievementRepo(target).insertDef({
      code: 'first_quest',
      name: 'Первый квест',
      description: 'd',
      rarity: 'common',
      icon: 'x',
    });
    await target.exec(`INSERT OR IGNORE INTO user (id, name, created_at) VALUES ('${USER}', 'Roman', '2026-01-01T00:00:00.000Z')`);
    await new CharacterService(target).getOrCreate(USER, 'Hero');
    const local = (await new QuestRepo(target).listSystemActive())[0]!;
    await new ProgressionService(target).completeQuest(USER, local.id);
    expect((await target.all(`SELECT id FROM quest_completion WHERE user_id = '${USER}'`)).length).toBe(1);

    const source = await seedProfile();
    const payload = await buildBackup(source.db, USER, '0.3.0');
    await restoreBackup(target, payload);

    const rows = await target.all(`SELECT id FROM quest_completion WHERE user_id = '${USER}'`);
    expect(rows).toHaveLength(3);
  });
});

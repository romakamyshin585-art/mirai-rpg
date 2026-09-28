/**
 * Quest edit rules.
 *
 * The editor exists so a typo can be fixed, and the whole design is about
 * making sure it cannot be used to manufacture progress. These tests pin
 * the three guarantees:
 *
 *  1. the reward is fixed at creation and no edit path can raise it;
 *  2. a quest that has been completed has its axis and difficulty frozen,
 *     so the profile cannot contradict its own history;
 *  3. a system quest is not editable at all, and neither is someone else's.
 */
import { freshMemoryDb } from '../src/db';
import { QuestRepo } from '../src/repos/quest_repo';
import { QuestService } from '../src/services/quest_service';
import { ProgressionService } from '../src/services/progression_service';

const USER = 'u_edit_test';
const OTHER = 'u_someone_else';

async function setup() {
  const db = await freshMemoryDb();
  await db.exec(`INSERT OR IGNORE INTO user (id, name, created_at) VALUES ('${USER}', 'Roman', '2026-01-01T00:00:00.000Z')`);
  await db.exec(`INSERT OR IGNORE INTO user (id, name, created_at) VALUES ('${OTHER}', 'Other', '2026-01-01T00:00:00.000Z')`);
  const quests = new QuestRepo(db);
  return { db, quests, service: new QuestService(db) };
}

function ownQuest() {
  return {
    user_id: USER,
    title: 'Мой квест',
    description: 'Что-то сделать',
    category: 'career' as const,
    difficulty: 2,
    xp_reward: 30,
    is_system: 0,
    is_active: 1,
  };
}

describe('quest editing', () => {
  test('the reward cannot be raised: applyEdit has no xp parameter at all', async () => {
    const { quests, service } = await setup();
    const created = await quests.insert(ownQuest());
    const before = await quests.getById(created.id);

    const ok = await service.applyEdit(created.id, USER, {
      title: 'Переименованный',
      description: 'Другое описание',
      category: 'health',
      difficulty: 3,
    });

    expect(ok).toBe(true);
    const after = await quests.getById(created.id);
    expect(after?.title).toBe('Переименованный');
    // The important assertion: difficulty went 2 -> 3 and the reward did
    // not move. There is no code path that could have moved it.
    expect(after?.difficulty).toBe(3);
    expect(after?.xp_reward).toBe(before?.xp_reward);
    expect(after?.xp_reward).toBe(30);
  });

  test('a completed quest keeps its axis and difficulty; only the text moves', async () => {
    const { quests, service, db } = await setup();
    const created = await quests.insert(ownQuest());
    // A character row is what the progression service writes against.
    await db.exec(
      `INSERT OR IGNORE INTO character (id, user_id, name, class, level, xp, created_at)
       VALUES ('c1', '${USER}', 'Hero', NULL, 1, 0, '2026-01-01T00:00:00.000Z')`,
    );
    await new ProgressionService(db).completeQuest(USER, created.id);

    const plan = await service.planEdit(created.id, USER);
    expect(plan?.canChangeShape).toBe(false);
    expect(plan?.completionCount).toBe(1);

    await service.applyEdit(created.id, USER, {
      title: 'Исправленное название',
      description: null,
      category: 'social',
      difficulty: 1,
    });

    const after = await quests.getById(created.id);
    expect(after?.title).toBe('Исправленное название');
    expect(after?.category).toBe('career');
    expect(after?.difficulty).toBe(2);
  });

  test('a fresh quest can still be re-aimed at another axis', async () => {
    const { quests, service } = await setup();
    const created = await quests.insert(ownQuest());
    const plan = await service.planEdit(created.id, USER);
    expect(plan?.canChangeShape).toBe(true);

    await service.applyEdit(created.id, USER, {
      title: 'Мой квест',
      description: null,
      category: 'discipline',
      difficulty: 1,
    });
    const after = await quests.getById(created.id);
    expect(after?.category).toBe('discipline');
    expect(after?.difficulty).toBe(1);
  });

  test('a system quest is not editable', async () => {
    const { quests, service } = await setup();
    const system = await quests.insert({ ...ownQuest(), user_id: null, is_system: 1 });
    expect(await service.planEdit(system.id, USER)).toBeNull();
    expect(
      await service.applyEdit(system.id, USER, {
        title: 'Взлом',
        description: null,
        category: 'health',
        difficulty: 1,
      }),
    ).toBe(false);
    const after = await quests.getById(system.id);
    expect(after?.title).toBe('Мой квест');
  });

  test("another user's quest is not editable", async () => {
    const { quests, service } = await setup();
    const theirs = await quests.insert({ ...ownQuest(), user_id: OTHER });
    expect(await service.planEdit(theirs.id, USER)).toBeNull();
    expect(
      await service.applyEdit(theirs.id, USER, {
        title: 'Взлом',
        description: null,
        category: 'health',
        difficulty: 1,
      }),
    ).toBe(false);
    const after = await quests.getById(theirs.id);
    expect(after?.title).toBe('Мой квест');
  });

  test('the catalogue cache is dropped by an edit, so the list reflects it', async () => {
    const { quests, service } = await setup();
    const created = await quests.insert(ownQuest());
    // Warm the cache.
    const before = await service.list(USER);
    expect(before.some(quest => quest.title === 'Мой квест')).toBe(true);

    await service.applyEdit(created.id, USER, {
      title: 'Совсем другое',
      description: null,
      category: 'career',
      difficulty: 2,
    });

    const after = await service.list(USER);
    expect(after.some(quest => quest.title === 'Мой квест')).toBe(false);
    expect(after.some(quest => quest.title === 'Совсем другое')).toBe(true);
  });
});

describe('hard delete', () => {
  test('reports how many completions went with the quest', async () => {
    const { quests, service, db } = await setup();
    const created = await quests.insert(ownQuest());
    await db.exec(
      `INSERT OR IGNORE INTO character (id, user_id, name, class, level, xp, created_at)
       VALUES ('c1', '${USER}', 'Hero', NULL, 1, 0, '2026-01-01T00:00:00.000Z')`,
    );
    await new ProgressionService(db).completeQuest(USER, created.id);
    expect(await service.countCompletions(created.id)).toBe(1);

    const result = await service.hardDelete(created.id, USER);
    expect(result.completionsRemoved).toBe(1);
    expect(await quests.getById(created.id)).toBeNull();
  });

  test("will not delete another user's quest", async () => {
    const { quests, service } = await setup();
    const theirs = await quests.insert({ ...ownQuest(), user_id: OTHER });
    await service.hardDelete(theirs.id, USER);
    expect(await quests.getById(theirs.id)).not.toBeNull();
  });
});

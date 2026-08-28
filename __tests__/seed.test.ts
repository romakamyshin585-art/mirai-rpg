import { freshMemoryDb } from '../src/db';
import { seedIfEmpty } from '../src/seed';
import { QuestRepo } from '../src/repos/quest_repo';
import { AchievementRepo } from '../src/repos/achievement_repo';

describe('seed', () => {
  test('first boot: inserts 76 quests + 17 achievements', async () => {
    const db = await freshMemoryDb();
    const result = await seedIfEmpty(db);
    expect(result.achievementsInserted).toBe(17);
    expect(result.questsInserted).toBe(76);
  });

  test('second boot: idempotent (0 inserts)', async () => {
    const db = await freshMemoryDb();
    await seedIfEmpty(db);
    const result = await seedIfEmpty(db);
    expect(result.achievementsInserted).toBe(0);
    expect(result.questsInserted).toBe(0);
  });

  test('5 categories represented, 15 quests each + 16 in health', async () => {
    const db = await freshMemoryDb();
    await seedIfEmpty(db);
    const qRepo = new QuestRepo(db);
    const all = await qRepo.listSystem();
    const byCat: Record<string, number> = {};
    for (const q of all) byCat[q.category] = (byCat[q.category] ?? 0) + 1;
    expect(byCat.health).toBe(16);
    expect(byCat.knowledge).toBe(15);
    expect(byCat.career).toBe(15);
    expect(byCat.discipline).toBe(15);
    expect(byCat.social).toBe(15);
    expect(all.length).toBe(76);
  });

  test('all 17 achievement codes present in catalog', async () => {
    const db = await freshMemoryDb();
    await seedIfEmpty(db);
    const a = new AchievementRepo(db);
    const cat = await a.listCatalog();
    const codes = new Set(cat.map((c) => c.code));
    // The 17 we seeded
    for (const c of ['first_step', 'first_quest', 'comeback', 'early_bird', 'midnight_owl', 'evening_zen',
                     'weekend_warrior', 'week_streak', 'month_streak', 'category_rainbow', 'all_categories_today',
                     'health_balance', 'variety_30', 'variety_50', 'hardcore_5', 'personal_record_day', 'category_personal_best']) {
      expect(codes.has(c)).toBe(true);
    }
  });
});

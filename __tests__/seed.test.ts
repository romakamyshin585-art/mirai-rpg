import { freshMemoryDb } from '../src/db';
import { seedIfEmpty } from '../src/seed';
import { QuestRepo } from '../src/repos/quest_repo';
import { AchievementRepo } from '../src/repos/achievement_repo';
import { RULES } from '../src/domain/achievements';
import { ACHIEVEMENT_SEED } from '../src/seed/achievements';

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

  test('no duplicate codes in ACHIEVEMENT_SEED', () => {
    const codes = ACHIEVEMENT_SEED.map((def) => def.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  test('seed twice sequentially: no duplicates, same count', async () => {
    const db = await freshMemoryDb();
    await seedIfEmpty(db);
    await seedIfEmpty(db);
    const a = new AchievementRepo(db);
    const cat = await a.listCatalog();
    expect(cat.length).toBe(17);
    const codes = new Set(cat.map((c) => c.code));
    expect(codes.size).toBe(17);
  });

  test('seed on DB with pre-existing achievements: no error, idempotent', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    for (const def of ACHIEVEMENT_SEED) {
      await aRepo.insertDef(def);
    }
    const result = await seedIfEmpty(db);
    expect(result.achievementsInserted).toBe(0);
    const cat = await aRepo.listCatalog();
    expect(cat.length).toBe(17);
  });

  test('catalog codes and rule codes match one to one', async () => {
    const db = await freshMemoryDb();
    await seedIfEmpty(db);
    const catalog = await new AchievementRepo(db).listCatalog();
    const ruleCodes = RULES.map((rule) => rule.code).sort();
    const seedCodes = ACHIEVEMENT_SEED.map((def) => def.code).sort();
    expect(catalog.map((def) => def.code).sort()).toEqual(seedCodes);
    expect(seedCodes).toEqual(ruleCodes);
    expect(new Set(catalog.map((def) => def.code)).size).toBe(17);
  });

  test('partial catalog receives missing achievement definitions', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    await aRepo.insertDef(ACHIEVEMENT_SEED[0]!);
    const result = await seedIfEmpty(db);
    expect(result.achievementsInserted).toBe(16);
    expect((await aRepo.listCatalog()).length).toBe(17);
  });

  test('archived system quest is not reactivated or duplicated', async () => {
    const db = await freshMemoryDb();
    const qRepo = new QuestRepo(db);
    await qRepo.insert({
      user_id: null,
      title: 'Archived system',
      description: null,
      category: 'health',
      difficulty: 1,
      xp_reward: 10,
      is_system: 1,
      is_active: 0,
    });
    await seedIfEmpty(db);
    const system = await qRepo.listSystem();
    expect(system).toHaveLength(1);
    expect(system[0]?.is_active).toBe(0);
  });
});

describe('AchievementRepo getByCode/insertDef diagnostic', () => {
  test('getByCode returns inserted record', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    
    const def = { code: 'diag_test', name: 'Diag', description: 'Test', rarity: 'common' as const, icon: '🧪' };
    
    const inserted = await aRepo.insertDef(def);
    expect(inserted).not.toBeNull();
    expect(inserted?.code).toBe('diag_test');
    
    const found = await aRepo.getByCode('diag_test');
    expect(found).not.toBeNull();
    expect(found?.code).toBe('diag_test');
    expect(found?.id).toBe(inserted?.id);
  });

  test('insertDef with duplicate code returns first inserted record', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    
    const def = { code: 'diag_dup', name: 'Diag', description: 'Test', rarity: 'common' as const, icon: '🧪' };
    
    const first = await aRepo.insertDef(def);
    expect(first).not.toBeNull();
    
    const second = await aRepo.insertDef(def);
    expect(second).not.toBeNull();
    expect(second?.id).toBe(first?.id); // getByCode returns FIRST record
    
    // NOTE: Memory DB allows duplicate rows (no UNIQUE enforcement).
    // Real SQLite with INSERT OR IGNORE + UNIQUE constraint would prevent insert.
    // This test documents the memory DB behavior for diagnostic purposes.
    const all = await aRepo.listCatalog();
    const codes = all.filter(a => a.code === 'diag_dup');
    expect(codes.length).toBe(2); // Memory DB allows duplicates
    expect(codes[0].id).toBe(first?.id); // First is the one returned by getByCode
  });

  test('insertDef preserves existing record fields on duplicate', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    
    const def1 = { code: 'diag_preserve', name: 'First', description: 'First desc', rarity: 'common' as const, icon: '🧪' };
    const def2 = { code: 'diag_preserve', name: 'Second', description: 'Second desc', rarity: 'rare' as const, icon: '🧪' };
    
    await aRepo.insertDef(def1);
    const second = await aRepo.insertDef(def2); // Different fields, same code
    
    expect(second).not.toBeNull();
    expect(second?.name).toBe('First'); // getByCode returns ORIGINAL values
    expect(second?.rarity).toBe('common');
  });

  test('concurrent insertDef calls with same code return first record', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    
    const def = { code: 'diag_concurrent', name: 'Concurrent', description: 'Test', rarity: 'common' as const, icon: '🧪' };
    
    // Simulate concurrent inserts
    const [r1, r2, r3] = await Promise.all([
      aRepo.insertDef(def),
      aRepo.insertDef(def),
      aRepo.insertDef(def),
    ]);
    
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();
    expect(r1?.id).toBe(r2?.id);
    expect(r2?.id).toBe(r3?.id);
    
    // Memory DB allows duplicate rows (no UNIQUE enforcement in test env)
    const all = await aRepo.listCatalog();
    const codes = all.filter(a => a.code === 'diag_concurrent');
    expect(codes.length).toBe(3); // Memory DB allows duplicates
  });
});

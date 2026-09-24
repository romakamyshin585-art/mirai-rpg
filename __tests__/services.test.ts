import { freshMemoryDb } from '../src/db';
import { UserRepo } from '../src/repos/user_repo';
import { QuestRepo, CompletionRepo } from '../src/repos/quest_repo';
import { AchievementRepo, type Rarity } from '../src/repos/achievement_repo';
import { CharacterService } from '../src/services/character_service';
import { StatRepo } from '../src/repos/character_repo';
import { ProgressionService } from '../src/services/progression_service';
import { AchievementService } from '../src/services/achievement_service';
import { levelProgress } from '../src/domain/level';

async function setup() {
  const db = await freshMemoryDb();
  const user = await new UserRepo(db).create('tester');
  const svc = new CharacterService(db);
  const char = await svc.getOrCreate(user.id, 'Hero');
  return { db, user, char, svc };
}

async function seedCatalog(db: Awaited<ReturnType<typeof freshMemoryDb>>) {
  const a = new AchievementRepo(db);
  const codes: Array<{ code: string; name: string; description: string; rarity: Rarity; icon: string }> = [
    { code: 'first_step', name: 'Первый шаг', description: 'Выполни первый квест', rarity: 'common', icon: '🚶' },
    { code: 'first_quest', name: 'Старт', description: 'Соверши первое действие', rarity: 'common', icon: '🌱' },
    { code: 'week_streak', name: 'Неделя', description: '7 дней подряд', rarity: 'rare', icon: '🔥' },
    { code: 'month_streak', name: 'Месяц', description: '30 дней подряд', rarity: 'legendary', icon: '👑' },
    { code: 'comeback', name: 'Возвращение', description: '3+ дня паузы', rarity: 'common', icon: '🔁' },
    { code: 'all_categories_today', name: 'Дождь из категорий', description: '5 категорий за день', rarity: 'epic', icon: '⛈️' },
    { code: 'health_balance', name: 'Здоровый ритм', description: 'health 7 дней подряд', rarity: 'rare', icon: '💚' },
    { code: 'category_rainbow', name: 'Радуга', description: '5 категорий за 7 дней', rarity: 'rare', icon: '🌈' },
    { code: 'variety_30', name: 'Исследователь', description: '30 разных квестов', rarity: 'common', icon: '🧭' },
    { code: 'variety_50', name: 'Мастер разнообразия', description: '50 разных квестов', rarity: 'epic', icon: '🗺️' },
    { code: 'hardcore_5', name: 'Хардкор', description: '5 квестов сложности 3+', rarity: 'rare', icon: '💀' },
    { code: 'midnight_owl', name: 'Полуночник', description: 'Квест между 00 и 05', rarity: 'common', icon: '🌙' },
    { code: 'early_bird', name: 'Ранняя пташка', description: 'Квест до 09:00', rarity: 'common', icon: '🌅' },
    { code: 'weekend_warrior', name: 'Выходной воин', description: '10 квестов в сб/вс', rarity: 'rare', icon: '🛡️' },
    { code: 'evening_zen', name: 'Вечерний дзен', description: 'Квест после 22:00', rarity: 'common', icon: '🌆' },
    { code: 'personal_record_day', name: 'Рекорд дня', description: 'Твой лучший день', rarity: 'epic', icon: '🏆' },
    { code: 'category_personal_best', name: 'Рекорд категории', description: 'Лучший результат в категории', rarity: 'epic', icon: '🥇' },
  ];
  for (const c of codes) {
    await a.insertDef(c);
  }
}

describe('CharacterService', () => {
  test('getOrCreate creates a fresh character + 5 stats', async () => {
    const { char, db } = await setup();
    expect(char.level).toBe(1);
    expect(char.xp).toBe(0);
    const stats = await new CharacterService(db).getStats(char.id);
    expect(stats).toHaveLength(5);
  });

  test('getOrCreate returns existing character on second call', async () => {
    const { user, char, svc } = await setup();
    const c2 = await svc.getOrCreate(user.id);
    expect(c2.id).toBe(char.id);
  });

  test('applyXp bumps XP, recomputes level', async () => {
    const { char, svc } = await setup();
    const after = await svc.applyXp(char.id, 100);
    expect(after?.xp).toBe(100);
    expect(after?.level).toBe(2);
  });

  test('applyXp on big jump auto-detects class (health-warrior)', async () => {
    const { user, db, svc } = await setup();
    const prog = new ProgressionService(db);
    // Need ≥ 100 XP to reach L2, so add a big health completion
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'Run', description: null, category: 'health',
      difficulty: 1, xp_reward: 100, is_system: 1, is_active: 1,
    });
    await prog.completeQuest(user.id, q.id);
    const after = await svc.get(user.id);
    expect(after?.level).toBe(2);
    expect(after?.class).toBe('warrior');  // health was 100% of XP
  });

  test('applyXp on balanced stats → no class yet', async () => {
    const { user, db, svc } = await setup();
    const prog = new ProgressionService(db);
    const qRepo = new QuestRepo(db);
    const qH = await qRepo.insert({
      user_id: null, title: 'H', description: null, category: 'health',
      difficulty: 1, xp_reward: 50, is_system: 1, is_active: 1,
    });
    const qK = await qRepo.insert({
      user_id: null, title: 'K', description: null, category: 'knowledge',
      difficulty: 1, xp_reward: 50, is_system: 1, is_active: 1,
    });
    await prog.completeQuest(user.id, qH.id);
    await prog.completeQuest(user.id, qK.id);
    const after = await svc.get(user.id);
    expect(after?.level).toBe(2);
    expect(after?.class).toBeNull();  // 50/50 balanced
  });
});

describe('ProgressionService.completeQuest', () => {
  test('first completion awards full XP', async () => {
    const { user, db } = await setup();
    const prog = new ProgressionService(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 30, is_system: 1, is_active: 1,
    });
    const r = await prog.completeQuest(user.id, q.id);
    expect(r.xpAwarded).toBe(30);
    expect(r.drMultiplier).toBe(1.0);
    expect(r.totalXp).toBe(30);
    expect(r.newLevel).toBe(levelProgress(30).level);
    expect(r.statValue).toBe(1);
  });

  test('DR kicks in after 5 same-category completions', async () => {
    const { user, db } = await setup();
    const prog = new ProgressionService(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 100, is_system: 1, is_active: 1,
    });
    for (let i = 0; i < 6; i += 1) {
      const r = await prog.completeQuest(user.id, q.id);
      // 5th (index 4) still 1.0, 6th (index 5) → 0.85
      if (i < 4) expect(r.drMultiplier).toBe(1.0);
      if (i === 5) expect(r.drMultiplier).toBeCloseTo(0.85, 5);
    }
  });

  test('level-up recorded in completion result', async () => {
    const { user, db } = await setup();
    const prog = new ProgressionService(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 100, is_system: 1, is_active: 1,
    });
    const r = await prog.completeQuest(user.id, q.id);
    expect(r.leveledUp).toBe(true);
    expect(r.newLevel).toBe(2);
  });

  test('throws on inactive quest', async () => {
    const { user, db } = await setup();
    const prog = new ProgressionService(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 10, is_system: 1, is_active: 0,
    });
    await expect(prog.completeQuest(user.id, q.id)).rejects.toThrow('not active');
  });

  test('throws on quest owned by other user', async () => {
    const { user, db } = await setup();
    // Create a quest owned by some other user
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: 'someone-else', title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 10, is_system: 0, is_active: 1,
    });
    const prog = new ProgressionService(db);
    await expect(prog.completeQuest(user.id, q.id)).rejects.toThrow('Not your quest');
  });

  test('user-owned custom quest can be completed', async () => {
    const { user, db } = await setup();
    const prog = new ProgressionService(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: user.id, title: 'My', description: null, category: 'health',
      difficulty: 1, xp_reward: 20, is_system: 0, is_active: 1,
    });
    const r = await prog.completeQuest(user.id, q.id);
    expect(r.xpAwarded).toBe(20);
  });
});

describe('AchievementService', () => {
  test('checkAfterCompletion awards midnight_owl at 02:00', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 10, is_system: 1, is_active: 1,
    });
    const aSvc = new AchievementService(db);
    const at = new Date('2026-08-28T02:00:00');
    const unlocks = await aSvc.checkAfterCompletion(user.id, {
      completionAt: at, category: 'health', questId: q.id, difficulty: 1, xpAwarded: 10,
    });
    expect(unlocks.find((u) => u.code === 'midnight_owl')).toBeTruthy();
  });

  test('does not re-unlock on second completion', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 10, is_system: 1, is_active: 1,
    });
    const aSvc = new AchievementService(db);
    const at = new Date('2026-08-28T02:00:00');
    const first = await aSvc.checkAfterCompletion(user.id, {
      completionAt: at, category: 'health', questId: q.id, difficulty: 1, xpAwarded: 10,
    });
    expect(first.find((u) => u.code === 'midnight_owl')).toBeTruthy();
    const second = await aSvc.checkAfterCompletion(user.id, {
      completionAt: at, category: 'health', questId: q.id, difficulty: 1, xpAwarded: 10,
    });
    expect(second.find((u) => u.code === 'midnight_owl')).toBeFalsy();
  });

  test('personal_best updated on each completion', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const cRepo = new CompletionRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 20, is_system: 1, is_active: 1,
    });
    await cRepo.insert({ quest_id: q.id, user_id: user.id, category: 'health', xp_awarded: 20, dr_multiplier: 1.0 });
    const aSvc = new AchievementService(db);
    await aSvc.checkAfterCompletion(user.id, {
      completionAt: new Date(),
      category: 'health', questId: q.id, difficulty: 1, xpAwarded: 20,
    });
    const pbs = await aSvc.listPersonalBests(user.id);
    const day = pbs.find((p) => p.scope === 'day');
    expect(day?.value).toBe(20);
  });

  test('checkAfterCompletion uses all completions for totals', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const cRepo = new CompletionRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'All time', description: null, category: 'health',
      difficulty: 1, xp_reward: 2, is_system: 1, is_active: 1,
    });
    const at = new Date(2026, 7, 28, 12, 0, 0);
    let lastId = '';
    for (let i = 0; i < 205; i += 1) {
      const row = await cRepo.insert({
        quest_id: q.id,
        user_id: user.id,
        category: 'health',
        xp_awarded: 2,
        dr_multiplier: 1,
        completed_at: at.toISOString(),
      });
      lastId = row.id;
    }
    const aSvc = new AchievementService(db);
    await aSvc.checkAfterCompletion(user.id, {
      completionAt: at,
      completionId: lastId,
      category: 'health',
      questId: q.id,
      difficulty: 1,
      xpAwarded: 2,
    });
    const pbs = await aSvc.listPersonalBests(user.id);
    expect(pbs.find((item) => item.scope === 'day')?.value).toBe(410);
    expect(pbs.find((item) => item.scope === 'category:health')?.value).toBe(410);
  });

  test('first achievements, PB achievements, icon and targeted removal', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const prog = new ProgressionService(db);
    const q = await qRepo.insert({
      user_id: null, title: 'First', description: null, category: 'health',
      difficulty: 1, xp_reward: 100, is_system: 1, is_active: 1,
    });
    const result = await prog.completeQuest(user.id, q.id);
    const aSvc = new AchievementService(db);
    const unlocks = await aSvc.checkAfterCompletion(user.id, {
      completionAt: new Date(),
      completionId: result.completionId,
      category: 'health',
      questId: q.id,
      difficulty: 1,
      xpAwarded: result.xpAwarded,
    });
    expect(unlocks.some((item) => item.code === 'first_step')).toBe(true);
    expect(unlocks.some((item) => item.code === 'first_quest')).toBe(true);
    expect(unlocks.some((item) => item.code === 'personal_record_day')).toBe(true);
    expect(unlocks.some((item) => item.code === 'category_personal_best')).toBe(true);

    const listed = await aSvc.listUnlocked(user.id);
    expect(listed.find((item) => item.code === 'first_quest')?.icon).toBe('🌱');
    expect(listed.find((item) => item.code === 'first_quest')?.id).toBeTruthy();

    const removed = await aSvc.removeUnlocks(user.id, ['first_step']);
    expect(removed.removed).toBe(1);
    expect((await aSvc.listUnlocked(user.id)).some((item) => item.code === 'first_step')).toBe(false);
  });

  test('undoQuestCompletion rolls back completion, XP, level, stat and class', async () => {
    const { user, db, char } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const cRepo = new CompletionRepo(db);
    const prog = new ProgressionService(db);
    const q = await qRepo.insert({
      user_id: null, title: 'Undo', description: null, category: 'health',
      difficulty: 1, xp_reward: 100, is_system: 1, is_active: 1,
    });
    const completed = await prog.completeQuest(user.id, q.id);
    expect(completed.newLevel).toBe(2);
    expect(completed.characterClass).toBe('warrior');
    const achievementService = new AchievementService(db);
    const unlocks = await achievementService.checkAfterCompletion(user.id, {
      completionAt: new Date(),
      completionId: completed.completionId,
      category: 'health',
      questId: q.id,
      difficulty: 1,
      xpAwarded: completed.xpAwarded,
    });
    expect(unlocks.some((item) => item.code === 'first_step')).toBe(true);

    const undone = await prog.undoQuestCompletion(
      user.id,
      completed.completionId,
      unlocks.map((item) => item.code),
    );
    expect(undone.ok).toBe(true);
    expect(undone.removed).toBe(true);
    expect(undone.totalXp).toBe(0);
    expect(undone.levelAfter).toBe(1);
    expect(undone.characterClass).toBeNull();
    expect(await cRepo.getById(completed.completionId)).toBeNull();
    expect((await achievementService.listUnlocked(user.id)).some((item) => item.code === 'first_step')).toBe(false);
    expect(await achievementService.listPersonalBests(user.id)).toHaveLength(0);

    const after = await new CharacterService(db).get(user.id);
    const stat = (await new StatRepo(db).get(char.id, 'health'));
    expect(after?.xp).toBe(0);
    expect(after?.level).toBe(1);
    expect(stat?.value).toBe(0);
    expect(stat?.xp_total_in_category).toBe(0);
  });

  test('weekend_warrior unlocks on the tenth completion of the current weekend', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const cRepo = new CompletionRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'Weekend', description: null, category: 'health',
      difficulty: 1, xp_reward: 5, is_system: 1, is_active: 1,
    });
    const aSvc = new AchievementService(db);
    const at = new Date(2026, 7, 29, 12, 0, 0);
    for (let i = 0; i < 9; i += 1) {
      const row = await cRepo.insert({
        quest_id: q.id,
        user_id: user.id,
        category: 'health',
        xp_awarded: 5,
        dr_multiplier: 1,
        completed_at: at.toISOString(),
      });
      const unlocks = await aSvc.checkAfterCompletion(user.id, {
        completionAt: at,
        completionId: row.id,
        category: 'health',
        questId: q.id,
        difficulty: 1,
        xpAwarded: 5,
      });
      expect(unlocks.some((item) => item.code === 'weekend_warrior')).toBe(false);
    }
    const row = await cRepo.insert({
      quest_id: q.id,
      user_id: user.id,
      category: 'health',
      xp_awarded: 5,
      dr_multiplier: 1,
      completed_at: at.toISOString(),
    });
    const unlocks = await aSvc.checkAfterCompletion(user.id, {
      completionAt: at,
      completionId: row.id,
      category: 'health',
      questId: q.id,
      difficulty: 1,
      xpAwarded: 5,
    });
    expect(unlocks.some((item) => item.code === 'weekend_warrior')).toBe(true);
  });

  test('syncFromHistory unlocks conditions represented by existing completions', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const cRepo = new CompletionRepo(db);
    const q = await qRepo.insert({
      user_id: null, title: 'History', description: null, category: 'health',
      difficulty: 1, xp_reward: 5, is_system: 1, is_active: 1,
    });
    for (let i = 0; i < 7; i += 1) {
      const at = new Date(2026, 7, 20 + i, 6, 0, 0);
      await cRepo.insert({
        quest_id: q.id,
        user_id: user.id,
        category: 'health',
        xp_awarded: 5,
        dr_multiplier: 1,
        completed_at: at.toISOString(),
      });
    }
    const aSvc = new AchievementService(db);
    await aSvc.syncFromHistory(user.id);
    const codes = new Set((await aSvc.listUnlocked(user.id)).map((item) => item.code));
    expect(codes.has('first_step')).toBe(true);
    expect(codes.has('first_quest')).toBe(true);
    expect(codes.has('week_streak')).toBe(true);
    expect(codes.has('health_balance')).toBe(true);
    expect(codes.has('early_bird')).toBe(true);
    expect(codes.has('personal_record_day')).toBe(true);
    expect(codes.has('category_personal_best')).toBe(true);
    const pbs = await aSvc.listPersonalBests(user.id);
    expect(pbs.filter((item) => item.scope === 'day')).toHaveLength(1);
    expect(pbs.find((item) => item.scope === 'day')?.value).toBe(5);
  });

  test('undoQuestCompletion removes an older occurrence by completion id', async () => {
    const { user, db, char } = await setup();
    const qRepo = new QuestRepo(db);
    const prog = new ProgressionService(db);
    const health = await qRepo.insert({
      user_id: null, title: 'Old health', description: null, category: 'health',
      difficulty: 1, xp_reward: 100, is_system: 1, is_active: 1,
    });
    const knowledge = await qRepo.insert({
      user_id: null, title: 'Later knowledge', description: null, category: 'knowledge',
      difficulty: 1, xp_reward: 50, is_system: 1, is_active: 1,
    });
    const first = await prog.completeQuest(user.id, health.id);
    const second = await prog.completeQuest(user.id, knowledge.id);

    const undone = await prog.undoQuestCompletion(user.id, first.completionId);
    expect(undone.success).toBe(true);
    expect(undone.questId).toBe(health.id);
    expect(undone.totalXp).toBe(50);

    const character = await new CharacterService(db).get(user.id);
    const healthStat = await new StatRepo(db).get(char.id, 'health');
    const knowledgeStat = await new StatRepo(db).get(char.id, 'knowledge');
    expect(character?.xp).toBe(50);
    expect(character?.class).toBe('scholar');
    expect(healthStat?.value).toBe(0);
    expect(knowledgeStat?.value).toBe(1);
    expect(await new CompletionRepo(db).getById(first.completionId)).toBeNull();
    expect(await new CompletionRepo(db).getById(second.completionId)).toBeTruthy();
  });

  test('syncFromHistory removes achievements that are no longer earned', async () => {
    const { user, db } = await setup();
    await seedCatalog(db);
    const qRepo = new QuestRepo(db);
    const prog = new ProgressionService(db);
    const q = await qRepo.insert({
      user_id: null, title: 'Only completion', description: null, category: 'health',
      difficulty: 1, xp_reward: 20, is_system: 1, is_active: 1,
    });
    const completion = await prog.completeQuest(user.id, q.id);
    const achievements = new AchievementService(db);
    await achievements.syncFromHistory(user.id);
    expect((await achievements.listUnlocked(user.id)).some(item => item.code === 'first_step')).toBe(true);

    await prog.undoQuestCompletion(user.id, completion.completionId);
    await achievements.syncFromHistory(user.id);
    expect(await achievements.listUnlocked(user.id)).toHaveLength(0);
    expect(await achievements.listPersonalBests(user.id)).toHaveLength(0);
  });
});

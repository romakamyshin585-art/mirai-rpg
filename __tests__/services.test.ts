import { freshMemoryDb } from '../src/db';
import { UserRepo } from '../src/repos/user_repo';
import { QuestRepo, CompletionRepo } from '../src/repos/quest_repo';
import { AchievementRepo, type Rarity } from '../src/repos/achievement_repo';
import { CharacterService } from '../src/services/character_service';
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
  // All 15 codes from RULES
  const codes: Array<{ code: string; name: string; description: string; rarity: Rarity; icon: string }> = [
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
    // Insert the completion row directly (we're not testing progression here)
    await cRepo.insert({ quest_id: q.id, user_id: user.id, category: 'health', xp_awarded: 20, dr_multiplier: 1.0 });
    const aSvc = new AchievementService(db);
    await aSvc.checkAfterCompletion(user.id, {
      completionAt: new Date('2026-08-28T15:00:00'),
      category: 'health', questId: q.id, difficulty: 1, xpAwarded: 20,
    });
    const pbs = await aSvc.listPersonalBests(user.id);
    const day = pbs.find((p) => p.scope === 'day');
    expect(day?.value).toBe(20);
  });
});

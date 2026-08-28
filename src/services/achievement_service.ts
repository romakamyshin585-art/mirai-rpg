/**
 * Achievement service.
 *
 * After a quest is completed, build the AchievementContext from the DB
 * and pass it to the engine (RULES). Any newly-unlocked codes get
 * persisted via AchievementRepo.tryUnlock.
 *
 * Also maintains personal_best (category:*, day).
 */

import type { DbExecutor } from '../db/executor';
import { CATEGORIES, type Category } from '../domain/category';
import { RULES, dayKey, daysBetween, type AchievementContext } from '../domain/achievements';
import { AchievementRepo, PersonalBestRepo } from '../repos/achievement_repo';
import { CompletionRepo, QuestRepo } from '../repos/quest_repo';

export interface NewlyUnlocked {
  code: string;
  name: string;
  rarity: string;
}

export class AchievementService {
  private aRepo: AchievementRepo;
  private pbRepo: PersonalBestRepo;
  private cRepo: CompletionRepo;
  private qRepo: QuestRepo;
  constructor(db: DbExecutor) {
    this.aRepo = new AchievementRepo(db);
    this.pbRepo = new PersonalBestRepo(db);
    this.cRepo = new CompletionRepo(db);
    this.qRepo = new QuestRepo(db);
  }

  /**
   * Called after every quest completion. Returns the list of achievement
   * codes that were just unlocked (so the UI can show a toast).
   */
  async checkAfterCompletion(userId: string, opts: {
    completionAt: Date;
    category: Category;
    questId: string;
    difficulty: number;
    xpAwarded: number;
  }): Promise<NewlyUnlocked[]> {
    const at = opts.completionAt;
    const today = dayKey(at);

    // Build context
    const perCategoryCount: Record<Category, number> = { health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 };
    for (const c of CATEGORIES) {
      perCategoryCount[c] = await this.cRepo.countByCategory(userId, c);
    }
    const distinctQuestIds = new Set(await this.cRepo.distinctQuestIds(userId));
    const recent = await this.cRepo.listRecent(userId, 200);
    // Enrich recent with difficulty via quest lookup
    const recentEnriched: Array<{ at: Date; category: Category; questId: string; difficulty: number }> = [];
    for (const r of recent) {
      const q = await this.qRepo.getById(r.quest_id);
      recentEnriched.push({
        at: new Date(r.completed_at),
        category: r.category,
        questId: r.quest_id,
        difficulty: q?.difficulty ?? 1,
      });
    }
    const activeDays = await this.cRepo.distinctActiveDays(userId);

    // Last active day strictly before today
    const beforeToday = activeDays.filter((d) => daysBetween(d, today) > 0);
    const lastActiveDayBeforeToday = beforeToday.length > 0 ? beforeToday[beforeToday.length - 1]! : null;

    // Total XP = sum across all completions (cheap: read all, sum)
    let totalXp = 0;
    for (const r of recent) totalXp += r.xp_awarded;

    const ctx: AchievementContext = {
      at,
      category: opts.category,
      xpAwarded: opts.xpAwarded,
      totalXp,
      perCategoryCount,
      distinctQuestIds,
      recentCompletions: recentEnriched,
      activeDays,
      today,
      lastActiveDayBeforeToday,
    };

    // Run rules
    const newlyUnlocked: NewlyUnlocked[] = [];
    for (const rule of RULES) {
      if (!rule.test(ctx)) continue;
      const def = await this.aRepo.getByCode(rule.code);
      if (!def) continue;  // catalog not seeded yet
      const inserted = await this.aRepo.tryUnlock(userId, def.id);
      if (inserted) newlyUnlocked.push({ code: def.code, name: def.name, rarity: def.rarity });
    }

    // Personal records (caller-managed)
    const dayIso = at.toISOString();
    const dayXp = await this.cRepo.sumXpForDay(userId, today);
    await this.pbRepo.maybeUpdate(userId, 'day', dayXp, dayIso);
    const catXp = await this.cRepo.sumXpForCategory(userId, opts.category);
    await this.pbRepo.maybeUpdate(userId, `category:${opts.category}`, catXp, dayIso);

    return newlyUnlocked;
  }

  async listUnlocked(userId: string) {
    const unlocks = await this.aRepo.listUnlocks(userId);
    const catalog = await this.aRepo.listCatalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    return unlocks.map((u) => {
      const def = byId.get(u.achievement_id);
      return {
        code: def?.code ?? '?',
        name: def?.name ?? '?',
        description: def?.description ?? '',
        rarity: def?.rarity ?? 'common',
        unlockedAt: u.unlocked_at,
      };
    });
  }

  async listCatalog() {
    return this.aRepo.listCatalog();
  }

  async listPersonalBests(userId: string) {
    return this.pbRepo.list(userId);
  }
}

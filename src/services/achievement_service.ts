import type { DbExecutor } from '../db/executor';
import { type Category } from '../domain/category';
import { dayKey, daysBetween } from '../domain/time';
import { RULES, weekendDayKeys, type AchievementContext } from '../domain/achievements';
import {
  AchievementRepo,
  PersonalBestRepo,
  type PersonalBestSeed,
} from '../repos/achievement_repo';
import { CompletionRepo, QuestRepo, type CompletionRow } from '../repos/quest_repo';

export interface NewlyUnlocked {
  code: string;
  name: string;
  rarity: string;
}

export interface UnlockedAchievement {
  id: string;
  code: string;
  name: string;
  description: string;
  rarity: string;
  icon: string;
  unlockedAt: string;
}

export interface CheckAfterCompletionOptions {
  completionAt: Date;
  category: Category;
  questId: string;
  difficulty: number;
  xpAwarded: number;
  completionId?: string;
}

export interface RemoveUnlocksResult {
  removed: number;
  removedCodes: string[];
  missingCodes: string[];
}

interface EnrichedCompletion {
  row: CompletionRow;
  at: Date;
  questId: string;
  category: Category;
  difficulty: number;
}

function emptyCategoryCounts(): Record<Category, number> {
  return { health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 };
}

export class AchievementService {
  private readonly aRepo: AchievementRepo;
  private readonly pbRepo: PersonalBestRepo;
  private readonly cRepo: CompletionRepo;
  private readonly qRepo: QuestRepo;

  constructor(db: DbExecutor) {
    this.aRepo = new AchievementRepo(db);
    this.pbRepo = new PersonalBestRepo(db);
    this.cRepo = new CompletionRepo(db);
    this.qRepo = new QuestRepo(db);
  }

  async checkAfterCompletion(
    userId: string,
    opts: CheckAfterCompletionOptions,
  ): Promise<NewlyUnlocked[]> {
    const { history, currentIndex } = await this.loadHistoryForCompletion(userId, opts);
    const current = history[currentIndex];
    if (!current) return [];
    const authoritativeAt = current.at;
    const authoritativeCategory = current.category;
    const authoritativeXp = this.xpOf(current);

    const { ctx, prefix } = this.buildContext(
      history,
      currentIndex,
      authoritativeAt,
      authoritativeCategory,
      authoritativeXp,
      false,
      false,
    );
    const today = dayKey(authoritativeAt);
    const dayXp = prefix
      .filter((entry) => dayKey(entry.at) === today)
      .reduce((sum, entry) => sum + this.xpOf(entry), 0);
    const categoryXp = prefix
      .filter((entry) => entry.category === authoritativeCategory)
      .reduce((sum, entry) => sum + this.xpOf(entry), 0);
    const achievedAt = current.row.completed_at;
    const [dayBest, categoryBest] = await Promise.all([
      this.pbRepo.maybeUpdate(userId, 'day', dayXp, achievedAt),
      this.pbRepo.maybeUpdate(
        userId,
        `category:${authoritativeCategory}`,
        categoryXp,
        achievedAt,
      ),
    ]);
    const newDayRecord = dayXp > 0 && dayBest.isNewRecord;
    const newCategoryRecord = categoryXp > 0 && categoryBest.isNewRecord;
    ctx.isNewPersonalBestDay = newDayRecord;
    ctx.isNewCategoryPersonalBest = newCategoryRecord;
    ctx.isNewDayRecord = newDayRecord;
    ctx.isNewCategoryRecord = newCategoryRecord;
    ctx.newPersonalBestDay = newDayRecord;
    ctx.newCategoryPersonalBest = newCategoryRecord;
    ctx.personalBestDayIsNew = newDayRecord;
    ctx.personalBestCategoryIsNew = newCategoryRecord;
    ctx.personalBest = { day: newDayRecord, category: newCategoryRecord };

    const passed = RULES.filter((rule) => rule.test(ctx)).map((rule) => rule.code);
    return this.unlockCodes(userId, passed);
  }

  async syncFromHistory(userId: string): Promise<NewlyUnlocked[]> {
    const history = await this.loadHistory(userId);
    if (history.length === 0) {
      await this.pbRepo.replaceForUser(userId, []);
      return [];
    }

    const dayTotals = new Map<string, number>();
    const categoryTotals = emptyCategoryCounts();
    let dayRecord: PersonalBestSeed | null = null;
    const categoryRecords = new Map<Category, PersonalBestSeed>();
    const prefix: EnrichedCompletion[] = [];
    const codes = new Set<string>();

    for (const event of history) {
      const xp = this.xpOf(event);
      const day = dayKey(event.at);
      dayTotals.set(day, (dayTotals.get(day) ?? 0) + xp);
      categoryTotals[event.category] += xp;

      const dayValue = dayTotals.get(day) ?? 0;
      const categoryValue = categoryTotals[event.category];
      const newDayRecord = dayValue > 0 && (dayRecord === null || dayValue > dayRecord.value);
      const newCategoryRecord = categoryValue > 0 && categoryValue > (categoryRecords.get(event.category)?.value ?? 0);
      if (newDayRecord) {
        dayRecord = { scope: 'day', value: dayValue, achieved_at: event.row.completed_at };
      }
      if (newCategoryRecord) {
        categoryRecords.set(event.category, {
          scope: `category:${event.category}`,
          value: categoryValue,
          achieved_at: event.row.completed_at,
        });
      }

      prefix.push(event);
      const { ctx } = this.buildContext(
        prefix,
        prefix.length - 1,
        event.at,
        event.category,
        xp,
        newDayRecord,
        newCategoryRecord,
      );
      for (const rule of RULES) {
        if (rule.test(ctx)) codes.add(rule.code);
      }
    }

    await this.pbRepo.replaceForUser(userId, [
      ...(dayRecord ? [dayRecord] : []),
      ...categoryRecords.values(),
    ]);
    return this.unlockCodes(userId, codes);
  }

  async removeUnlocks(userId: string, codes: string[]): Promise<RemoveUnlocksResult> {
    const uniqueCodes = [...new Set(codes)];
    const removedCodes: string[] = [];
    const missingCodes: string[] = [];
    for (const code of uniqueCodes) {
      const def = await this.aRepo.getByCode(code);
      if (!def) {
        missingCodes.push(code);
        continue;
      }
      if (await this.aRepo.deleteUnlock(userId, def.id)) removedCodes.push(code);
    }
    return { removed: removedCodes.length, removedCodes, missingCodes };
  }

  async listUnlocked(userId: string): Promise<UnlockedAchievement[]> {
    const [unlocks, catalog] = await Promise.all([
      this.aRepo.listUnlocks(userId),
      this.aRepo.listCatalog(),
    ]);
    const byId = new Map(catalog.map((item) => [item.id, item]));
    return unlocks.map((unlock) => {
      const def = byId.get(unlock.achievement_id);
      return {
        id: def?.id ?? unlock.achievement_id,
        code: def?.code ?? '?',
        name: def?.name ?? '?',
        description: def?.description ?? '',
        rarity: def?.rarity ?? 'common',
        icon: def?.icon || '🏆',
        unlockedAt: unlock.unlocked_at,
      };
    });
  }

  async listCatalog() {
    return this.aRepo.listCatalog();
  }

  async listPersonalBests(userId: string) {
    return this.pbRepo.list(userId);
  }

  private async loadHistory(userId: string): Promise<EnrichedCompletion[]> {
    const rows = await this.cRepo.listAll(userId);
    if (rows.length === 0) return [];
    const questRows = await this.qRepo.getByIds([...new Set(rows.map((row) => row.quest_id))]);
    const byId = new Map(questRows.map((quest) => [quest.id, quest]));
    return rows
      .map((row) => ({
        row,
        at: new Date(row.completed_at),
        questId: row.quest_id,
        category: row.category,
        difficulty: byId.get(row.quest_id)?.difficulty ?? 1,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  private async loadHistoryForCompletion(
    userId: string,
    opts: CheckAfterCompletionOptions,
  ): Promise<{ history: EnrichedCompletion[]; currentIndex: number }> {
    const history = await this.loadHistory(userId);
    let currentIndex = -1;
    if (opts.completionId) {
      currentIndex = history.findIndex((entry) => entry.row.id === opts.completionId);
    } else {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < history.length; i += 1) {
        const entry = history[i]!;
        if (
          entry.questId !== opts.questId ||
          entry.category !== opts.category ||
          this.xpOf(entry) !== opts.xpAwarded
        ) continue;
        const distance = Math.abs(entry.at.getTime() - opts.completionAt.getTime());
        if (distance <= bestDistance) {
          bestDistance = distance;
          currentIndex = i;
        }
      }
    }
    if (currentIndex < 0) {
      const pendingId = opts.completionId ?? `pending:${opts.questId}:${history.length}`;
      const row: CompletionRow = {
        id: pendingId,
        quest_id: opts.questId,
        user_id: userId,
        category: opts.category,
        xp_awarded: opts.xpAwarded,
        dr_multiplier: 1,
        completed_at: opts.completionAt.toISOString(),
      };
      history.push({
        row,
        at: opts.completionAt,
        questId: opts.questId,
        category: opts.category,
        difficulty: opts.difficulty,
      });
      history.sort((a, b) => a.at.getTime() - b.at.getTime());
      currentIndex = history.findIndex((entry) => entry.row.id === pendingId);
    }
    return { history, currentIndex };
  }

  private buildContext(
    history: EnrichedCompletion[],
    currentIndex: number,
    at: Date,
    category: Category,
    xpAwarded: number,
    dayRecord: boolean,
    categoryRecord: boolean,
  ): { ctx: AchievementContext; prefix: EnrichedCompletion[] } {
    const prefix = history.slice(0, currentIndex + 1);
    const perCategoryCount = emptyCategoryCounts();
    const distinctQuestIds = new Set<string>();
    let totalXp = 0;
    for (const entry of prefix) {
      perCategoryCount[entry.category] += 1;
      distinctQuestIds.add(entry.questId);
      totalXp += this.xpOf(entry);
    }
    const activeDays = [...new Set(prefix.map((entry) => dayKey(entry.at)))].sort();
    const today = dayKey(at);
    const priorDays = activeDays.filter((day) => daysBetween(day, today) > 0);
    const lastActiveDayBeforeToday = priorDays.length > 0 ? priorDays[priorDays.length - 1]! : null;
    const weekendKeys = new Set(weekendDayKeys(at));
    const currentWeekendCompletionCount = prefix.filter((entry) => weekendKeys.has(dayKey(entry.at))).length;
    const ctx: AchievementContext = {
      at,
      category,
      xpAwarded,
      totalXp,
      totalCompletions: prefix.length,
      perCategoryCount,
      distinctQuestIds,
      recentCompletions: prefix.map((entry) => ({
        at: entry.at,
        category: entry.category,
        questId: entry.questId,
        difficulty: entry.difficulty,
      })),
      activeDays,
      today,
      lastActiveDayBeforeToday,
      currentWeekendCompletionCount,
      isNewPersonalBestDay: dayRecord,
      isNewCategoryPersonalBest: categoryRecord,
      isNewDayRecord: dayRecord,
      isNewCategoryRecord: categoryRecord,
      newPersonalBestDay: dayRecord,
      newCategoryPersonalBest: categoryRecord,
      personalBestDayIsNew: dayRecord,
      personalBestCategoryIsNew: categoryRecord,
      personalBest: { day: dayRecord, category: categoryRecord },
    };
    return { ctx, prefix };
  }

  private async unlockCodes(userId: string, codes: Iterable<string>): Promise<NewlyUnlocked[]> {
    const catalog = await this.aRepo.listCatalog();
    const byCode = new Map(catalog.map((def) => [def.code, def]));
    const unlocked: NewlyUnlocked[] = [];
    for (const code of new Set(codes)) {
      const def = byCode.get(code);
      if (!def) continue;
      if (await this.aRepo.tryUnlock(userId, def.id)) {
        unlocked.push({ code: def.code, name: def.name, rarity: def.rarity });
      }
    }
    return unlocked;
  }

  private xpOf(entry: EnrichedCompletion): number {
    return Math.max(0, Math.floor(Number(entry.row.xp_awarded) || 0));
  }
}

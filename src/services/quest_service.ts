/**
 * Quest service. CRUD + listing for the UI.
 */

import type { DbExecutor } from '../db/executor';
import { QuestRepo, CompletionRepo, type QuestRow } from '../repos/quest_repo';
import type { Category } from '../domain/category';
import { dayKey } from '../domain/time';

export interface RecentActivityItem {
  id: string;
  type: 'quest_complete' | 'achievement_unlock' | 'level_up' | 'xp_gain';
  title: string;
  subtitle: string;
  timestamp: string;
  category?: Category;
  xp?: number;
}

export interface TodayProgress {
  todayXp: number;
  completedToday: number;
  categoryXp: Record<Category, number>;
}

export class QuestService {
  private q: QuestRepo;
  private c: CompletionRepo;
  /**
   * Catalogue cache.
   *
   * The catalogue is 226 rows and it is read by Home on every mount, by
   * every tab switch, and again after every completion. SQLite is not the
   * slow part - the transfer into JS and the re-ranking on top of it are.
   *
   * So the full list is held in memory and invalidated explicitly, by the
   * only three operations that can change it: create, archive, restore.
   * Reads therefore cost nothing after the first call, and the cache can
   * never disagree with the database because every write path bumps the
   * generation.
   */
  private cache: { generation: number; rows: QuestRow[] | null } = { generation: 0, rows: null };

  constructor(db: DbExecutor) {
    this.q = new QuestRepo(db);
    this.c = new CompletionRepo(db);
  }

  /** Drop the cached catalogue. Called by every mutation of the catalogue. */
  invalidateCatalogue(): void {
    this.cache.rows = null;
    this.cache.generation += 1;
  }

  async list(userId: string, filter?: { category?: Category }): Promise<QuestRow[]> {
    if (!this.cache.rows) this.cache.rows = await this.q.listForUser(userId);
    const rows = this.cache.rows;
    return filter?.category ? rows.filter(row => row.category === filter.category) : rows;
  }

  get(id: string) {
    return this.q.getById(id);
  }

  async getStreak(userId: string): Promise<number> {
    const activeDays = new Set(await this.c.distinctActiveDays(userId));
    const cursor = new Date();
    if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (activeDays.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  async create(userId: string, opts: { title: string; category: Category; difficulty: 1 | 2 | 3; xp_reward: number; description?: string }) {
    const row = await this.q.insert({
      user_id: userId,
      title: opts.title,
      description: opts.description ?? null,
      category: opts.category,
      difficulty: opts.difficulty,
      xp_reward: opts.xp_reward,
      is_system: 0,
      is_active: 1,
    });
    this.invalidateCatalogue();
    return row;
  }

  async archive(id: string) {
    await this.q.setActive(id, false);
    this.invalidateCatalogue();
  }

  async restore(id: string) {
    await this.q.setActive(id, true);
    this.invalidateCatalogue();
  }

  /** The user's own hidden quests, newest category first. */
  listArchived(userId: string) {
    return this.q.listArchivedForUser(userId);
  }

  countArchived(userId: string) {
    return this.q.countArchivedForUser(userId);
  }

  /** Irreversible. Returns how many completions were removed with it. */
  async hardDelete(id: string, userId: string) {
    const result = await this.q.hardDeleteForUser(id, userId);
    this.invalidateCatalogue();
    return result;
  }

  countCompletions(id: string) {
    return this.q.countCompletionsForQuest(id);
  }

  /**
   * What an edit is allowed to change, decided here rather than in the UI.
   *
   * The rules exist so editing can never be used to manufacture progress:
   *
   *  - the reward is fixed at creation. `xp_reward` is not a parameter,
   *    so there is no code path - new or future - that can raise it;
   *  - once a quest has been completed, its category and difficulty are
   *    frozen. `quest_completion` snapshots the category and the XP at the
   *    moment of completion, so the history and the stat totals are already
   *    correct; allowing the axis to move underneath a completed quest only
   *    makes the profile contradict itself;
   *  - system quests are never editable at all.
   */
  async planEdit(
    id: string,
    userId: string,
  ): Promise<{ quest: QuestRow; canChangeShape: boolean; completionCount: number } | null> {
    const quest = await this.q.getById(id);
    if (!quest || quest.user_id !== userId || quest.is_system !== 0) return null;
    const completionCount = await this.countCompletions(id);
    return { quest, canChangeShape: completionCount === 0, completionCount };
  }

  async applyEdit(
    id: string,
    userId: string,
    fields: { title: string; description: string | null; category: Category; difficulty: number },
  ): Promise<boolean> {
    const plan = await this.planEdit(id, userId);
    if (!plan) return false;
    const next = plan.canChangeShape
      ? fields
      : {
          title: fields.title,
          description: fields.description,
          category: plan.quest.category,
          difficulty: plan.quest.difficulty,
        };
    const ok = await this.q.updateOwned(id, userId, next);
    if (ok) this.invalidateCatalogue();
    return ok;
  }

  async getTodayProgress(userId: string): Promise<TodayProgress> {
    const today = dayKey(new Date());
    // SQL aggregates with local-day range semantics — no listRecent() LIMIT dependency,
    // no UTC/local drift near midnight. categoryXp is today-only (TODAY card semantics).
    const [todayXp, completedToday, health, knowledge, career, discipline, social] = await Promise.all([
      this.c.sumXpForLocalDay(userId, today),
      this.c.countForLocalDay(userId, today),
      this.c.sumXpForCategoryForLocalDay(userId, 'health', today),
      this.c.sumXpForCategoryForLocalDay(userId, 'knowledge', today),
      this.c.sumXpForCategoryForLocalDay(userId, 'career', today),
      this.c.sumXpForCategoryForLocalDay(userId, 'discipline', today),
      this.c.sumXpForCategoryForLocalDay(userId, 'social', today),
    ]);

    return {
      todayXp,
      completedToday,
      categoryXp: { health, knowledge, career, discipline, social },
    };
  }

  async getRecentActivity(userId: string, limit = 10): Promise<RecentActivityItem[]> {
    // 2 queries total (completions + batched quests), no N+1.
    const completions = await this.c.listRecent(userId, limit);
    if (completions.length === 0) return [];
    const questRows = await this.q.getByIds([...new Set(completions.map(c => c.quest_id))]);
    const byId = new Map(questRows.map(q => [q.id, q]));

    return completions.map((comp) => {
      const quest = byId.get(comp.quest_id);
      return {
        id: comp.id,
        type: 'quest_complete' as const,
        title: quest?.title ?? 'Квест выполнен',
        subtitle: quest ? `Сложность ${quest.difficulty} • ${comp.xp_awarded} XP` : `${comp.xp_awarded} XP`,
        timestamp: comp.completed_at,
        category: comp.category,
        xp: comp.xp_awarded,
      };
    });
  }
}

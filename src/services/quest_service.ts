/**
 * Quest service. CRUD + listing for the UI.
 */

import type { DbExecutor } from '../db/executor';
import { QuestRepo, CompletionRepo } from '../repos/quest_repo';
import type { Category } from '../domain/category';
import { dayKey } from '../domain/achievements';

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
  constructor(db: DbExecutor) {
    this.q = new QuestRepo(db);
    this.c = new CompletionRepo(db);
  }

  list(userId: string, filter?: { category?: Category }) {
    return this.q.listForUser(userId).then((rows) =>
      filter?.category ? rows.filter((r) => r.category === filter.category) : rows,
    );
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
    return this.q.insert({
      user_id: userId,
      title: opts.title,
      description: opts.description ?? null,
      category: opts.category,
      difficulty: opts.difficulty,
      xp_reward: opts.xp_reward,
      is_system: 0,
      is_active: 1,
    });
  }

  async archive(id: string) {
    return this.q.setActive(id, false);
  }

  async restore(id: string) {
    return this.q.setActive(id, true);
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

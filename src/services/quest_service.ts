/**
 * Quest service. CRUD + listing for the UI.
 */

import type { DbExecutor } from '../db/executor';
import { QuestRepo } from '../repos/quest_repo';
import type { Category } from '../domain/category';

export class QuestService {
  private q: QuestRepo;
  constructor(db: DbExecutor) {
    this.q = new QuestRepo(db);
  }

  list(userId: string, filter?: { category?: Category }) {
    return this.q.listForUser(userId).then((rows) =>
      filter?.category ? rows.filter((r) => r.category === filter.category) : rows,
    );
  }

  get(id: string) {
    return this.q.getById(id);
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
}

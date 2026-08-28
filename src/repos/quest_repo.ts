/**
 * Quest + completion repos.
 */

import type { DbExecutor } from '../db/executor';
import type { Category } from '../domain/category';
import { uuid } from '../utils/uuid';
import { nowIso } from '../utils/time';

export interface QuestRow {
  id: string;
  user_id: string | null;  // NULL = system quest
  title: string;
  description: string | null;
  category: Category;
  difficulty: number;       // 1..3
  xp_reward: number;
  is_system: number;        // 0|1
  is_active: number;        // 0|1
  created_at: string;
}

export interface CompletionRow {
  id: string;
  quest_id: string;
  user_id: string;
  category: Category;
  xp_awarded: number;
  dr_multiplier: number;
  completed_at: string;
}

export class QuestRepo {
  constructor(private readonly db: DbExecutor) {}

  async getById(id: string): Promise<QuestRow | null> {
    return this.db.one<QuestRow>(
      `SELECT id, user_id, title, description, category, difficulty, xp_reward, is_system, is_active, created_at
       FROM quest WHERE id = ?`,
      [id],
    );
  }

  /** System quests + user's own quests, active only. */
  async listForUser(userId: string): Promise<QuestRow[]> {
    return this.db.all<QuestRow>(
      `SELECT id, user_id, title, description, category, difficulty, xp_reward, is_system, is_active, created_at
       FROM quest
       WHERE is_active = 1 AND (is_system = 1 OR user_id = ?)
       ORDER BY category, difficulty, title`,
      [userId],
    );
  }

  /** All system quests (user_id IS NULL). */
  async listSystem(): Promise<QuestRow[]> {
    return this.db.all<QuestRow>(
      `SELECT * FROM quest WHERE user_id IS NULL ORDER BY category, title`,
    );
  }

  async listSystemActive(): Promise<QuestRow[]> {
    return this.db.all<QuestRow>(
      `SELECT id, user_id, title, description, category, difficulty, xp_reward, is_system, is_active, created_at
       FROM quest WHERE is_system = 1 AND is_active = 1`,
    );
  }

  async insert(row: Omit<QuestRow, 'id' | 'created_at'>): Promise<QuestRow> {
    const r: QuestRow = { ...row, id: uuid(), created_at: nowIso() };
    await this.db.exec(
      `INSERT INTO quest (id, user_id, title, description, category, difficulty, xp_reward, is_system, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.user_id, r.title, r.description, r.category, r.difficulty, r.xp_reward, r.is_system, r.is_active, r.created_at],
    );
    return r;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.db.exec(`UPDATE quest SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);
  }
}

export class CompletionRepo {
  constructor(private readonly db: DbExecutor) {}

  async insert(row: Omit<CompletionRow, 'id' | 'completed_at'>): Promise<CompletionRow> {
    const r: CompletionRow = { ...row, id: uuid(), completed_at: nowIso() };
    await this.db.exec(
      `INSERT INTO quest_completion (id, quest_id, user_id, category, xp_awarded, dr_multiplier, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.quest_id, r.user_id, r.category, r.xp_awarded, r.dr_multiplier, r.completed_at],
    );
    return r;
  }

  /** Count of completions for a user within a single category. */
  async countByCategory(userId: string, category: Category): Promise<number> {
    const r = await this.db.one<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM quest_completion WHERE user_id = ? AND category = ?`,
      [userId, category],
    );
    return r?.cnt ?? 0;
  }

  /** Distinct quest ids this user has ever completed. */
  async distinctQuestIds(userId: string): Promise<string[]> {
    const rows = await this.db.all<{ quest_id: string }>(
      `SELECT DISTINCT quest_id FROM quest_completion WHERE user_id = ?`,
      [userId],
    );
    return rows.map((r) => r.quest_id);
  }

  /**
   * Recent completions (without join). Caller can enrich with quest difficulty
   * via `QuestRepo.getById` if needed — we use this pattern to keep
   * repos simple and SQL portable.
   */
  async listRecent(userId: string, limit = 200): Promise<CompletionRow[]> {
    return this.db.all<CompletionRow>(
      `SELECT id, quest_id, user_id, category, xp_awarded, dr_multiplier, completed_at
       FROM quest_completion
       WHERE user_id = ?
       ORDER BY completed_at DESC
       LIMIT ?`,
      [userId, limit],
    );
  }

  /** XP earned on a specific day (local). Uses COUNT-then-sum (no COALESCE needed). */
  async sumXpForDay(userId: string, dayKey: string): Promise<number> {
    const rows = await this.db.all<{ xp: number }>(
      `SELECT xp_awarded AS xp
       FROM quest_completion
       WHERE user_id = ? AND substr(completed_at, 1, 10) = ?`,
      [userId, dayKey],
    );
    return rows.reduce((s, r) => s + Number(r.xp || 0), 0);
  }

  /** XP earned for a specific category, all-time. */
  async sumXpForCategory(userId: string, category: Category): Promise<number> {
    const rows = await this.db.all<{ xp: number }>(
      `SELECT xp_awarded AS xp
       FROM quest_completion
       WHERE user_id = ? AND category = ?`,
      [userId, category],
    );
    return rows.reduce((s, r) => s + Number(r.xp || 0), 0);
  }

  /** Distinct day keys (YYYY-MM-DD) the user has completed ≥1 quest. */
  async distinctActiveDays(userId: string): Promise<string[]> {
    const rows = await this.db.all<{ d: string }>(
      `SELECT DISTINCT substr(completed_at, 1, 10) AS d FROM quest_completion WHERE user_id = ? ORDER BY d ASC`,
      [userId],
    );
    return rows.map((r) => r.d);
  }
}

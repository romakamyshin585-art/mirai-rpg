/**
 * Quest + completion repos.
 */

import type { DbExecutor } from '../db/executor';
import type { Category } from '../domain/category';
import { dayKey } from '../domain/time';
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

  /**
   * Batch fetch by ids in a single query (2 queries total with completions, no N+1).
   * Uses parenthesised OR chain instead of IN (...) for portability with the
   * in-memory test executor. Preserves no order — caller maps by id.
   */
  async getByIds(ids: string[]): Promise<QuestRow[]> {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];
    const chunks: QuestRow[][] = [];
    const chunkSize = 400;
    for (let index = 0; index < unique.length; index += chunkSize) {
      const chunk = unique.slice(index, index + chunkSize);
      const clause = chunk.map(() => `id = ?`).join(' OR ');
      chunks.push(await this.db.all<QuestRow>(
        `SELECT id, user_id, title, description, category, difficulty, xp_reward, is_system, is_active, created_at
         FROM quest WHERE (${clause})`,
        chunk,
      ));
    }
    return chunks.flat();
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

export type CompletionInsert = Omit<CompletionRow, 'id' | 'completed_at'> & { completed_at?: string };

export class CompletionRepo {
  constructor(private readonly db: DbExecutor) {}

  async insert(row: CompletionInsert): Promise<CompletionRow> {
    const r: CompletionRow = {
      ...row,
      id: uuid(),
      completed_at: row.completed_at ?? nowIso(),
    };
    await this.db.exec(
      `INSERT INTO quest_completion (id, quest_id, user_id, category, xp_awarded, dr_multiplier, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.quest_id, r.user_id, r.category, r.xp_awarded, r.dr_multiplier, r.completed_at],
    );
    return r;
  }

  async getById(id: string): Promise<CompletionRow | null> {
    return this.db.one<CompletionRow>(
      `SELECT id, quest_id, user_id, category, xp_awarded, dr_multiplier, completed_at
       FROM quest_completion WHERE id = ?`,
      [id],
    );
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.db.exec(`DELETE FROM quest_completion WHERE id = ?`, [id]);
    return true;
  }

  async listAll(userId: string): Promise<CompletionRow[]> {
    return this.db.all<CompletionRow>(
      `SELECT id, quest_id, user_id, category, xp_awarded, dr_multiplier, completed_at
       FROM quest_completion
       WHERE user_id = ?
       ORDER BY completed_at ASC`,
      [userId],
    );
  }

  async listBetween(userId: string, from: string | Date, to: string | Date): Promise<CompletionRow[]> {
    const fromIso = from instanceof Date ? from.toISOString() : from;
    const toIso = to instanceof Date ? to.toISOString() : to;
    return this.db.all<CompletionRow>(
      `SELECT id, quest_id, user_id, category, xp_awarded, dr_multiplier, completed_at
       FROM quest_completion
       WHERE user_id = ? AND completed_at >= ? AND completed_at < ?
       ORDER BY completed_at ASC`,
      [userId, fromIso, toIso],
    );
  }

  async listForLocalDay(userId: string, localDayKey: string): Promise<CompletionRow[]> {
    const { fromIso, toIso } = CompletionRepo.localDayRange(localDayKey);
    return this.listBetween(userId, fromIso, toIso);
  }

  async countByCategory(userId: string, category: Category): Promise<number> {
    const r = await this.db.one<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM quest_completion WHERE user_id = ? AND category = ?`,
      [userId, category],
    );
    return r?.cnt ?? 0;
  }

  async countAll(userId: string): Promise<number> {
    const r = await this.db.one<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM quest_completion WHERE user_id = ?`,
      [userId],
    );
    return r?.cnt ?? 0;
  }

  async distinctQuestIds(userId: string): Promise<string[]> {
    const rows = await this.db.all<{ quest_id: string }>(
      `SELECT DISTINCT quest_id FROM quest_completion WHERE user_id = ?`,
      [userId],
    );
    return rows.map((r) => r.quest_id);
  }

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

  async totalXp(userId: string): Promise<number> {
    const rows = await this.db.all<{ xp: number }>(
      `SELECT xp_awarded AS xp FROM quest_completion WHERE user_id = ?`,
      [userId],
    );
    return rows.reduce((sum, row) => sum + Number(row.xp || 0), 0);
  }

  async sumXpAllTime(userId: string): Promise<number> {
    return this.totalXp(userId);
  }

  async sumXpForAllTime(userId: string): Promise<number> {
    return this.totalXp(userId);
  }

  async sumXpForDay(userId: string, localDayKey: string): Promise<number> {
    return this.sumXpForLocalDay(userId, localDayKey);
  }

  async sumXpForLocalDay(userId: string, localDayKey: string): Promise<number> {
    const rows = await this.listForLocalDay(userId, localDayKey);
    return rows.reduce((sum, row) => sum + Number(row.xp_awarded || 0), 0);
  }

  async sumXpForCategoryForLocalDay(userId: string, category: Category, localDayKey: string): Promise<number> {
    const rows = await this.listForLocalDay(userId, localDayKey);
    return rows
      .filter((row) => row.category === category)
      .reduce((sum, row) => sum + Number(row.xp_awarded || 0), 0);
  }

  async sumXpForCategory(userId: string, category: Category): Promise<number> {
    const rows = await this.db.all<{ xp: number }>(
      `SELECT xp_awarded AS xp
       FROM quest_completion
       WHERE user_id = ? AND category = ?`,
      [userId, category],
    );
    return rows.reduce((sum, row) => sum + Number(row.xp || 0), 0);
  }

  static localDayRange(localDayKey: string): { fromIso: string; toIso: string } {
    const fromLocal = new Date(`${localDayKey}T00:00:00`);
    fromLocal.setHours(0, 0, 0, 0);
    const toLocal = new Date(fromLocal);
    toLocal.setDate(toLocal.getDate() + 1);
    toLocal.setHours(0, 0, 0, 0);
    return { fromIso: fromLocal.toISOString(), toIso: toLocal.toISOString() };
  }

  async countForLocalDay(userId: string, localDayKey: string): Promise<number> {
    const { fromIso, toIso } = CompletionRepo.localDayRange(localDayKey);
    const r = await this.db.one<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM quest_completion
       WHERE user_id = ? AND completed_at >= ? AND completed_at < ?`,
      [userId, fromIso, toIso],
    );
    return r?.cnt ?? 0;
  }

  async distinctActiveDays(userId: string): Promise<string[]> {
    const rows = await this.listAll(userId);
    const days = new Set<string>();
    for (const row of rows) {
      const at = new Date(row.completed_at);
      if (!Number.isNaN(at.getTime())) days.add(dayKey(at));
    }
    return [...days].sort();
  }
}

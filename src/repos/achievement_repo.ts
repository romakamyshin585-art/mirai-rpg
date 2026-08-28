/**
 * Achievement catalog + unlocks repo.
 */

import type { DbExecutor } from '../db/executor';
import { uuid } from '../utils/uuid';
import { nowIso } from '../utils/time';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface AchievementDefRow {
  id: string;
  code: string;
  name: string;
  description: string;
  rarity: Rarity;
  icon: string;
  created_at: string;
}

export interface AchievementUnlockRow {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export class AchievementRepo {
  constructor(private readonly db: DbExecutor) {}

  async listCatalog(): Promise<AchievementDefRow[]> {
    return this.db.all<AchievementDefRow>(
      `SELECT id, code, name, description, rarity, icon, created_at FROM achievement ORDER BY rarity, name`,
    );
  }

  async getByCode(code: string): Promise<AchievementDefRow | null> {
    return this.db.one<AchievementDefRow>(
      `SELECT id, code, name, description, rarity, icon, created_at FROM achievement WHERE code = ?`,
      [code],
    );
  }

  async insertDef(row: Omit<AchievementDefRow, 'id' | 'created_at'>): Promise<AchievementDefRow> {
    const r: AchievementDefRow = {
      ...row,
      id: uuid(),
      created_at: nowIso(),
      icon: row.icon || '🏆',
    };
    await this.db.exec(
      `INSERT INTO achievement (id, code, name, description, rarity, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.code, r.name, r.description, r.rarity, r.icon, r.created_at],
    );
    return r;
  }

  async listUnlocks(userId: string): Promise<AchievementUnlockRow[]> {
    return this.db.all<AchievementUnlockRow>(
      `SELECT id, user_id, achievement_id, unlocked_at FROM achievement_unlock WHERE user_id = ?`,
      [userId],
    );
  }

  /** Returns true if newly inserted, false if already unlocked. */
  async tryUnlock(userId: string, achievementId: string): Promise<boolean> {
    const existing = await this.db.one<{ id: string }>(
      `SELECT id FROM achievement_unlock WHERE user_id = ? AND achievement_id = ?`,
      [userId, achievementId],
    );
    if (existing) return false;
    await this.db.exec(
      `INSERT INTO achievement_unlock (id, user_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)`,
      [uuid(), userId, achievementId, nowIso()],
    );
    return true;
  }
}

export class PersonalBestRepo {
  constructor(private readonly db: DbExecutor) {}

  async get(userId: string, scope: string): Promise<{ value: number; achieved_at: string } | null> {
    return this.db.one<{ value: number; achieved_at: string }>(
      `SELECT value, achieved_at FROM personal_best WHERE user_id = ? AND scope = ?`,
      [userId, scope],
    );
  }

  /** Update PB if new value is greater. Returns the current PB after the call. */
  async maybeUpdate(userId: string, scope: string, value: number, achievedAt: string): Promise<{ value: number; achieved_at: string }> {
    const cur = await this.get(userId, scope);
    if (!cur || value > cur.value) {
      if (cur) {
        await this.db.exec(
          `UPDATE personal_best SET value = ?, achieved_at = ? WHERE user_id = ? AND scope = ?`,
          [value, achievedAt, userId, scope],
        );
      } else {
        await this.db.exec(
          `INSERT INTO personal_best (user_id, scope, value, achieved_at) VALUES (?, ?, ?, ?)`,
          [userId, scope, value, achievedAt],
        );
      }
      return { value, achieved_at: achievedAt };
    }
    return cur;
  }

  async list(userId: string): Promise<Array<{ scope: string; value: number; achieved_at: string }>> {
    return this.db.all<{ scope: string; value: number; achieved_at: string }>(
      `SELECT scope, value, achieved_at FROM personal_best WHERE user_id = ?`,
      [userId],
    );
  }
}

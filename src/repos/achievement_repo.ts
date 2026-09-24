import type { DbExecutor } from '../db/executor';
import { uuid } from '../utils/uuid';
import { nowIso } from '../utils/time';

const unlockQueues = new Map<string, Promise<void>>();

async function enqueueUnlock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = unlockQueues.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  unlockQueues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (unlockQueues.get(key) === current) unlockQueues.delete(key);
  }
}

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

export interface PersonalBestValue {
  value: number;
  achieved_at: string;
}

export interface PersonalBestUpdate extends PersonalBestValue {
  isNewRecord: boolean;
}

export interface PersonalBestSeed {
  scope: string;
  value: number;
  achieved_at: string;
}

export interface PersonalBestRow extends PersonalBestValue {
  scope: string;
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
      `INSERT OR IGNORE INTO achievement (id, code, name, description, rarity, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.code, r.name, r.description, r.rarity, r.icon, r.created_at],
    );
    const inserted = await this.getByCode(r.code);
    if (!inserted) throw new Error(`Achievement insertDef failed: code=${r.code}`);
    return inserted;
  }

  async listUnlocks(userId: string): Promise<AchievementUnlockRow[]> {
    return this.db.all<AchievementUnlockRow>(
      `SELECT id, user_id, achievement_id, unlocked_at FROM achievement_unlock WHERE user_id = ?`,
      [userId],
    );
  }

  async tryUnlock(userId: string, achievementId: string): Promise<boolean> {
    const key = `${userId}:${achievementId}`;
    return enqueueUnlock(key, async () => {
      const existing = await this.db.one<{ id: string }>(
        `SELECT id FROM achievement_unlock WHERE user_id = ? AND achievement_id = ?`,
        [userId, achievementId],
      );
      if (existing) return false;
      await this.db.exec(
        `INSERT OR IGNORE INTO achievement_unlock (id, user_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)`,
        [uuid(), userId, achievementId, nowIso()],
      );
      return true;
    });
  }

  async deleteUnlock(userId: string, achievementId: string): Promise<boolean> {
    const existing = await this.db.one<{ id: string }>(
      `SELECT id FROM achievement_unlock WHERE user_id = ? AND achievement_id = ?`,
      [userId, achievementId],
    );
    if (!existing) return false;
    await this.db.exec(
      `DELETE FROM achievement_unlock WHERE user_id = ? AND achievement_id = ?`,
      [userId, achievementId],
    );
    return true;
  }
}

export class PersonalBestRepo {
  constructor(private readonly db: DbExecutor) {}

  async get(userId: string, scope: string): Promise<PersonalBestValue | null> {
    return this.db.one<PersonalBestValue>(
      `SELECT value, achieved_at FROM personal_best WHERE user_id = ? AND scope = ?`,
      [userId, scope],
    );
  }

  async maybeUpdate(userId: string, scope: string, value: number, achievedAt: string): Promise<PersonalBestUpdate> {
    const normalizedValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const current = await this.get(userId, scope);
    if (!current || normalizedValue > current.value) {
      if (current) {
        await this.db.exec(
          `UPDATE personal_best SET value = ?, achieved_at = ? WHERE user_id = ? AND scope = ?`,
          [normalizedValue, achievedAt, userId, scope],
        );
      } else {
        await this.db.exec(
          `INSERT INTO personal_best (user_id, scope, value, achieved_at) VALUES (?, ?, ?, ?)`,
          [userId, scope, normalizedValue, achievedAt],
        );
      }
      return { value: normalizedValue, achieved_at: achievedAt, isNewRecord: true };
    }
    return { ...current, isNewRecord: false };
  }

  async replaceForUser(userId: string, records: PersonalBestSeed[]): Promise<void> {
    const uniqueRecords = [...new Map(records.map((record) => [record.scope, record])).values()];
    await this.db.withTransaction(async (tx) => {
      await tx.exec(`DELETE FROM personal_best WHERE user_id = ?`, [userId]);
      for (const record of uniqueRecords) {
        await tx.exec(
          `INSERT INTO personal_best (user_id, scope, value, achieved_at) VALUES (?, ?, ?, ?)`,
          [userId, record.scope, Math.max(0, Math.floor(record.value)), record.achieved_at],
        );
      }
    });
  }

  async list(userId: string): Promise<PersonalBestRow[]> {
    return this.db.all<PersonalBestRow>(
      `SELECT scope, value, achieved_at FROM personal_best WHERE user_id = ?`,
      [userId],
    );
  }
}

/**
 * Character + stat repos.
 */

import type { DbExecutor } from '../db/executor';
import type { Category } from '../domain/category';
import { CATEGORIES } from '../domain/category';
import { uuid } from '../utils/uuid';
import { nowIso } from '../utils/time';

export type CharacterClass = 'warrior' | 'scholar' | 'builder' | 'monk' | 'leader' | null;

export interface CharacterRow {
  id: string;
  user_id: string;
  name: string | null;
  class: CharacterClass;
  level: number;
  xp: number;
  created_at: string;
}

export interface StatRow {
  character_id: string;
  category: Category;
  value: number;
  xp_total_in_category: number;
}

export class CharacterRepo {
  constructor(private readonly db: DbExecutor) {}

  async getByUser(userId: string): Promise<CharacterRow | null> {
    return this.db.one<CharacterRow>(
      `SELECT id, user_id, name, class, level, xp, created_at
       FROM character WHERE user_id = ? LIMIT ?`,
      [userId, 1],
    );
  }

  async create(userId: string, name: string | null = null): Promise<CharacterRow> {
    const row: CharacterRow = {
      id: uuid(),
      user_id: userId,
      name,
      class: null,
      level: 1,
      xp: 0,
      created_at: nowIso(),
    };
    await this.db.exec(
      `INSERT INTO character (id, user_id, name, class, level, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.name, row.class, row.level, row.xp, row.created_at],
    );
    return row;
  }

  async setName(id: string, name: string): Promise<void> {
    await this.db.exec(`UPDATE character SET name = ? WHERE id = ?`, [name, id]);
  }

  async setClass(id: string, cls: CharacterClass): Promise<void> {
    await this.db.exec(`UPDATE character SET class = ? WHERE id = ?`, [cls, id]);
  }

  async addXp(id: string, delta: number): Promise<CharacterRow | null> {
    await this.db.exec(
      `UPDATE character SET xp = xp + ? WHERE id = ?`,
      [delta, id],
    );
    return this.getById(id);
  }

  async setXp(id: string, xp: number): Promise<CharacterRow | null> {
    const normalizedXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
    await this.db.exec(`UPDATE character SET xp = ? WHERE id = ?`, [normalizedXp, id]);
    return this.getById(id);
  }

  async setLevel(id: string, level: number): Promise<void> {
    await this.db.exec(`UPDATE character SET level = ? WHERE id = ?`, [level, id]);
  }

  async getById(id: string): Promise<CharacterRow | null> {
    return this.db.one<CharacterRow>(
      `SELECT id, user_id, name, class, level, xp, created_at FROM character WHERE id = ?`,
      [id],
    );
  }
}

export class StatRepo {
  constructor(private readonly db: DbExecutor) {}

  async list(characterId: string): Promise<StatRow[]> {
    return this.db.all<StatRow>(
      `SELECT character_id, category, value, xp_total_in_category
       FROM stat WHERE character_id = ?`,
      [characterId],
    );
  }

  async get(characterId: string, category: Category): Promise<StatRow | null> {
    return this.db.one<StatRow>(
      `SELECT character_id, category, value, xp_total_in_category
       FROM stat WHERE character_id = ? AND category = ?`,
      [characterId, category],
    );
  }

  /** Idempotent: ensures a row exists for every category. Returns the full list. */
  async ensureAll(characterId: string): Promise<StatRow[]> {
    const existing = await this.list(characterId);
    const have = new Set(existing.map((s) => s.category));
    for (const c of CATEGORIES) {
      if (!have.has(c)) {
        await this.db.exec(
          `INSERT INTO stat (character_id, category, value, xp_total_in_category) VALUES (?, ?, ?, ?)`,
          [characterId, c, 0, 0],
        );
      }
    }
    return this.list(characterId);
  }

  async incrementValue(characterId: string, category: Category, valueDelta: number, xpDelta: number): Promise<StatRow | null> {
    await this.db.exec(
      `UPDATE stat SET value = value + ?, xp_total_in_category = xp_total_in_category + ?
       WHERE character_id = ? AND category = ?`,
      [valueDelta, xpDelta, characterId, category],
    );
    return this.get(characterId, category);
  }

  async decrementValue(characterId: string, category: Category, valueDelta: number, xpDelta: number): Promise<StatRow | null> {
    const current = await this.get(characterId, category);
    if (!current) return null;
    const currentValue = Number.isFinite(current.value) ? current.value : 0;
    const currentXp = Number.isFinite(current.xp_total_in_category) ? current.xp_total_in_category : 0;
    const nextValue = Math.max(0, currentValue - valueDelta);
    const nextXp = Math.max(0, currentXp - xpDelta);
    await this.db.exec(
      `UPDATE stat SET value = ?, xp_total_in_category = ? WHERE character_id = ? AND category = ?`,
      [nextValue, nextXp, characterId, category],
    );
    return this.get(characterId, category);
  }
}

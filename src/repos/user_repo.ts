/**
 * User repo. Single-user app: at most one row expected at any time.
 */

import type { DbExecutor } from '../db/executor';
import { uuid } from '../utils/uuid';
import { nowIso } from '../utils/time';

export interface UserRow {
  id: string;
  name: string;
  created_at: string;
}

export class UserRepo {
  constructor(private readonly db: DbExecutor) {}

  async getById(id: string): Promise<UserRow | null> {
    return this.db.one<UserRow>(`SELECT id, name, created_at FROM user WHERE id = ?`, [id]);
  }

  async get(): Promise<UserRow | null> {
    return this.db.one<UserRow>(`SELECT id, name, created_at FROM user LIMIT ?`, [1]);
  }

  async create(name: string, id?: string): Promise<UserRow> {
    const row: UserRow = { id: id ?? uuid(), name, created_at: nowIso() };
    await this.db.exec(
      `INSERT INTO user (id, name, created_at) VALUES (?, ?, ?)`,
      [row.id, row.name, row.created_at],
    );
    return row;
  }

  async createWithId(id: string, name: string): Promise<UserRow> {
    return this.create(name, id);
  }
}

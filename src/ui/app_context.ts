/**
 * App-level singleton wiring. Owns the DB connection, the single user,
 * and exposes the services.
 *
 * No DI library — the app is small and the lifetime of these services
 * is the app's lifetime.
 */

import type { DbExecutor } from '../db/executor';
import { migrate } from '../db';
import { seedIfEmpty } from '../seed';
import { getExecutor } from '../db/sqlite';
import { AuthService } from '../services/auth_service';
import { CharacterService } from '../services/character_service';
import { QuestService } from '../services/quest_service';
import { ProgressionService } from '../services/progression_service';
import { AchievementService } from '../services/achievement_service';
import { UserRepo } from '../repos/user_repo';

const USER_ID_KEY = 'user_id';

function genUserId(): string {
  return 'u_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

export class AppContext {
  static instance: AppContext | null = null;
  static initPromise: Promise<AppContext> | null = null;

  db!: DbExecutor;
  auth!: AuthService;
  character!: CharacterService;
  quest!: QuestService;
  progression!: ProgressionService;
  achievement!: AchievementService;
  userId!: string;

  static async init(): Promise<AppContext> {
    // Return existing instance if already initialized
    if (AppContext.instance) return AppContext.instance;

    // If initialization is in progress, await the same promise (single-flight)
    if (AppContext.initPromise) {
      console.log('[MiraiRPG] AppContext.init: awaiting in-progress initialization');
      return AppContext.initPromise;
    }

    // Start new initialization
    AppContext.initPromise = (async () => {
      const ctx = new AppContext();
      console.log('[MiraiRPG] AppContext.init: opening database');
      ctx.db = await ctx._openDb();
      console.log('[MiraiRPG] AppContext.init: running migrations');
      await migrate(ctx.db);
      console.log('[MiraiRPG] AppContext.init: seeding database');
      await seedIfEmpty(ctx.db);
      console.log('[MiraiRPG] AppContext.init: creating services');
      ctx.auth = new AuthService();
      ctx.character = new CharacterService(ctx.db);
      ctx.quest = new QuestService(ctx.db);
      ctx.progression = new ProgressionService(ctx.db);
      ctx.achievement = new AchievementService(ctx.db);
      console.log('[MiraiRPG] AppContext.init: ensuring user ID');
      ctx.userId = await ctx._ensureUserId();
      await ctx.achievement.syncFromHistory(ctx.userId);
      console.log('[MiraiRPG] AppContext.init: getting/creating character');
      await ctx.character.getOrCreate(ctx.userId, 'Hero');
      AppContext.instance = ctx;
      console.log('[MiraiRPG] AppContext.init: complete');
      return ctx;
    })();

    try {
      return await AppContext.initPromise;
    } catch (e) {
      // On failure, reset the promise so retry can start fresh
      AppContext.initPromise = null;
      throw e;
    }
  }

  static resetInstance(): void {
    AppContext.instance = null;
    AppContext.initPromise = null;
  }

  private async _openDb(): Promise<DbExecutor> {
    return await getExecutor();
  }

  /**
   * Read the user_id from the config table. If absent, generate a new
   * one, store it, and ensure the matching user row exists. This avoids
   * expo-secure-store entirely: the user's identity is just a row in
   * SQLite, which is the same place everything already lives.
   */
  private async _ensureUserId(): Promise<string> {
    const row = await this.db.one<{ value: string }>(
      `SELECT value FROM config WHERE key = ?`,
      [USER_ID_KEY],
    );
    let id = row?.value ?? '';
    if (!id) {
      id = genUserId();
      await this.db.exec(
        `INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`,
        [USER_ID_KEY, id],
      );
    }
    const repo = new UserRepo(this.db);
    const existing = await repo.getById(id);
    if (!existing) await repo.create('Roman', id);
    return id;
  }
}



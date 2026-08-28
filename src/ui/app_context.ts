/**
 * App-level singleton wiring. Owns the DB connection, the single user,
 * and exposes the services. Re-initialises after a sign-out.
 *
 * No DI library — the app is small and the lifetime of these services
 * is the app's lifetime.
 */

import type { DbExecutor } from '../db/executor';
import { migrate, freshMemoryDb } from '../db';
import { seedIfEmpty } from '../seed';
import { getExecutor } from '../db/sqlite';
import { AuthService } from '../services/auth_service';
import { CharacterService } from '../services/character_service';
import { QuestService } from '../services/quest_service';
import { ProgressionService } from '../services/progression_service';
import { AchievementService } from '../services/achievement_service';
import { UserRepo } from '../repos/user_repo';

export class AppContext {
  // Public singleton holder (single-user app, no DI needed)
  static instance: AppContext | null = null;

  db!: DbExecutor;
  auth!: AuthService;
  character!: CharacterService;
  quest!: QuestService;
  progression!: ProgressionService;
  achievement!: AchievementService;
  userId!: string;

  static async init(): Promise<AppContext> {
    if (AppContext.instance) return AppContext.instance;
    const ctx = new AppContext();
    ctx.db = await ctx._openDb();
    await migrate(ctx.db);
    await seedIfEmpty(ctx.db);
    ctx.auth = new AuthService();
    ctx.character = new CharacterService(ctx.db);
    ctx.quest = new QuestService(ctx.db);
    ctx.progression = new ProgressionService(ctx.db);
    ctx.achievement = new AchievementService(ctx.db);
    ctx.userId = await ctx._ensureUserId();
    // Lazy init character (not awaited to keep init() sync-ish; screens will block)
    void ctx.character.getOrCreate(ctx.userId, 'Hero').catch(() => {});
    AppContext.instance = ctx;
    return ctx;
  }

  private async _openDb(): Promise<DbExecutor> {
    try {
      return await getExecutor();
    } catch {
      // expo-sqlite not available (e.g. in tests or web) — fall back to memory
      return freshMemoryDb();
    }
  }

  /**
   * Single-user app: we keep a stable user id in secure-store.
   * The user table itself just stores the name.
   */
  private async _ensureUserId(): Promise<string> {
    const SecureStore = await import('expo-secure-store');
    const KEY = 'mirai_rpg.user_id_v1';
    let id = await SecureStore.getItemAsync(KEY);
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2, 12);
      await SecureStore.setItemAsync(KEY, id);
    }
    // Mirror the user row in the DB (idempotent)
    const repo = new UserRepo(this.db);
    const existing = await repo.getById(id);
    if (!existing) await repo.create('Roman', id);
    return id;
  }
}

export async function getAppContext(): Promise<AppContext> {
  if (AppContext.instance) return AppContext.instance;
  return AppContext.init();
}

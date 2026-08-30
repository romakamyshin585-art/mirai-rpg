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
    void ctx.character.getOrCreate(ctx.userId, 'Hero').catch(() => {});
    AppContext.instance = ctx;
    return ctx;
  }

  private async _openDb(): Promise<DbExecutor> {
    try {
      return await getExecutor();
    } catch {
      return freshMemoryDb();
    }
  }

  private async _ensureUserId(): Promise<string> {
    const SecureStore = await import('expo-secure-store');
    const KEY = 'mirai_rpg.user_id_v1';
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('secure-store timeout')), ms),
        ),
      ]);
    let id: string | null = null;
    try {
      id = await withTimeout(SecureStore.getItemAsync(KEY), 3000);
    } catch {
      // на Android 10 Keystore иногда висит → генерим новый
    }
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2, 12);
      try {
        await withTimeout(SecureStore.setItemAsync(KEY, id), 3000);
      } catch {
        // даже если не сохранилось — для текущего запуска хватит
      }
    }
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

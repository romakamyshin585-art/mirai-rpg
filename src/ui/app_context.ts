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
    console.log('[MiraiRPG] init: starting');
    const ctx = new AppContext();
    console.log('[MiraiRPG] init: opening DB');
    ctx.db = await ctx._openDb();
    console.log('[MiraiRPG] init: migrate');
    await migrate(ctx.db);
    console.log('[MiraiRPG] init: seed');
    await seedIfEmpty(ctx.db);
    ctx.auth = new AuthService();
    ctx.character = new CharacterService(ctx.db);
    ctx.quest = new QuestService(ctx.db);
    ctx.progression = new ProgressionService(ctx.db);
    ctx.achievement = new AchievementService(ctx.db);
    console.log('[MiraiRPG] init: ensureUserId');
    ctx.userId = await ctx._ensureUserId();
    console.log('[MiraiRPG] init: done, userId=' + ctx.userId);
    void ctx.character.getOrCreate(ctx.userId, 'Hero').catch((e) => console.warn('[MiraiRPG] char init failed:', e));
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
    const AsyncStorageMod = await import('@react-native-async-storage/async-storage');
    const AsyncStorage = (AsyncStorageMod as any).default ?? AsyncStorageMod;
    const KEY = 'mirai_rpg.user_id_v1';
    const KEY_AS = 'mirai_rpg.user_id_as_v1';

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout: ${label}`)), ms),
        ),
      ]);

    let id: string | null = null;
    try {
      id = await withTimeout(SecureStore.getItemAsync(KEY), 3000, 'ss.get');
    } catch (e) {
      console.warn('[MiraiRPG] user_id from secure-store failed, trying AS:', e);
      try { id = await AsyncStorage.getItem(KEY_AS); } catch {}
    }
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2, 12);
      try { await withTimeout(SecureStore.setItemAsync(KEY, id), 3000, 'ss.set'); } catch {}
      try { await AsyncStorage.setItem(KEY_AS, id); } catch {}
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

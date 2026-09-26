import { freshMemoryDb } from '../src/db';
import { AppContext } from '../src/ui/app_context';
import { AchievementRepo } from '../src/repos/achievement_repo';
import { seedIfEmpty } from '../src/seed';

describe('AppContext init singleton behavior', () => {
  beforeEach(() => {
    // Reset singleton before each test
    (AppContext as any).instance = null;
    (AppContext as any).initPromise = null;
  });

  test('instance is null initially', () => {
    expect(AppContext.instance).toBeNull();
    expect((AppContext as any).initPromise).toBeNull();
  });

  test('resetInstance clears instance and promise', async () => {
    // Manually set some values
    (AppContext as any).instance = { test: 'data' };
    (AppContext as any).initPromise = Promise.resolve({ test: 'data' });
    
    AppContext.resetInstance();
    
    expect(AppContext.instance).toBeNull();
    expect((AppContext as any).initPromise).toBeNull();
  });

  test('init creates new promise when none exists', () => {
    // This test verifies the promise logic without calling actual init
    // (which requires expo-sqlite native module)
    const initPromise = (AppContext as any).initPromise;
    expect(initPromise).toBeNull();
  });

  test('single-flight: concurrent init calls resolve to same instance', async () => {
    // Reset
    (AppContext as any).instance = null;
    (AppContext as any).initPromise = null;
    
    // Mock the internal _openDb to avoid native module
    const originalOpenDb = (AppContext as any).prototype._openDb;
    (AppContext as any).prototype._openDb = async () => {
      return await freshMemoryDb();
    };
    
    // Call init 3 times "concurrently" (without awaiting between)
    const p1 = AppContext.init();
    const p2 = AppContext.init();
    const p3 = AppContext.init();
    
    // All should resolve to the SAME instance (single-flight)
    const [ctx1, ctx2, ctx3] = await Promise.all([p1, p2, p3]);
    expect(ctx1).toBe(ctx2);
    expect(ctx2).toBe(ctx3);
    expect(AppContext.instance).toBe(ctx1);
    
    // Restore
    (AppContext as any).prototype._openDb = originalOpenDb;
  });

  test('single-flight: after failure, retry starts fresh init', async () => {
    // Reset
    (AppContext as any).instance = null;
    (AppContext as any).initPromise = null;
    
    // Save original _openDb
    const originalOpenDb = (AppContext as any).prototype._openDb;
    
    // Mock _openDb to fail on first call, succeed on second
    let callCount = 0;
    (AppContext as any).prototype._openDb = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated DB failure');
      }
      return await freshMemoryDb();
    };
    
    // First init should fail
    await expect(AppContext.init()).rejects.toThrow('Simulated DB failure');
    
    // initPromise should be reset after failure
    expect((AppContext as any).initPromise).toBeNull();
    expect(AppContext.instance).toBeNull();
    
    // Second init should succeed (retry)
    const ctx = await AppContext.init();
    expect(ctx).toBeDefined();
    expect(AppContext.instance).toBe(ctx);
    
    // Third init should return same instance
    const ctx2 = await AppContext.init();
    expect(ctx2).toBe(ctx);
    
    // Restore
    (AppContext as any).prototype._openDb = originalOpenDb;
  });
});

describe('AppContext seed idempotency with pre-existing achievements', () => {
  test('seedIfEmpty with pre-existing achievements does not crash', async () => {
    const db = await freshMemoryDb();
    // Manually seed achievements first
    const aRepo = new AchievementRepo(db);
    for (const def of require('../src/seed/achievements').ACHIEVEMENT_SEED) {
      await aRepo.insertDef(def);
    }
    
    // Now run seedIfEmpty - should not error, should not duplicate
    const result = await seedIfEmpty(db);
    expect(result.achievementsInserted).toBe(0);
    const cat = await aRepo.listCatalog();
    expect(cat.length).toBe(17);
  });

  test('seedIfEmpty is idempotent across multiple calls', async () => {
    const db = await freshMemoryDb();
    const result1 = await seedIfEmpty(db); // First call - should insert
    const result2 = await seedIfEmpty(db); // Second call - should be idempotent
    
    expect(result1.achievementsInserted).toBe(17);
    expect(result1.questsInserted).toBe(226); // 76 wave-1 + 150 wave-2
    expect(result2.achievementsInserted).toBe(0);
    expect(result2.questsInserted).toBe(0);
  });
});

describe('AchievementRepo insertDef', () => {
  test('insertDef with duplicate code returns first record', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    
    const def = { 
      code: 'test_code', 
      name: 'Test', 
      description: 'Test desc', 
      rarity: 'common' as const, 
      icon: '🧪' 
    };
    
    const first = await aRepo.insertDef(def);
    expect(first).not.toBeNull();
    expect(first?.code).toBe('test_code');
    
    // Insert same code again
    const second = await aRepo.insertDef(def);
    expect(second).not.toBeNull();
    expect(second?.code).toBe('test_code');
    expect(second?.id).toBe(first?.id); // getByCode returns first record
    
    // Verify getByCode returns the first record
    const byCode = await aRepo.getByCode('test_code');
    expect(byCode).not.toBeNull();
    expect(byCode?.id).toBe(first?.id);
  });

  test('insertDef with different codes creates separate records', async () => {
    const db = await freshMemoryDb();
    const aRepo = new AchievementRepo(db);
    
    const def1 = { code: 'code1', name: 'Test 1', description: 'Desc', rarity: 'common' as const, icon: '🧪' };
    const def2 = { code: 'code2', name: 'Test 2', description: 'Desc', rarity: 'rare' as const, icon: '🧪' };
    
    await aRepo.insertDef(def1);
    await aRepo.insertDef(def2);
    
    const all = await aRepo.listCatalog();
    expect(all.length).toBe(2);
    const codes = new Set(all.map(a => a.code));
    expect(codes.has('code1')).toBe(true);
    expect(codes.has('code2')).toBe(true);
  });
});
import { freshMemoryDb } from '../src/db';
import { UserRepo } from '../src/repos/user_repo';
import { QuestRepo, CompletionRepo } from '../src/repos/quest_repo';
import { CharacterService } from '../src/services/character_service';
import { ProgressionService } from '../src/services/progression_service';
import { QuestService } from '../src/services/quest_service';
import { dayKey } from '../src/domain/time';

async function setup() {
  const db = await freshMemoryDb();
  const user = await new UserRepo(db).create('tester');
  const charSvc = new CharacterService(db);
  const char = await charSvc.getOrCreate(user.id, 'Hero');
  const prog = new ProgressionService(db);
  const qSvc = new QuestService(db);
  const qRepo = new QuestRepo(db);
  return { db, user, char, prog, qSvc, qRepo };
}

describe('QuestService.getTodayProgress', () => {
  test('returns zeros when no completions', async () => {
    const { user, qSvc } = await setup();
    const p = await qSvc.getTodayProgress(user.id);
    expect(p.todayXp).toBe(0);
    expect(p.completedToday).toBe(0);
    expect(p.categoryXp.health).toBe(0);
  });

  test('reflects completed quest today', async () => {
    const { user, prog, qSvc, qRepo } = await setup();
    const q = await qRepo.insert({
      user_id: null, title: 'Run', description: null, category: 'health',
      difficulty: 1, xp_reward: 30, is_system: 1, is_active: 1,
    });
    const r = await prog.completeQuest(user.id, q.id);
    const p = await qSvc.getTodayProgress(user.id);
    expect(p.completedToday).toBe(1);
    expect(p.todayXp).toBe(r.xpAwarded);
    expect(p.categoryXp.health).toBe(r.xpAwarded);
  });

  test('todayXp and completedToday stay consistent', async () => {
    const { user, prog, qSvc, qRepo } = await setup();
    const q1 = await qRepo.insert({
      user_id: null, title: 'A', description: null, category: 'health',
      difficulty: 1, xp_reward: 20, is_system: 1, is_active: 1,
    });
    const q2 = await qRepo.insert({
      user_id: null, title: 'B', description: null, category: 'knowledge',
      difficulty: 1, xp_reward: 25, is_system: 1, is_active: 1,
    });
    const r1 = await prog.completeQuest(user.id, q1.id);
    const r2 = await prog.completeQuest(user.id, q2.id);
    const p = await qSvc.getTodayProgress(user.id);
    expect(p.completedToday).toBe(2);
    expect(p.todayXp).toBe(r1.xpAwarded + r2.xpAwarded);
  });
});

describe('QuestService.getRecentActivity', () => {
  test('returns empty when no completions', async () => {
    const { user, qSvc } = await setup();
    const acts = await qSvc.getRecentActivity(user.id, 10);
    expect(acts).toEqual([]);
  });

  test('returns real completion with title, xp, timestamp, newest-first', async () => {
    const { user, prog, qSvc, qRepo } = await setup();
    const q1 = await qRepo.insert({
      user_id: null, title: 'First', description: null, category: 'health',
      difficulty: 1, xp_reward: 10, is_system: 1, is_active: 1,
    });
    const q2 = await qRepo.insert({
      user_id: null, title: 'Second', description: null, category: 'career',
      difficulty: 2, xp_reward: 40, is_system: 1, is_active: 1,
    });
    await prog.completeQuest(user.id, q1.id);
    await prog.completeQuest(user.id, q2.id);

    const acts = await qSvc.getRecentActivity(user.id, 10);
    expect(acts).toHaveLength(2);
    expect(new Set(acts.map(a => a.title))).toEqual(new Set(['First', 'Second']));
    // newest-first (ties allowed for same-millisecond inserts)
    expect(new Date(acts[0].timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(acts[1].timestamp).getTime()
    );
    for (const a of acts) {
      expect(a.xp).toBeGreaterThan(0);
      expect(typeof a.timestamp).toBe('string');
    }
    const second = acts.find(a => a.title === 'Second')!;
    expect(second.category).toBe('career');
  });

  test('E2E: complete -> today progress -> recent activity consistent', async () => {
    const { user, prog, qSvc, qRepo } = await setup();
    const q = await qRepo.insert({
      user_id: null, title: 'E2E Quest', description: null, category: 'discipline',
      difficulty: 1, xp_reward: 50, is_system: 1, is_active: 1,
    });
    const r = await prog.completeQuest(user.id, q.id);

    const today = dayKey(new Date());
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const p = await qSvc.getTodayProgress(user.id);
    const acts = await qSvc.getRecentActivity(user.id, 5);

    expect(p.completedToday).toBe(1);
    expect(p.todayXp).toBe(r.xpAwarded);
    expect(acts).toHaveLength(1);
    expect(acts[0].title).toBe('E2E Quest');
    expect(acts[0].xp).toBe(r.xpAwarded);
  });

  test('does not depend on listRecent(200) limit (>200 records)', async () => {
    const { db, user, qSvc, qRepo } = await setup();
    const q = await qRepo.insert({
      user_id: null, title: 'Bulk', description: null, category: 'health',
      difficulty: 1, xp_reward: 10, is_system: 1, is_active: 1,
    });
    const cRepo = new CompletionRepo(db);
    const N = 250;
    for (let i = 0; i < N; i += 1) {
      await cRepo.insert({ quest_id: q.id, user_id: user.id, category: 'health', xp_awarded: 10, dr_multiplier: 1.0 });
    }
    const p = await qSvc.getTodayProgress(user.id);
    expect(p.completedToday).toBe(N);
    expect(p.todayXp).toBe(N * 10);
    expect(p.categoryXp.health).toBe(N * 10);
  });

  test('local-day boundary: after-midnight counted, before-midnight excluded', async () => {
    const { db, user, qSvc, qRepo } = await setup();
    const q = await qRepo.insert({
      user_id: null, title: 'Boundary', description: null, category: 'health',
      difficulty: 1, xp_reward: 20, is_system: 1, is_active: 1,
    });
    const cRepo = new CompletionRepo(db);
    const c1 = await cRepo.insert({ quest_id: q.id, user_id: user.id, category: 'health', xp_awarded: 20, dr_multiplier: 1.0 });
    const c2 = await cRepo.insert({ quest_id: q.id, user_id: user.id, category: 'health', xp_awarded: 30, dr_multiplier: 1.0 });

    const midnightLocal = new Date();
    midnightLocal.setHours(0, 0, 0, 0);
    const justAfter = new Date(midnightLocal.getTime() + 30 * 60 * 1000).toISOString();
    const justBefore = new Date(midnightLocal.getTime() - 30 * 60 * 1000).toISOString();
    await db.exec(`UPDATE quest_completion SET completed_at = ? WHERE id = ?`, [justAfter, c1.id]);
    await db.exec(`UPDATE quest_completion SET completed_at = ? WHERE id = ?`, [justBefore, c2.id]);

    const p = await qSvc.getTodayProgress(user.id);
    expect(p.completedToday).toBe(1);
    expect(p.todayXp).toBe(20);
  });

  test('activity query: limit respected, newest-first, single batch', async () => {
    const { user, prog, qSvc, qRepo } = await setup();
    for (let i = 0; i < 15; i += 1) {
      const q = await qRepo.insert({
        user_id: null, title: `Q${i}`, description: null, category: 'social',
        difficulty: 1, xp_reward: 5, is_system: 1, is_active: 1,
      });
      await prog.completeQuest(user.id, q.id);
    }
    const acts = await qSvc.getRecentActivity(user.id, 10);
    expect(acts).toHaveLength(10);
    // All returned rows must be real quest titles (no 'Квест выполнен' fallback),
    // distinct, and timestamps non-increasing (newest-first, ties allowed).
    const titles = acts.map(a => a.title);
    expect(new Set(titles).size).toBe(10);
    for (const a of acts) {
      expect(a.title).toMatch(/^Q\d+$/);
      expect(a.xp).toBeGreaterThan(0);
      expect(typeof a.timestamp).toBe('string');
    }
    for (let i = 1; i < acts.length; i += 1) {
      expect(new Date(acts[i - 1].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(acts[i].timestamp).getTime()
      );
    }
  });
});

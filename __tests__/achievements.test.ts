import { RULES, consecutiveStreakEndingOn, distinctCategoriesOnDay, dayKey, AchievementContext } from '../src/domain/achievements';
import { CATEGORIES, Category } from '../src/domain/category';

const today = new Date('2026-08-28T15:00:00');
const todayKey = '2026-08-28';

function emptyCtx(over: Partial<AchievementContext> = {}): AchievementContext {
  return {
    at: today,
    category: 'health',
    xpAwarded: 30,
    totalXp: 0,
    totalCompletions: 0,
    perCategoryCount: { health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 },
    distinctQuestIds: new Set(),
    recentCompletions: [],
    activeDays: [],
    today: todayKey,
    lastActiveDayBeforeToday: null,
    ...over,
  };
}

function rec(daysAgo: number, hour: number, cat: Category = 'health', diff = 1): { at: Date; category: Category; questId: string; difficulty: number } {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { at: d, category: cat, questId: 'q' + Math.random(), difficulty: diff };
}

describe('achievement rules', () => {
  test('week_streak requires 7 consecutive days ending today', () => {
    // 6 days → false
    let ctx = emptyCtx({ activeDays: daysBack(6) });
    expect(ruleTest('week_streak', ctx)).toBe(false);
    // 7 days → true
    ctx = emptyCtx({ activeDays: daysBack(7) });
    expect(ruleTest('week_streak', ctx)).toBe(true);
  });

  test('month_streak requires 30 consecutive days', () => {
    expect(ruleTest('month_streak', emptyCtx({ activeDays: daysBack(29) }))).toBe(false);
    expect(ruleTest('month_streak', emptyCtx({ activeDays: daysBack(30) }))).toBe(true);
  });

  test('comeback requires ≥3 day gap before today', () => {
    expect(ruleTest('comeback', emptyCtx({ lastActiveDayBeforeToday: '2026-08-27' }))).toBe(false);
    expect(ruleTest('comeback', emptyCtx({ lastActiveDayBeforeToday: '2026-08-25' }))).toBe(true);
    expect(ruleTest('comeback', emptyCtx({ lastActiveDayBeforeToday: null }))).toBe(false);
  });

  test('all_categories_today needs 5 categories today', () => {
    const ctx = emptyCtx({
      recentCompletions: [
        rec(0, 10, 'health'),
        rec(0, 11, 'knowledge'),
        rec(0, 12, 'career'),
        rec(0, 13, 'discipline'),
        rec(0, 14, 'social'),
      ],
    });
    expect(ruleTest('all_categories_today', ctx)).toBe(true);

    const ctx2 = emptyCtx({
      recentCompletions: [rec(0, 10, 'health'), rec(0, 11, 'knowledge')],
    });
    expect(ruleTest('all_categories_today', ctx2)).toBe(false);
  });

  test('category_rainbow needs 5 distinct cats in last 7 days', () => {
    const recent: AchievementContext['recentCompletions'] = [];
    for (const c of CATEGORIES) recent.push(rec(1, 10, c));
    expect(ruleTest('category_rainbow', emptyCtx({ recentCompletions: recent }))).toBe(true);

    const recent2 = [rec(0, 10, 'health'), rec(1, 10, 'knowledge')];
    expect(ruleTest('category_rainbow', emptyCtx({ recentCompletions: recent2 }))).toBe(false);
  });

  test('variety_30/50 check distinct quest count', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 30; i += 1) ids.add(`q${i}`);
    expect(ruleTest('variety_30', emptyCtx({ distinctQuestIds: ids }))).toBe(true);
    expect(ruleTest('variety_50', emptyCtx({ distinctQuestIds: ids }))).toBe(false);

    const ids50 = new Set<string>();
    for (let i = 0; i < 50; i += 1) ids50.add(`q${i}`);
    expect(ruleTest('variety_50', emptyCtx({ distinctQuestIds: ids50 }))).toBe(true);
  });

  test('hardcore_5 needs 5 completions of difficulty ≥3', () => {
    const recent: AchievementContext['recentCompletions'] = [];
    for (let i = 0; i < 5; i += 1) recent.push(rec(0, 10, 'health', 3));
    expect(ruleTest('hardcore_5', emptyCtx({ recentCompletions: recent }))).toBe(true);

    const recent2 = [rec(0, 10, 'health', 1), rec(0, 10, 'health', 2)];
    expect(ruleTest('hardcore_5', emptyCtx({ recentCompletions: recent2 }))).toBe(false);
  });

  test('midnight_owl triggers on late bucket (00-04)', () => {
    const d = new Date('2026-08-28T02:00:00');
    expect(ruleTest('midnight_owl', emptyCtx({ at: d }))).toBe(true);
    expect(ruleTest('midnight_owl', emptyCtx({ at: new Date('2026-08-28T15:00:00') }))).toBe(false);
  });

  test('early_bird triggers on early bucket (05-08)', () => {
    expect(ruleTest('early_bird', emptyCtx({ at: new Date('2026-08-28T06:00:00') }))).toBe(true);
    expect(ruleTest('early_bird', emptyCtx({ at: new Date('2026-08-28T15:00:00') }))).toBe(false);
  });

  test('evening_zen triggers on night bucket (22-23)', () => {
    expect(ruleTest('evening_zen', emptyCtx({ at: new Date('2026-08-28T23:00:00') }))).toBe(true);
    expect(ruleTest('evening_zen', emptyCtx({ at: new Date('2026-08-28T15:00:00') }))).toBe(false);
  });

  test('first achievements require a completion', () => {
    expect(ruleTest('first_step', emptyCtx())).toBe(false);
    expect(ruleTest('first_quest', emptyCtx())).toBe(false);
    expect(ruleTest('first_step', emptyCtx({ totalCompletions: 1 }))).toBe(true);
    expect(ruleTest('first_quest', emptyCtx({
      distinctQuestIds: new Set(['q-first']),
    }))).toBe(true);
  });

  test('weekend_warrior needs 10 quests in the current weekend', () => {
    const sat = new Date('2026-08-29T15:00:00');
    const weekend: AchievementContext['recentCompletions'] = [];
    for (let i = 0; i < 9; i += 1) {
      weekend.push({ at: sat, category: 'health', questId: `q-${i}`, difficulty: 1 });
    }
    expect(ruleTest('weekend_warrior', emptyCtx({ at: sat, recentCompletions: weekend }))).toBe(false);
    weekend.push({ at: sat, category: 'health', questId: 'q-10', difficulty: 1 });
    expect(ruleTest('weekend_warrior', emptyCtx({ at: sat, recentCompletions: weekend }))).toBe(true);

    const sunday = new Date('2026-08-30T15:00:00');
    expect(ruleTest('weekend_warrior', emptyCtx({
      at: sunday,
      currentWeekendCompletionCount: 10,
      recentCompletions: [],
    }))).toBe(true);

    const friday = new Date('2026-08-28T15:00:00');
    expect(ruleTest('weekend_warrior', emptyCtx({
      at: friday,
      currentWeekendCompletionCount: 10,
      recentCompletions: [],
    }))).toBe(false);
  });

  test('health_balance needs 7 consecutive health days', () => {
    const recent: AchievementContext['recentCompletions'] = [];
    for (let i = 0; i < 7; i += 1) recent.push(rec(i, 10, 'health'));
    expect(ruleTest('health_balance', emptyCtx({ recentCompletions: recent }))).toBe(true);

    // Missing one day
    const recent2 = recent.filter((_, i) => i !== 3);
    expect(ruleTest('health_balance', emptyCtx({ recentCompletions: recent2 }))).toBe(false);
  });

  test('personal record achievements require new-record flags', () => {
    expect(ruleTest('personal_record_day', emptyCtx({ xpAwarded: 99999 }))).toBe(false);
    expect(ruleTest('category_personal_best', emptyCtx({ xpAwarded: 99999 }))).toBe(false);
    expect(ruleTest('personal_record_day', emptyCtx({ isNewPersonalBestDay: true }))).toBe(true);
    expect(ruleTest('category_personal_best', emptyCtx({ isNewCategoryPersonalBest: true }))).toBe(true);
  });
});

describe('consecutiveStreakEndingOn', () => {
  test('0 days', () => {
    expect(consecutiveStreakEndingOn(emptyCtx(), '2026-08-28')).toBe(0);
  });
  test('3 days', () => {
    expect(consecutiveStreakEndingOn(emptyCtx({ activeDays: daysBack(3) }), '2026-08-28')).toBe(3);
  });
  test('gap breaks streak', () => {
    // Active on 28, 27, 25 — only 2-day streak
    expect(consecutiveStreakEndingOn(
      emptyCtx({ activeDays: ['2026-08-25', '2026-08-27', '2026-08-28'] }),
      '2026-08-28',
    )).toBe(2);
  });
});

describe('distinctCategoriesOnDay', () => {
  test('counts unique categories for given day', () => {
    const ctx = emptyCtx({
      recentCompletions: [
        rec(0, 9, 'health'),
        rec(0, 10, 'health'),     // dup
        rec(0, 11, 'career'),
        rec(1, 10, 'social'),     // other day
      ],
    });
    expect(distinctCategoriesOnDay(ctx, '2026-08-28').size).toBe(2);
  });
});

function ruleTest(code: string, ctx: AchievementContext): boolean {
  const r = RULES.find((x) => x.code === code);
  if (!r) throw new Error(`Unknown code: ${code}`);
  return r.test(ctx);
}

function daysBack(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

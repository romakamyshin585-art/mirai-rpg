import { timeBucket, isWeekend, dayKey, daysBetween, type TimeBucket } from './time';
import type { Category } from './category';

export interface AchievementContext {
  at: Date;
  category: Category;
  xpAwarded: number;
  totalXp: number;
  totalCompletions?: number;
  perCategoryCount: Record<Category, number>;
  distinctQuestIds: ReadonlySet<string>;
  recentCompletions: Array<{ at: Date; category: Category; questId: string; difficulty: number }>;
  activeDays: ReadonlyArray<string>;
  today: string;
  lastActiveDayBeforeToday: string | null;
  currentWeekendCompletionCount?: number;
  isNewPersonalBestDay?: boolean;
  isNewCategoryPersonalBest?: boolean;
  isNewDayRecord?: boolean;
  isNewCategoryRecord?: boolean;
  newPersonalBestDay?: boolean;
  newCategoryPersonalBest?: boolean;
  personalBestDayIsNew?: boolean;
  personalBestCategoryIsNew?: boolean;
  personalBest?: {
    day?: boolean;
    category?: boolean;
  };
}

function distinctCategoriesOnDay(ctx: AchievementContext, day: string): Set<Category> {
  const out = new Set<Category>();
  for (const r of ctx.recentCompletions) {
    if (dayKey(r.at) === day) out.add(r.category);
  }
  return out;
}

function distinctCategoriesInLastNDays(ctx: AchievementContext, n: number): Set<Category> {
  const out = new Set<Category>();
  for (const r of ctx.recentCompletions) {
    const diff = daysBetween(dayKey(r.at), ctx.today);
    if (diff >= 0 && diff < n) out.add(r.category);
  }
  return out;
}

function completedOnDay(ctx: AchievementContext, day: string): boolean {
  return ctx.activeDays.includes(day);
}

function consecutiveStreakEndingOn(ctx: AchievementContext, endDay: string): number {
  let count = 0;
  let cursor = endDay;
  const days = new Set(ctx.activeDays);
  while (days.has(cursor)) {
    count += 1;
    const t = new Date(`${cursor}T00:00:00`);
    t.setDate(t.getDate() - 1);
    cursor = dayKey(t);
  }
  return count;
}

export function weekendDayKeys(at: Date): string[] {
  const day = at.getDay();
  if (day !== 0 && day !== 6) return [];
  const saturday = new Date(at);
  if (day === 0) saturday.setDate(saturday.getDate() - 1);
  const sunday = new Date(saturday);
  sunday.setDate(sunday.getDate() + 1);
  return [dayKey(saturday), dayKey(sunday)];
}

function totalCompletions(ctx: AchievementContext): number {
  return ctx.totalCompletions ?? ctx.recentCompletions.length;
}

function distinctQuestCount(ctx: AchievementContext): number {
  if (ctx.distinctQuestIds.size > 0) return ctx.distinctQuestIds.size;
  const fromRecent = new Set(ctx.recentCompletions.map((r) => r.questId)).size;
  return Math.max(fromRecent, hasCompletion(ctx) ? 1 : 0);
}

function hasCompletion(ctx: AchievementContext): boolean {
  return totalCompletions(ctx) >= 1 || ctx.totalXp > 0;
}

function weekendCompletionCount(ctx: AchievementContext): number {
  if (ctx.currentWeekendCompletionCount !== undefined) return ctx.currentWeekendCompletionCount;
  const keys = new Set(weekendDayKeys(ctx.at));
  return ctx.recentCompletions.filter((r) => keys.has(dayKey(r.at))).length;
}

function hasNewDayRecord(ctx: AchievementContext): boolean {
  return ctx.isNewPersonalBestDay === true ||
    ctx.isNewDayRecord === true ||
    ctx.newPersonalBestDay === true ||
    ctx.personalBestDayIsNew === true ||
    ctx.personalBest?.day === true;
}

function hasNewCategoryRecord(ctx: AchievementContext): boolean {
  return ctx.isNewCategoryPersonalBest === true ||
    ctx.isNewCategoryRecord === true ||
    ctx.newCategoryPersonalBest === true ||
    ctx.personalBestCategoryIsNew === true ||
    ctx.personalBest?.category === true;
}

export interface AchievementRule {
  code: string;
  test: (ctx: AchievementContext) => boolean;
}

function completedOnDayCount(ctx: AchievementContext, day: string): number {
  return ctx.recentCompletions.filter((entry) => dayKey(entry.at) === day).length;
}

function bucketCount(ctx: AchievementContext, bucket: TimeBucket): number {
  return ctx.recentCompletions.filter((entry) => timeBucket(entry.at) === bucket).length;
}

function hardCount(ctx: AchievementContext): number {
  return ctx.recentCompletions.filter((entry) => entry.difficulty >= 3).length;
}

/**
 * Rule order is priority order.
 *
 * `checkAfterCompletion` grants at most one achievement per event, taking
 * the first rule that passes *and is still locked*. So the ordering has to
 * read rarest-last within a family, otherwise an achievement that is
 * permanently true from the start would win every event and a later,
 * genuinely-earned one would become unreachable.
 *
 * Two consequences worth stating:
 *  - `first_step` and `first_quest` used to both fire on the very first
 *    completion, which made one of them permanently unreachable.
 *    `first_quest` is now the third *distinct* quest, so quest 1 grants
 *    `first_step` and quest 3 grants `first_quest`;
 *  - the two personal-best rules are last. They fire often by design - any
 *    new day record is a reward - and if they sat in the middle they would
 *    shadow every milestone after them.
 */
export const RULES: readonly AchievementRule[] = [
  {
    code: 'first_step',
    test: (ctx) => hasCompletion(ctx),
  },
  {
    code: 'first_quest',
    test: (ctx) => distinctQuestCount(ctx) >= 3,
  },
  {
    code: 'comeback',
    test: (ctx) =>
      ctx.lastActiveDayBeforeToday !== null &&
      daysBetween(ctx.lastActiveDayBeforeToday, ctx.today) >= 3,
  },
  {
    code: 'early_bird',
    test: (ctx) => timeBucket(ctx.at) === 'early',
  },
  {
    code: 'midnight_owl',
    test: (ctx) => timeBucket(ctx.at) === 'late',
  },
  {
    code: 'evening_zen',
    test: (ctx) => timeBucket(ctx.at) === 'night',
  },
  {
    code: 'weekend_warrior',
    test: (ctx) => isWeekend(ctx.at) && weekendCompletionCount(ctx) >= 10,
  },
  {
    code: 'week_streak',
    test: (ctx) => consecutiveStreakEndingOn(ctx, ctx.today) >= 7,
  },
  {
    code: 'month_streak',
    test: (ctx) => consecutiveStreakEndingOn(ctx, ctx.today) >= 30,
  },
  {
    code: 'category_rainbow',
    test: (ctx) => distinctCategoriesInLastNDays(ctx, 7).size >= 5,
  },
  {
    code: 'all_categories_today',
    test: (ctx) => distinctCategoriesOnDay(ctx, ctx.today).size >= 5,
  },
  {
    code: 'health_balance',
    test: (ctx) => {
      const days = new Set<string>();
      for (const r of ctx.recentCompletions) {
        if (r.category === 'health') days.add(dayKey(r.at));
      }
      for (let i = 0; i < 7; i += 1) {
        const t = new Date(ctx.at);
        t.setDate(t.getDate() - i);
        if (!days.has(dayKey(t))) return false;
      }
      return true;
    },
  },
  {
    code: 'variety_30',
    test: (ctx) => distinctQuestCount(ctx) >= 30,
  },
  {
    code: 'variety_50',
    test: (ctx) => distinctQuestCount(ctx) >= 50,
  },
  {
    code: 'hardcore_5',
    test: (ctx) => hardCount(ctx) >= 5,
  },

  // --- second wave -------------------------------------------------------
  // Volume and per-axis milestones. Ordered so that the first one a given
  // profile can reach always sits ahead of the next.
  {
    code: 'triple_day',
    test: (ctx) => completedOnDayCount(ctx, ctx.today) >= 3,
  },
  {
    code: 'career_10',
    test: (ctx) => (ctx.perCategoryCount.career ?? 0) >= 10,
  },
  {
    code: 'knowledge_10',
    test: (ctx) => (ctx.perCategoryCount.knowledge ?? 0) >= 10,
  },
  {
    code: 'discipline_10',
    test: (ctx) => (ctx.perCategoryCount.discipline ?? 0) >= 10,
  },
  {
    code: 'social_10',
    test: (ctx) => (ctx.perCategoryCount.social ?? 0) >= 10,
  },
  {
    code: 'xp_500',
    test: (ctx) => ctx.totalXp >= 500,
  },
  {
    code: 'five_day',
    test: (ctx) => completedOnDayCount(ctx, ctx.today) >= 5,
  },
  {
    code: 'ten_active_days',
    test: (ctx) => ctx.activeDays.length >= 10,
  },
  {
    code: 'health_25',
    test: (ctx) => (ctx.perCategoryCount.health ?? 0) >= 25,
  },
  {
    code: 'early_bird_5',
    test: (ctx) => bucketCount(ctx, 'early') >= 5,
  },
  {
    code: 'hardcore_20',
    test: (ctx) => hardCount(ctx) >= 20,
  },
  {
    code: 'twenty_active_days',
    test: (ctx) => ctx.activeDays.length >= 20,
  },
  {
    code: 'xp_2000',
    test: (ctx) => ctx.totalXp >= 2000,
  },
  {
    code: 'variety_100',
    test: (ctx) => distinctQuestCount(ctx) >= 100,
  },
  {
    code: 'variety_150',
    test: (ctx) => distinctQuestCount(ctx) >= 150,
  },
  {
    code: 'xp_5000',
    test: (ctx) => ctx.totalXp >= 5000,
  },

  // --- recurring rewards, last so they never shadow a milestone -----------
  {
    code: 'personal_record_day',
    test: hasNewDayRecord,
  },
  {
    code: 'category_personal_best',
    test: hasNewCategoryRecord,
  },
];

export { consecutiveStreakEndingOn, distinctCategoriesOnDay, distinctCategoriesInLastNDays, completedOnDay };
// The time helpers are deliberately NOT re-exported from here. `domain/index`
// does `export * from './time'` and `export * from './achievements'`, and a
// name reachable through two star exports is ambiguous: ES modules then
// exclude it from the barrel entirely, so `import { dayKey } from './domain'`
// would be `undefined` at runtime while TypeScript stayed silent. Callers
// import from './time' directly.

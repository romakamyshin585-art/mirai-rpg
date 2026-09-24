import { timeBucket, isWeekend, dayKey, daysBetween } from './time';
import type { TimeBucket } from './time';
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

export const RULES: readonly AchievementRule[] = [
  {
    code: 'first_step',
    test: (ctx) => hasCompletion(ctx),
  },
  {
    code: 'first_quest',
    test: (ctx) => distinctQuestCount(ctx) >= 1,
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
    test: (ctx) => ctx.recentCompletions.filter((r) => r.difficulty >= 3).length >= 5,
  },
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
export { timeBucket, isWeekend, dayKey, daysBetween };
export type { TimeBucket };

/**
 * Achievement engine — pure functions over user activity.
 *
 * Given the recent context of a quest completion (timestamp, day-key,
 * bucket, total counts, streak length, …), returns the list of
 * achievement codes that should be newly unlocked.
 *
 * Idempotency is the caller's job (insert into achievement_unlock with
 * UNIQUE constraint catches re-fires).
 *
 * Codes are stable identifiers; names live in seed data.
 */

import { timeBucket, isWeekend, dayKey, daysBetween } from './time';
import type { TimeBucket } from './time';
import type { Category } from './category';

/* ---------- context (what the engine needs to make a decision) ---------- */

export interface AchievementContext {
  /** When the completion happened (local). */
  at: Date;
  /** Category of the quest that was just completed. */
  category: Category;
  /** Total XP awarded in this completion (after DR). */
  xpAwarded: number;
  /** Total XP the user has accumulated overall (after this completion). */
  totalXp: number;
  /** Per-category completion counts (after this completion). */
  perCategoryCount: Record<Category, number>;
  /** Distinct quest ids completed (all-time, after this completion). */
  distinctQuestIds: ReadonlySet<string>;
  /** Distinct quest ids completed in the last 24h, with their timestamps. */
  recentCompletions: Array<{ at: Date; category: Category; questId: string; difficulty: number }>;
  /** Sorted list of day-keys the user has completed at least 1 quest (unique). */
  activeDays: ReadonlyArray<string>;
  /** "Today" day-key (for category_today and rainbow_today checks). */
  today: string;
  /** Last day-key the user completed a quest BEFORE today (or null if no break tracked). */
  lastActiveDayBeforeToday: string | null;
}

/* ---------- helpers (used by the rules) ---------------------------------- */

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
  // Count backward from endDay as long as the previous day was active.
  let count = 0;
  let cursor = endDay;
  const days = new Set(ctx.activeDays);
  while (days.has(cursor)) {
    count += 1;
    // step one day back
    const t = new Date(`${cursor}T00:00:00`);
    t.setDate(t.getDate() - 1);
    cursor = dayKey(t);
  }
  return count;
}

/* ---------- rules -------------------------------------------------------- */

export interface AchievementRule {
  code: string;
  /** Returns true if the achievement should be unlocked right now. */
  test: (ctx: AchievementContext) => boolean;
}

/**
 * 15 achievements, single user, "competition with self + surprise".
 * Pure, declarative, easy to test.
 */
export const RULES: readonly AchievementRule[] = [
  // -- streaks & regularity -----------------------------------------------
  {
    code: 'week_streak',
    test: (ctx) => consecutiveStreakEndingOn(ctx, ctx.today) >= 7,
  },
  {
    code: 'month_streak',
    test: (ctx) => consecutiveStreakEndingOn(ctx, ctx.today) >= 30,
  },
  {
    code: 'comeback',
    test: (ctx) =>
      ctx.lastActiveDayBeforeToday !== null &&
      daysBetween(ctx.lastActiveDayBeforeToday, ctx.today) >= 3,
  },

  // -- category balance ----------------------------------------------------
  {
    code: 'all_categories_today',
    test: (ctx) => distinctCategoriesOnDay(ctx, ctx.today).size === 5,
  },
  {
    code: 'health_balance',
    test: (ctx) => {
      // 7 days in a row where 'health' was completed at least once each day.
      const days = new Set<string>();
      for (const r of ctx.recentCompletions) {
        if (r.category === 'health') days.add(dayKey(r.at));
      }
      // check the last 7 calendar days ending today
      for (let i = 0; i < 7; i += 1) {
        const t = new Date(ctx.at);
        t.setDate(t.getDate() - i);
        if (!days.has(dayKey(t))) return false;
      }
      return true;
    },
  },
  {
    code: 'category_rainbow',
    test: (ctx) => distinctCategoriesInLastNDays(ctx, 7).size === 5,
  },

  // -- variety & difficulty ------------------------------------------------
  {
    code: 'variety_30',
    test: (ctx) => ctx.distinctQuestIds.size >= 30,
  },
  {
    code: 'variety_50',
    test: (ctx) => ctx.distinctQuestIds.size >= 50,
  },
  {
    code: 'hardcore_5',
    test: (ctx) => ctx.recentCompletions.filter((r) => r.difficulty >= 3).length >= 5,
  },

  // -- time-of-day surprises ----------------------------------------------
  {
    code: 'midnight_owl',
    test: (ctx) => timeBucket(ctx.at) === 'late',
  },
  {
    code: 'early_bird',
    test: (ctx) => timeBucket(ctx.at) === 'early',
  },
  {
    code: 'weekend_warrior',
    test: (ctx) => isWeekend(ctx.at) && ctx.recentCompletions.some((r) => sameDay(r.at, ctx.at)),
  },
  {
    code: 'evening_zen',
    test: (ctx) => timeBucket(ctx.at) === 'night',
  },

  // -- personal records (caller handles update + 'no longer fires') --------
  {
    code: 'personal_record_day',
    test: (_ctx) => false, // not a one-shot unlock; caller maintains personal_best table
  },
  {
    code: 'category_personal_best',
    test: (_ctx) => false, // same as above — caller-managed
  },
];

/* ---------- exports used by the engine ---------------------------------- */

export { consecutiveStreakEndingOn, distinctCategoriesOnDay, distinctCategoriesInLastNDays, completedOnDay };
export { timeBucket, isWeekend, dayKey, daysBetween };
export type { TimeBucket };

function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/**
 * Weekly report — a private, local-only recap of the last 7 days.
 *
 * Modelled on Apple's own weekly summaries (Screen Time, Fitness): one
 * coherent card, not a row of competing widgets, and a neutral state
 * instead of an error when the week is empty. All data comes from the
 * local completion history, so there is no backend and nothing is shared.
 *
 * Pure module: takes plain rows, returns a report object.
 */

import { CATEGORIES, type Category } from './category';

export type WeeklyCompletion = {
  completedAt: string;
  category: Category;
  xp: number;
};

export type WeeklyUnlock = {
  code: string;
  name: string;
  unlockedAt: string;
};

export type WeeklyAxisDelta = {
  category: Category;
  /** XP accumulated on that axis during the week. */
  gained: number;
  /** XP on that axis before the week started. */
  before: number;
  /** XP on that axis now. */
  total: number;
  weeklyChange: number;
  share: number;
};

export type WeeklyReport = {
  fromIso: string;
  toIso: string;
  completions: number;
  totalXp: number;
  activeDays: number;
  longestStreak: number;
  perDay: Array<{ dayKey: string; xp: number; completions: number }>;
  axes: WeeklyAxisDelta[];
  /** Most improved axis this week. */
  topAxis: Category | null;
  /** Most neglected axis this week. */
  weakestAxis: Category | null;
  achievement: { code: string; name: string } | null;
  /** Optional forward-looking nudge, supplied by the recommendation engine. */
  nextWeekHint: string | null;
  /** True when there is nothing to report; the UI shows a neutral state. */
  isEmpty: boolean;
};

export type WeeklyReportInput = {
  completions: WeeklyCompletion[];
  unlocks?: WeeklyUnlock[];
  /** Current per-axis XP totals (stat.xp_total_in_category). */
  axisTotals: Record<Category, number>;
  /** Optional recommendation text for next week. */
  nextWeekHint?: string | null;
};

function dayKeyOf(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Inclusive start of the 7-day window, counting back from `now`. */
export function weekWindow(now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  return { from, to };
}

/** Longest run of consecutive active days inside the window. */
export function longestStreak(dayKeys: string[]): number {
  if (dayKeys.length === 0) return 0;
  const sorted = [...new Set(dayKeys)].sort();
  let best = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(`${sorted[index - 1]}T00:00:00`);
    const current = new Date(`${sorted[index]}T00:00:00`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    run = diffDays === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export function buildWeeklyReport(input: WeeklyReportInput, now: Date = new Date()): WeeklyReport {
  const { from, to } = weekWindow(now);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const inWindow = input.completions.filter(row => {
    const at = new Date(row.completedAt).getTime();
    return Number.isFinite(at) && at >= from.getTime() && at <= to.getTime();
  });

  const perDayMap = new Map<string, { xp: number; completions: number }>();
  const gainedByAxis = {} as Record<Category, number>;
  CATEGORIES.forEach(category => {
    gainedByAxis[category] = 0;
  });

  for (const row of inWindow) {
    const key = dayKeyOf(row.completedAt);
    if (!key) continue;
    const bucket = perDayMap.get(key) ?? { xp: 0, completions: 0 };
    bucket.xp += Math.max(0, Number(row.xp) || 0);
    bucket.completions += 1;
    perDayMap.set(key, bucket);
    if (row.category in gainedByAxis) {
      gainedByAxis[row.category] += Math.max(0, Number(row.xp) || 0);
    }
  }

  const totalXp = [...perDayMap.values()].reduce((total, day) => total + day.xp, 0);
  const axes: WeeklyAxisDelta[] = CATEGORIES.map(category => {
    const total = Math.max(0, Number(input.axisTotals[category]) || 0);
    const gained = gainedByAxis[category];
    return {
      category,
      gained,
      before: Math.max(0, total - gained),
      total,
      weeklyChange: total > 0 ? gained / total : 0,
      share: totalXp > 0 ? gained / totalXp : 0,
    };
  });

  const ranked = [...axes].sort((a, b) => b.gained - a.gained);
  const topAxis = totalXp > 0 && ranked[0].gained > 0 ? ranked[0].category : null;
  // "Most neglected" is measured on the standing total, not on this
  // week's gain: with four axes at zero gain every ranking-by-gain is a
  // four-way tie and carries no information.
  const weakestAxis = totalXp > 0
    ? axes.reduce((lowest, axis) => (axis.total < lowest.total ? axis : lowest)).category
    : null;

  const achievement =
    input.unlocks?.find(row => {
      const at = new Date(row.unlockedAt).getTime();
      return Number.isFinite(at) && at >= from.getTime() && at <= to.getTime();
    }) ?? null;

  const perDay = [...perDayMap.entries()]
    .map(([dayKey, value]) => ({ dayKey, xp: value.xp, completions: value.completions }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  return {
    fromIso,
    toIso,
    completions: inWindow.length,
    totalXp,
    activeDays: perDayMap.size,
    longestStreak: longestStreak(perDay.map(day => day.dayKey)),
    perDay,
    axes,
    topAxis,
    weakestAxis,
    achievement: achievement ? { code: achievement.code, name: achievement.name } : null,
    nextWeekHint: input.nextWeekHint ?? null,
    isEmpty: inWindow.length === 0,
  };
}

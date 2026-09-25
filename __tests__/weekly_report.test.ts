/**
 * Weekly report tests.
 *
 * The acceptance criterion that matters most: an empty week must produce
 * a neutral report, never an error and never a division by zero.
 */
import {
  buildWeeklyReport,
  longestStreak,
  weekWindow,
  type WeeklyCompletion,
} from '../src/domain/weekly_report';
import type { AxisStats } from '../src/domain/recommendations';

const NOW = new Date('2026-09-25T12:00:00');
const axisTotals: AxisStats = { health: 300, knowledge: 250, career: 200, discipline: 150, social: 100 };

function at(daysAgo: number, hour = 12): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function completion(daysAgo: number, category: WeeklyCompletion['category'], xp: number): WeeklyCompletion {
  return { completedAt: at(daysAgo), category, xp };
}

describe('weekWindow', () => {
  test('spans seven days ending today', () => {
    const { from, to } = weekWindow(NOW);
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    expect(days).toBeCloseTo(7, 1);
    expect(to.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });
});

describe('longestStreak', () => {
  test('counts consecutive days', () => {
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-03'])).toBe(3);
  });

  test('breaks on a gap', () => {
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-05', '2026-09-06'])).toBe(2);
  });

  test('ignores duplicate days and empty input', () => {
    expect(longestStreak(['2026-09-01', '2026-09-01'])).toBe(1);
    expect(longestStreak([])).toBe(0);
  });
});

describe('buildWeeklyReport', () => {
  test('an empty week is neutral, not an error', () => {
    const report = buildWeeklyReport({ completions: [], axisTotals }, NOW);
    expect(report.isEmpty).toBe(true);
    expect(report.completions).toBe(0);
    expect(report.totalXp).toBe(0);
    expect(report.activeDays).toBe(0);
    expect(report.longestStreak).toBe(0);
    expect(report.topAxis).toBeNull();
    expect(report.weakestAxis).toBeNull();
    expect(report.achievement).toBeNull();
    expect(report.perDay).toEqual([]);
    // Axis deltas are still reported, all with zero gain.
    expect(report.axes).toHaveLength(5);
    report.axes.forEach(axis => {
      expect(axis.gained).toBe(0);
      expect(axis.weeklyChange).toBe(0);
      expect(Number.isFinite(axis.share)).toBe(true);
      expect(axis.before).toBe(axis.total);
    });
  });

  test('totals, per-day breakdown and streak come from the window only', () => {
    const report = buildWeeklyReport(
      {
        completions: [
          completion(0, 'career', 25),
          completion(0, 'health', 15),
          completion(1, 'knowledge', 20),
          completion(2, 'discipline', 30),
          // Outside the window: must be ignored.
          completion(30, 'health', 999),
        ],
        axisTotals,
      },
      NOW,
    );

    expect(report.isEmpty).toBe(false);
    expect(report.completions).toBe(4);
    expect(report.totalXp).toBe(90);
    expect(report.activeDays).toBe(3);
    expect(report.longestStreak).toBe(3);
    expect(report.perDay.map(day => day.completions)).toEqual([1, 1, 2]);
  });

  test('reports per-axis change as before -> total', () => {
    const report = buildWeeklyReport(
      {
        completions: [completion(0, 'career', 25), completion(1, 'career', 25)],
        axisTotals,
      },
      NOW,
    );
    const career = report.axes.find(axis => axis.category === 'career');
    expect(career?.gained).toBe(50);
    expect(career?.total).toBe(200);
    expect(career?.before).toBe(150);
    expect(career?.weeklyChange).toBeCloseTo(0.25, 6);
  });

  test('names the most improved and the most neglected axis', () => {
    const report = buildWeeklyReport(
      {
        completions: [completion(0, 'social', 40), completion(1, 'social', 30)],
        axisTotals,
      },
      NOW,
    );
    expect(report.topAxis).toBe('social');
    // Neglect is read off the standing totals: social is the lowest axis.
    expect(report.weakestAxis).toBe('social');
  });

  test('neglect is not decided by this week\'s gains', () => {
    const report = buildWeeklyReport(
      {
        completions: [completion(0, 'health', 40)],
        axisTotals,
      },
      NOW,
    );
    // Career/discipline/social all gained nothing, so ranking by gain
    // would be a three-way tie; the weakest standing axis is social.
    expect(report.topAxis).toBe('health');
    expect(report.weakestAxis).toBe('social');
  });

  test('an axis with no total XP does not produce NaN', () => {
    const report = buildWeeklyReport(
      {
        completions: [completion(0, 'social', 10)],
        axisTotals: { health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 },
      },
      NOW,
    );
    report.axes.forEach(axis => {
      expect(Number.isFinite(axis.weeklyChange)).toBe(true);
      expect(Number.isFinite(axis.share)).toBe(true);
    });
  });

  test('picks an achievement unlocked inside the window as the highlight', () => {
    const report = buildWeeklyReport(
      {
        completions: [completion(0, 'health', 15)],
        axisTotals,
        unlocks: [
          { code: 'old', name: 'Старое', unlockedAt: at(20) },
          { code: 'week_one', name: 'Первый шаг недели', unlockedAt: at(1) },
        ],
      },
      NOW,
    );
    expect(report.achievement).toEqual({ code: 'week_one', name: 'Первый шаг недели' });
  });

  test('carries a recommendation hint through unchanged', () => {
    const report = buildWeeklyReport(
      { completions: [completion(0, 'health', 15)], axisTotals, nextWeekHint: 'Подтяни дисциплину' },
      NOW,
    );
    expect(report.nextWeekHint).toBe('Подтяни дисциплину');
  });

  test('survives malformed rows instead of throwing', () => {
    const report = buildWeeklyReport(
      {
        completions: [
          { completedAt: 'not-a-date', category: 'health', xp: 10 },
          { completedAt: at(0), category: 'health', xp: Number.NaN },
        ],
        axisTotals,
      },
      NOW,
    );
    expect(Number.isFinite(report.totalXp)).toBe(true);
    expect(report.totalXp).toBe(0);
  });
});

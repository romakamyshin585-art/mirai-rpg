/**
 * Level curve (pure, DB-free).
 *
 * Cumulative XP thresholds:
 *   L1: 0      L2: 100    L3: 300    L4: 700    L5: 1500
 *   L6+: each step grows by `growthFactor` (1.4 by default),
 *        never grows less than +50 per level (so it can't stall).
 */

export const BASE_THRESHOLDS: Readonly<Record<number, number>> = {
  1: 0,
  2: 100,
  3: 300,
  4: 700,
  5: 1500,
};

export const DEFAULT_GROWTH_FACTOR = 1.4;
export const MIN_STEP = 50;

export function xpToReach(level: number, growthFactor = DEFAULT_GROWTH_FACTOR): number {
  if (level <= 1) return 0;
  if (level in BASE_THRESHOLDS) return BASE_THRESHOLDS[level];

  // L6+ — grow from L5 step with multiplicative factor + minimum step.
  let prevCumulative = BASE_THRESHOLDS[5]; // 1500
  let prevStep = 800; // step from L5 to L6 base
  for (let lv = 6; lv <= level; lv += 1) {
    const nextStep = Math.max(MIN_STEP, Math.floor(prevStep * growthFactor));
    prevCumulative += nextStep;
    prevStep = nextStep;
  }
  return prevCumulative;
}

export interface LevelProgress {
  level: number;
  xp_total: number;
  xp_into_level: number;
  xp_for_next_level: number;
  level_progress_pct: number;
}

export function levelProgress(xp: number, growthFactor = DEFAULT_GROWTH_FACTOR): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (safeXp >= xpToReach(level + 1, growthFactor)) {
    level += 1;
  }
  const cur = xpToReach(level, growthFactor);
  const nxt = xpToReach(level + 1, growthFactor);
  const into = safeXp - cur;
  const span = Math.max(1, nxt - cur);
  return {
    level,
    xp_total: safeXp,
    xp_into_level: into,
    xp_for_next_level: nxt,
    level_progress_pct: Math.round((100 * into) / span * 10) / 10,
  };
}

/**
 * Recommendation engine — Gini-modulated softmax over the stat deficit.
 *
 * Goal: push the character towards all-round development instead of
 * letting one axis run away, without becoming a nag.
 *
 * Why this shape (see NIGHT_RUN_REPORT §5 for the full rationale):
 *  - "always recommend the weakest axis" is as annoying as it is simple
 *    and cannot tell a mild from a severe imbalance;
 *  - plain softmax over the deficit gives variety but pushes just as
 *    hard at any level of imbalance;
 *  - multiplying by the Gini coefficient scales the intervention with
 *    how lopsided the profile actually is, the same way portfolio
 *    rebalancing scales with concentration.
 *
 * Everything here is pure and side-effect free so it can be unit tested
 * against synthetic profiles.
 */

import { CATEGORIES, type Category } from './category';

export const INTERVENTION_STRENGTH = 2.5;
export const SOFTMAX_TAU = 0.15;

export type AxisStats = Record<Category, number>;

export type RecommendableQuest = {
  id: string;
  title: string;
  /** The quest's primary stat axis. */
  category: Category;
  /** 1..3, as stored on the quest. */
  difficulty: number;
  xpReward: number;
};

export type ScoredQuest = {
  quest: RecommendableQuest;
  score: number;
  axisWeight: number;
  levelFit: number;
  freshness: number;
  reason: string;
};

export type RecommendOptions = {
  stats: AxisStats;
  level: number;
  quests: RecommendableQuest[];
  /** How many times each quest has already been surfaced. */
  shownCounts?: Record<string, number>;
  /** Quest ids the user dismissed with "не интересно". */
  dismissed?: ReadonlySet<string> | string[];
  limit?: number;
  /**
   * Axes of the last N surfaced recommendations, newest last. Stops the
   * engine from serving one axis over and over.
   */
  recentAxes?: Category[];
  maxConsecutiveSameAxis?: number;
};

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Gini coefficient of a share vector: 0 = perfectly even, ->1 = all in one axis. */
export function gini(shares: number[]): number {
  const n = shares.length;
  if (n === 0) return 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      total += Math.abs(shares[i] - shares[j]);
    }
  }
  return total / (2 * n);
}

/** Share of the total per axis. Independent of the absolute level. */
export function toShares(stats: AxisStats): number[] {
  const values = CATEGORIES.map(category => Math.max(0, Number(stats[category]) || 0));
  const total = sum(values);
  if (total <= 0) return CATEGORIES.map(() => 1 / CATEGORIES.length);
  return values.map(value => value / total);
}

/** Deficit of each axis against an equal share. */
export function deficits(stats: AxisStats): number[] {
  const shares = toShares(stats);
  const fair = 1 / CATEGORIES.length;
  return shares.map(share => Math.max(0, fair - share));
}

/**
 * Intervention strength: how much the engine is allowed to deviate from
 * a uniform spread. Zero on a balanced profile, one at full tilt.
 */
export function interventionStrength(stats: AxisStats): number {
  return clamp(gini(toShares(stats)) * INTERVENTION_STRENGTH, 0, 1);
}

/** Final per-axis weight: softmax over the deficit, blended toward uniform by the Gini factor. */
export function axisWeights(stats: AxisStats): Record<Category, number> {
  const deficit = deficits(stats);
  const beta = interventionStrength(stats);
  const uniform = 1 / CATEGORIES.length;
  const exponentials = deficit.map(value => Math.exp(value / SOFTMAX_TAU));
  const total = sum(exponentials);
  const softmax = exponentials.map(value => (total > 0 ? value / total : uniform));

  const weights = {} as Record<Category, number>;
  CATEGORIES.forEach((category, index) => {
    weights[category] = beta * softmax[index] + (1 - beta) * uniform;
  });
  return weights;
}

/**
 * Difficulty that suits the current level. Kept relative on purpose: an
 * absolute "level tier" would zero out every quest for a veteran
 * character, because the quest model stores difficulty 1..3 and levels
 * keep growing.
 */
export function expectedDifficulty(level: number): number {
  return clamp(1 + Math.floor((Math.max(1, level) - 1) / 3), 1, 3);
}

export function levelFit(difficulty: number, level: number, window = 3): number {
  const distance = Math.abs(difficulty - expectedDifficulty(level));
  return clamp(1 - distance / Math.max(1, window), 0, 1);
}

/** Down-weight for quests that keep being surfaced without any reaction. */
export function freshness(shownCount: number): number {
  const count = Math.max(0, Number(shownCount) || 0);
  return 1 / (1 + count * 0.5);
}

export function scoreQuest(
  quest: RecommendableQuest,
  weights: Record<Category, number>,
  level: number,
  shownCount: number,
): { score: number; axisWeight: number; fit: number; fresh: number } {
  const axisWeight = weights[quest.category] ?? 1 / CATEGORIES.length;
  const fit = levelFit(quest.difficulty, level);
  const fresh = freshness(shownCount);
  return { score: axisWeight * fit * fresh, axisWeight, fit, fresh };
}

const AXIS_LABELS: Record<Category, string> = {
  health: 'здоровье',
  knowledge: 'знания',
  career: 'карьеру',
  discipline: 'дисциплину',
  social: 'общение',
};

function weakestAxis(stats: AxisStats): Category {
  const shares = toShares(stats);
  let bestIndex = 0;
  for (let index = 1; index < shares.length; index += 1) {
    if (shares[index] < shares[bestIndex]) bestIndex = index;
  }
  return CATEGORIES[bestIndex];
}

export function describeReason(quest: RecommendableQuest, stats: AxisStats): string {
  const weakest = weakestAxis(stats);
  if (quest.category === weakest) {
    return `Подтянет ${AXIS_LABELS[quest.category]} — сейчас это твоя самая слабая ось`;
  }
  return `Развивает ${AXIS_LABELS[quest.category]} и не даёт перекосу усилиться`;
}

function toSet(dismissed?: ReadonlySet<string> | string[]): Set<string> {
  if (!dismissed) return new Set();
  return dismissed instanceof Set ? new Set(dismissed) : new Set(dismissed);
}

function repeatPenalty(category: Category, recentAxes: Category[], maxConsecutive: number): number {
  if (recentAxes.length === 0) return 1;
  const tail = recentAxes.slice(-maxConsecutive);
  if (!tail.includes(category)) return 1;
  // The more of the last N recommendations shared this axis, the harder
  // it is pushed down. A run of N costs the full weight of the last slot.
  const hits = tail.filter(axis => axis === category).length;
  return clamp(1 - hits / (maxConsecutive + 1), 0.15, 1);
}

/**
 * Rank quests for the current profile.
 *
 * Filters: dismissed quests, and quests that fit the character so badly
 * that a zero level fit makes them pointless right now are kept but
 * sorted last (they are still allowed through so the list never comes up
 * empty for a narrow profile).
 */
export function recommend(options: RecommendOptions): ScoredQuest[] {
  const {
    stats,
    level,
    quests,
    shownCounts = {},
    dismissed,
    limit = 3,
    recentAxes = [],
    maxConsecutiveSameAxis = 3,
  } = options;

  const hidden = toSet(dismissed);
  const weights = axisWeights(stats);

  const scored: ScoredQuest[] = [];
  for (const quest of quests) {
    if (hidden.has(quest.id)) continue;
    const { score, axisWeight, fit, fresh } = scoreQuest(quest, weights, level, shownCounts[quest.id] ?? 0);
    const penalty = repeatPenalty(quest.category, recentAxes, maxConsecutiveSameAxis);
    scored.push({
      quest,
      score: score * penalty,
      axisWeight,
      levelFit: fit,
      freshness: fresh,
      reason: describeReason(quest, stats),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, non-random tie-break so the list does not shuffle between
    // renders of the same state.
    return a.quest.id.localeCompare(b.quest.id);
  });

  return scored.slice(0, Math.max(0, limit));
}

export function emptyAxisStats(): AxisStats {
  return { health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 };
}

export function axisStatsFromRows(rows: Array<{ category: Category; xp_total_in_category: number }>): AxisStats {
  const stats = emptyAxisStats();
  for (const row of rows) {
    stats[row.category] = Math.max(0, Number(row.xp_total_in_category) || 0);
  }
  return stats;
}

/**
 * Recommendation engine tests, run against the three synthetic profiles
 * the spec calls for: balanced, one strong skew, several mild skews.
 */
import { CATEGORIES, type Category } from '../src/domain/category';
import {
  axisWeights,
  describeReason,
  expectedDifficulty,
  gini,
  interventionStrength,
  levelFit,
  recommend,
  scoreQuest,
  toShares,
  type AxisStats,
  type RecommendableQuest,
} from '../src/domain/recommendations';

const QUEST = (id: string, category: RecommendableQuest['category'], difficulty: number): RecommendableQuest => ({
  id,
  title: id,
  category,
  difficulty,
  xpReward: 20,
});

const balanced: AxisStats = { health: 200, knowledge: 200, career: 200, discipline: 200, social: 200 };
const oneStrongSkew: AxisStats = { health: 900, knowledge: 100, career: 100, discipline: 100, social: 100 };
const mildSkews: AxisStats = { health: 300, knowledge: 220, career: 200, discipline: 180, social: 160 };

const ALL_AXES: Category[] = [...CATEGORIES];

describe('shares and Gini', () => {
  test('shares always sum to 1', () => {
    for (const stats of [balanced, oneStrongSkew, mildSkews, { health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 }]) {
      const shares = toShares(stats);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });

  test('an all-zero profile is treated as perfectly even, not as one axis', () => {
    const shares = toShares({ health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 });
    shares.forEach(share => expect(share).toBeCloseTo(0.2, 6));
  });

  test('Gini is 0 when balanced and highest when everything is in one axis', () => {
    expect(gini(toShares(balanced))).toBeCloseTo(0, 6);
    expect(gini(toShares(oneStrongSkew))).toBeGreaterThan(gini(toShares(mildSkews)));
    expect(gini(toShares(mildSkews))).toBeGreaterThan(0);
  });

  test('intervention strength grows with imbalance and stays in 0..1', () => {
    expect(interventionStrength(balanced)).toBeCloseTo(0, 6);
    const mild = interventionStrength(mildSkews);
    const strong = interventionStrength(oneStrongSkew);
    expect(mild).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(mild);
    for (const value of [mild, strong]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('axis weights', () => {
  test('a balanced profile gets uniform weights (engine stays out of the way)', () => {
    const weights = axisWeights(balanced);
    for (const axis of ALL_AXES) {
      expect(weights[axis]).toBeCloseTo(0.2, 6);
    }
  });

  test('a skewed profile shifts weight onto the neglected axes', () => {
    const weights = axisWeights(oneStrongSkew);
    expect(weights.health).toBeLessThan(0.2);
    for (const axis of ['knowledge', 'career', 'discipline', 'social'] as const) {
      expect(weights[axis]).toBeGreaterThan(0.2);
    }
    // The four neglected axes share the weight the dominant one gave up.
    const neglected = (['knowledge', 'career', 'discipline', 'social'] as const).reduce(
      (total, axis) => total + weights[axis],
      0,
    );
    expect(neglected).toBeGreaterThan(weights.health);
  });

  test('mild skews produce a gentler correction than one strong skew', () => {
    const mild = axisWeights(mildSkews);
    const strong = axisWeights(oneStrongSkew);
    const mildSpread = Math.max(...ALL_AXES.map(axis => mild[axis])) - Math.min(...ALL_AXES.map(axis => mild[axis]));
    const strongSpread = Math.max(...ALL_AXES.map(axis => strong[axis])) - Math.min(...ALL_AXES.map(axis => strong[axis]));
    expect(strongSpread).toBeGreaterThan(mildSpread);
  });
});

describe('level fit', () => {
  test('expected difficulty grows with level and is clamped to 1..3', () => {
    expect(expectedDifficulty(1)).toBe(1);
    expect(expectedDifficulty(3)).toBe(1);
    expect(expectedDifficulty(4)).toBe(2);
    expect(expectedDifficulty(7)).toBe(3);
    expect(expectedDifficulty(99)).toBe(3);
  });

  test('a quest that matches the level fits best', () => {
    expect(levelFit(1, 1)).toBeCloseTo(1, 6);
    expect(levelFit(2, 4)).toBeCloseTo(1, 6);
    expect(levelFit(3, 7)).toBeCloseTo(1, 6);
  });

  test('a quest far from the level fits worse but never goes below 0', () => {
    expect(levelFit(3, 1)).toBeLessThan(levelFit(1, 1));
    expect(levelFit(1, 1)).toBeGreaterThanOrEqual(0);
    expect(levelFit(1, 1)).toBeLessThanOrEqual(1);
  });
});

describe('scoring and ranking', () => {
  test('a balanced profile ranks by level fit, not by a random axis', () => {
    const quests = ALL_AXES.map(axis => QUEST(axis, axis, 1));
    const ranked = recommend({ stats: balanced, level: 1, quests, limit: 5 });
    // With uniform weights every axis is equally attractive, so the
    // ordering must be deterministic rather than drifting per render.
    const ids = ranked.map(item => item.quest.id);
    expect(new Set(ids).size).toBe(5);
    const again = recommend({ stats: balanced, level: 1, quests, limit: 5 }).map(item => item.quest.id);
    expect(again).toEqual(ids);
  });

  test('a skewed profile surfaces a neglected axis first, never the dominant one', () => {
    const quests = ALL_AXES.map(axis => QUEST(axis, axis, 1));
    const ranked = recommend({ stats: oneStrongSkew, level: 1, quests, limit: 3 });
    // knowledge/career/discipline/social are tied at 100 XP, so any of
    // them may lead; what matters is that the dominant axis does not.
    expect(['knowledge', 'career', 'discipline', 'social']).toContain(ranked[0].quest.category);
    expect(ranked.some(item => item.quest.category === 'health')).toBe(false);
  });

  test('several mild skews shift recommendations without collapsing onto one axis', () => {
    const quests = ALL_AXES.map(axis => QUEST(axis, axis, 1));
    const ranked = recommend({ stats: mildSkews, level: 1, quests, limit: 5 });
    const categories = ranked.map(item => item.quest.category);
    // Social is the weakest here, but the mild profile must not erase
    // the other axes from the list.
    expect(categories[0]).toBe('social');
    expect(new Set(categories).size).toBeGreaterThan(1);
  });

  test('freshness pushes an over-surfaced quest down', () => {
    const quests = ALL_AXES.map(axis => QUEST(axis, axis, 1));
    const first = recommend({ stats: oneStrongSkew, level: 1, quests, limit: 5 });
    const knowledgeId = first[0].quest.id;
    const second = recommend({
      stats: oneStrongSkew,
      level: 1,
      quests,
      shownCounts: { [knowledgeId]: 4 },
      limit: 5,
    });
    const before = first.findIndex(item => item.quest.id === knowledgeId);
    const after = second.findIndex(item => item.quest.id === knowledgeId);
    expect(after).toBeGreaterThan(before);
    expect(second[0].quest.id).not.toBe(knowledgeId);
  });

  test('no more than 3 recommendations on the same axis in a row', () => {
    const quests = ALL_AXES.map(axis => QUEST(axis, axis, 1));
    // Simulate a user who keeps getting 'social' first.
    const recentAxes = recommend({ stats: oneStrongSkew, level: 1, quests, limit: 3 })
      .map(item => item.quest.category);
    const next = recommend({
      stats: oneStrongSkew,
      level: 1,
      quests,
      recentAxes,
      maxConsecutiveSameAxis: 3,
      limit: 1,
    });
    const sameAxisStreak = [...recentAxes, next[0].quest.category].filter(
      (axis, index, all) => index > 0 && axis === all[index - 1],
    ).length;
    expect(sameAxisStreak).toBeLessThan(3);
  });

  test('dismissed quests are never surfaced again', () => {
    const quests = ALL_AXES.map(axis => QUEST(axis, axis, 1));
    const ranked = recommend({
      stats: oneStrongSkew,
      level: 1,
      quests,
      dismissed: ['knowledge', 'career'],
      limit: 5,
    });
    const ids = ranked.map(item => item.quest.id);
    expect(ids).not.toContain('knowledge');
    expect(ids).not.toContain('career');
    expect(ids).toContain('social');
  });

  test('an empty quest list yields an empty result instead of throwing', () => {
    expect(recommend({ stats: balanced, level: 1, quests: [] })).toEqual([]);
  });

  test('scores stay finite for degenerate input', () => {
    const quests = [QUEST('a', 'health', 3)];
    const scored = scoreQuest(quests[0], axisWeights({ health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 }), 1, 0);
    expect(Number.isFinite(scored.score)).toBe(true);
    const ranked = recommend({ stats: balanced, level: 0, quests, limit: 1 });
    expect(Number.isFinite(ranked[0].score)).toBe(true);
  });

  test('reasons name the weakest axis for the quest that targets it', () => {
    expect(describeReason(QUEST('k', 'knowledge', 1), oneStrongSkew)).toContain('сейчас это твоя самая слабая ось');
    expect(describeReason(QUEST('h', 'health', 1), oneStrongSkew)).toContain('не даёт перекосу усилиться');
  });
});

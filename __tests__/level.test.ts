import { xpToReach, levelProgress, MIN_STEP } from '../src/domain/level';

describe('level curve', () => {
  test('base thresholds L1..L5', () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(100);
    expect(xpToReach(3)).toBe(300);
    expect(xpToReach(4)).toBe(700);
    expect(xpToReach(5)).toBe(1500);
  });

  test('L6+ grows monotonically', () => {
    let prev = xpToReach(5);
    for (let lv = 6; lv <= 30; lv += 1) {
      const cur = xpToReach(lv);
      expect(cur).toBeGreaterThan(prev);
      // step never collapses below MIN_STEP
      expect(cur - prev).toBeGreaterThanOrEqual(MIN_STEP);
      prev = cur;
    }
  });

  test('L6+ respects custom growth factor', () => {
    const slow = xpToReach(10, 1.1);
    const fast = xpToReach(10, 2.0);
    expect(fast).toBeGreaterThan(slow);
  });

  test('level 1 with 0 xp', () => {
    const p = levelProgress(0);
    expect(p.level).toBe(1);
    expect(p.xp_into_level).toBe(0);
    expect(p.xp_for_next_level).toBe(100);
    expect(p.level_progress_pct).toBe(0);
  });

  test('50 xp at start → 50% to L2', () => {
    const p = levelProgress(50);
    expect(p.level).toBe(1);
    expect(p.level_progress_pct).toBe(50);
  });

  test('100 xp → level 2', () => {
    expect(levelProgress(100).level).toBe(2);
  });

  test('1500 xp → level 5', () => {
    expect(levelProgress(1500).level).toBe(5);
  });

  test('high xp → high level', () => {
    const p = levelProgress(100000);
    expect(p.level).toBeGreaterThanOrEqual(5);
    expect(p.xp_for_next_level).toBeGreaterThan(p.xp_total);
  });

  test('negative xp clamped to 0', () => {
    expect(levelProgress(-5).xp_total).toBe(0);
    expect(levelProgress(-5).level).toBe(1);
  });
});

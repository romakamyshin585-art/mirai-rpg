import { drMultiplier, applyDr, DEFAULT_DR_CONFIG } from '../src/domain/dr';

describe('diminishing returns', () => {
  test('under threshold = full XP', () => {
    expect(drMultiplier(0)).toBe(1.0);
    expect(drMultiplier(1)).toBe(1.0);
    expect(drMultiplier(4)).toBe(1.0);
    expect(drMultiplier(5 - 1)).toBe(1.0); // 4
  });

  test('at threshold, first step kicks in', () => {
    // count=5 (threshold=5) → steps=1 → 1.0 - 0.15*1 = 0.85
    expect(drMultiplier(5)).toBeCloseTo(0.85, 5);
  });

  test('linear decay', () => {
    // 5->0.85, 6->0.70, 7->0.55, 8->0.40, 9->0.25
    expect(drMultiplier(5)).toBeCloseTo(0.85, 5);
    expect(drMultiplier(6)).toBeCloseTo(0.70, 5);
    expect(drMultiplier(7)).toBeCloseTo(0.55, 5);
    expect(drMultiplier(8)).toBeCloseTo(0.40, 5);
    expect(drMultiplier(9)).toBeCloseTo(0.25, 5);
  });

  test('floor reached and never crossed', () => {
    expect(drMultiplier(10)).toBeCloseTo(0.25, 5);
    expect(drMultiplier(50)).toBeCloseTo(0.25, 5);
    expect(drMultiplier(1000)).toBeCloseTo(0.25, 5);
  });

  test('applyDr rounds to int, minimum 1', () => {
    expect(applyDr(100, 0).awarded).toBe(100);
    expect(applyDr(100, 5).awarded).toBe(85);
    expect(applyDr(1, 1000).awarded).toBe(1); // floor 0.25 → 0.25 → rounds to 0 → floor to 1
    expect(applyDr(3, 1000).awarded).toBe(1); // 3 * 0.25 = 0.75 → 1
  });

  test('custom config respected', () => {
    const cfg = { threshold: 2, step_pct: 20, floor_pct: 30 };
    expect(drMultiplier(1, cfg)).toBe(1.0);
    expect(drMultiplier(2, cfg)).toBeCloseTo(0.8, 5);
    expect(drMultiplier(10, cfg)).toBeCloseTo(0.3, 5);
  });
});

describe('default config', () => {
  test('matches handbook values', () => {
    expect(DEFAULT_DR_CONFIG).toEqual({ threshold: 5, step_pct: 15, floor_pct: 25 });
  });
});

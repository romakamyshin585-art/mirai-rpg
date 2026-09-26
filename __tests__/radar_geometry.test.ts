/**
 * Regression tests for the Radar chart geometry.
 *
 * The crash these pin down:
 *   java.lang.IllegalArgumentException: radius must be > 0
 *   at android.graphics.RadialGradient.<init>
 *   at com.horcrux.svg.Brush.setupPaint
 *
 * Root cause: with every stat at zero (a fresh profile) all five vertices
 * collapse onto the centre, the painted polygon has a zero-area bounding
 * box, and a gradient sized in percent of that box resolved to radius 0,
 * which throws on the Android UI thread during draw.
 *
 * The guarantees under test:
 *  1. the geometry never collapses (radius floor on every axis);
 *  2. the radial gradient radius is always strictly positive;
 *  3. the painted area stays inside the box at any screen size, so it
 *     can never drift off the axes or under the bottom navigation;
 *  4. vertices, grid, badges and labels all share one coordinate system.
 */
import {
  BADGE_GAP,
  BADGE_SIZE,
  LABEL_WIDTH,
  MAX_BOX,
  MIN_BOX,
  POD_HEIGHT,
  axisPoints,
  computeRadarGeometry,
  gradientRadius,
  podAnchor,
  podOrigin,
  point,
  polygonPath,
  serializePoints,
  valueToRatio,
} from '../src/ui/components/radar_geometry';

const AXES = 5;
const SCREEN_WIDTHS = [280, 320, 360, 411, 480, 600, 900];

describe('radar geometry', () => {
  test('gradient radius is always > 0, including an unmeasured chart', () => {
    for (const width of [0, ...SCREEN_WIDTHS]) {
      const geometry = computeRadarGeometry(width, AXES);
      expect(gradientRadius(geometry)).toBeGreaterThan(0);
    }
  });

  test('an all-zero profile still produces a non-degenerate polygon', () => {
    const geometry = computeRadarGeometry(360, AXES);
    const points = axisPoints(geometry, [0, 0, 0, 0, 0]);

    const xs = points.map(item => item.x);
    const ys = points.map(item => item.y);
    // Non-zero area is exactly what was missing before: a collapsed
    // polygon is what made the gradient's bbox radius 0.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
    const path = polygonPath(points.flatMap(item => [item.x, item.y]), geometry.center, 1);
    expect(path).not.toBe('');
    // No NaN can reach the SVG path data.
    expect(path).not.toMatch(/NaN/);
    expect(points.every(item => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true);
  });

  test('every axis keeps a visible minimum radius', () => {
    const geometry = computeRadarGeometry(360, AXES);
    const points = axisPoints(geometry, [0, 0, 0, 0, 0]);
    for (const item of points) {
      const radius = Math.hypot(item.x - geometry.center, item.y - geometry.center);
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBeLessThanOrEqual(geometry.maxRadius);
    }
  });

  test('valueToRatio maps 0..1 onto the floored range and rejects junk', () => {
    expect(valueToRatio(0)).toBeGreaterThan(0);
    expect(valueToRatio(1)).toBeCloseTo(1, 5);
    expect(valueToRatio(-5)).toBeCloseTo(valueToRatio(0), 5);
    expect(valueToRatio(9)).toBeCloseTo(1, 5);
    expect(valueToRatio(Number.NaN)).toBeCloseTo(valueToRatio(0), 5);
    expect(valueToRatio(undefined)).toBeCloseTo(valueToRatio(0), 5);
  });

  test('box stays within bounds and is centred', () => {
    for (const width of SCREEN_WIDTHS) {
      const geometry = computeRadarGeometry(width, AXES);
      expect(geometry.box).toBeGreaterThanOrEqual(MIN_BOX - 1);
      expect(geometry.box).toBeLessThanOrEqual(MAX_BOX + 1);
      expect(geometry.center).toBeCloseTo(geometry.box / 2, 5);
    }
  });

  test('grid, polygon and vertices share one coordinate system', () => {
    const geometry = computeRadarGeometry(393, AXES);
    const ratios = [1, 0.5, 0.25, 0.75, 0];
    const points = axisPoints(geometry, ratios);

    points.forEach((vertex, index) => {
      const expected = point(geometry.center, geometry.maxRadius * valueToRatio(ratios[index]), geometry.angles[index]);
      expect(vertex.x).toBeCloseTo(expected.x, 5);
      expect(vertex.y).toBeCloseTo(expected.y, 5);
    });

    // Grid ring sits exactly on the same axes.
    const grid = serializePoints(geometry.angles.map(angle => point(geometry.center, geometry.maxRadius, angle)));
    expect(grid.split(' ')).toHaveLength(AXES);
  });

  test('badges and labels stay inside the box at every screen size', () => {
    for (const width of SCREEN_WIDTHS) {
      const geometry = computeRadarGeometry(width, AXES);
      for (let index = 0; index < AXES; index += 1) {
        const pod = podAnchor(geometry, index);
        const origin = podOrigin(geometry, index);

        // The pod is badge + name + value, so its *whole* box has to fit —
        // not just the badge. This is the assertion that was missing when
        // the axis names were found painted on top of the next card.
        expect(origin.x).toBeGreaterThanOrEqual(-0.5);
        expect(origin.x + LABEL_WIDTH).toBeLessThanOrEqual(geometry.box + 0.5);
        expect(origin.y).toBeGreaterThanOrEqual(-0.5);
        expect(origin.y + POD_HEIGHT).toBeLessThanOrEqual(geometry.box + 0.5);

        // Badge is centred horizontally on the pod.
        expect(pod.x - BADGE_SIZE / 2).toBeGreaterThanOrEqual(origin.x - 0.5);
        expect(pod.x + BADGE_SIZE / 2).toBeLessThanOrEqual(origin.x + LABEL_WIDTH + 0.5);

        // The badge still sits on its axis: clamping may only nudge it
        // horizontally, never push it inside the ring.
        const angle = geometry.angles[index];
        const rawX = geometry.center + geometry.badgeRadius * Math.cos(angle);
        expect(Math.abs(pod.x - rawX)).toBeLessThan(LABEL_WIDTH);
      }
    }
  });

  test('the outermost ring still leaves room for the pod ring', () => {
    for (const width of SCREEN_WIDTHS) {
      const geometry = computeRadarGeometry(width, AXES);
      expect(geometry.badgeRadius).toBeCloseTo(geometry.maxRadius + BADGE_GAP, 5);
      // A vertex may never be painted outside the outer grid ring, and the
      // pods start beyond it, so the gap between them is what keeps the
      // filled polygon from touching the badges.
      expect(geometry.badgeRadius).toBeGreaterThan(geometry.maxRadius);
      expect(geometry.badgeRadius).toBeLessThanOrEqual(geometry.box / 2);
    }
  });

  test('polygonPath closes the shape and interpolates towards the centre', () => {
    const geometry = computeRadarGeometry(360, AXES);
    const points = axisPoints(geometry, [1, 1, 1, 1, 1]);
    const flat = points.flatMap(item => [item.x, item.y]);
    const full = polygonPath(flat, geometry.center, 1);
    const half = polygonPath(flat, geometry.center, 0.5);

    expect(full.startsWith('M ')).toBe(true);
    expect(full.endsWith(' Z')).toBe(true);
    expect(half.split('L')).toHaveLength(full.split('L').length);
    // Shrinking moves every point towards the centre. Vertex 0 sits on the
    // vertical axis (x === centre), so compare a vertex off that axis.
    const fullOff = full.split('L')[1].trim().split(',');
    const halfOff = half.split('L')[1].trim().split(',');
    const fullX = Number(fullOff[0]);
    const halfX = Number(halfOff[0]);
    expect(Math.abs(fullX - geometry.center)).toBeGreaterThan(0);
    expect(Math.abs(halfX - geometry.center)).toBeLessThan(Math.abs(fullX - geometry.center));
  });

  test('polygonPath tolerates degenerate input instead of emitting NaN', () => {
    expect(polygonPath([], 100, 1)).toBe('');
    expect(polygonPath([1, 2], 100, 1)).toBe('');
  });
});

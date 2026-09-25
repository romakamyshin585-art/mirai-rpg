/**
 * Radar chart geometry.
 *
 * Kept separate from the component so it can be unit-tested without a
 * renderer — which matters because one of the bugs it prevents is a hard
 * native crash: a radar polygon whose vertices all collapse onto the
 * centre (every stat at zero, i.e. every fresh install) has a zero-area
 * bounding box, and an SVG radial gradient sized in percent of that box
 * resolves to radius 0. Android then throws
 *   java.lang.IllegalArgumentException: radius must be > 0
 * from com.horcrux.svg.Brush.setupPaint during the draw pass, which kills
 * the UI thread. Gradients are therefore declared in userSpaceOnUse units
 * derived from this geometry, and the polygon is never allowed to be
 * degenerate.
 */

export const MIN_BOX = 236;
export const MAX_BOX = 340;
export const BADGE_SIZE = 42;
export const BADGE_GAP = 30;
export const LABEL_OFFSET = 30;
export const LABEL_WIDTH = 78;
export const LABEL_HALF_HEIGHT = 15;
export const MIN_AXIS_RATIO = 0.08;
export const GRID_LEVELS = 4;
export const ANGLE_OFFSET = -Math.PI / 2;

export type Point = { x: number; y: number };

export type RadarGeometry = {
  box: number;
  center: number;
  maxRadius: number;
  badgeRadius: number;
  angles: number[];
};

/** Smallest radius a vertex may take, as a share of the outer ring. */
export const MIN_AXIS_RADIUS_RATIO = MIN_AXIS_RATIO;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * @param measuredWidth width reported by onLayout. 0 means "not laid out
 * yet" and yields the fallback box so nothing renders at radius 0.
 * @param axes number of axes.
 */
export function computeRadarGeometry(measuredWidth: number, axes: number, fallbackWidth = MIN_BOX): RadarGeometry {
  const width = measuredWidth > 0 ? measuredWidth : fallbackWidth;
  const box = clamp(width, MIN_BOX, MAX_BOX);
  const center = box / 2;
  // Reserve room for the outermost element: a label sitting on the top
  // axis, which is the element furthest from the centre.
  const reserved = LABEL_OFFSET + LABEL_HALF_HEIGHT + BADGE_GAP;
  const maxRadius = Math.max(40, center - reserved);
  return {
    box,
    center,
    maxRadius,
    badgeRadius: maxRadius + BADGE_GAP,
    angles: Array.from({ length: axes }, (_, index) => ANGLE_OFFSET + (index / axes) * 2 * Math.PI),
  };
}

/** Normalised 0..1 axis value, guaranteed to produce a visible radius. */
export function valueToRatio(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const clamped = clamp(numeric, 0, 1);
  return MIN_AXIS_RATIO + (1 - MIN_AXIS_RATIO) * clamped;
}

export function point(center: number, radius: number, angle: number): Point {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

export function axisPoints(geometry: RadarGeometry, ratios: number[]): Point[] {
  return geometry.angles.map((angle, index) => point(geometry.center, geometry.maxRadius * valueToRatio(ratios[index]), angle));
}

/** Radius for the radial gradient, in user space. Never 0. */
export function gradientRadius(geometry: RadarGeometry): number {
  return Math.max(1, geometry.maxRadius);
}

export function serializePoints(points: Point[]): string {
  return points.map(item => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
}

/** Path `d` for a polygon scaled towards (or away from) the centre. */
export function polygonPath(flat: number[], center: number, factor: number): string {
  if (flat.length < 4) return '';
  let result = `M ${(center + (flat[0] - center) * factor).toFixed(1)},${(center + (flat[1] - center) * factor).toFixed(1)}`;
  for (let index = 2; index + 1 < flat.length; index += 2) {
    result += ` L ${(center + (flat[index] - center) * factor).toFixed(1)},${(center + (flat[index + 1] - center) * factor).toFixed(1)}`;
  }
  return `${result} Z`;
}

/**
 * Label anchor for a vertex: pushed further out along the same axis, then
 * clamped inside the box so a label can never overlap the card edge or
 * the bottom navigation.
 */
export function labelAnchor(geometry: RadarGeometry, index: number): { x: number; y: number } {
  const angle = geometry.angles[index] ?? ANGLE_OFFSET;
  const raw = point(geometry.center, geometry.badgeRadius + LABEL_OFFSET, angle);
  const halfWidth = LABEL_WIDTH / 2;
  return {
    x: clamp(raw.x, halfWidth, geometry.box - halfWidth),
    y: clamp(raw.y, LABEL_HALF_HEIGHT, geometry.box - LABEL_HALF_HEIGHT),
  };
}

export function badgeAnchor(geometry: RadarGeometry, index: number): Point {
  return point(geometry.center, geometry.badgeRadius, geometry.angles[index] ?? ANGLE_OFFSET);
}

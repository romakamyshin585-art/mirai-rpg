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
 *
 * Second responsibility, added after the labels were found sitting on top
 * of the "Итоги недели" card: every per-axis element is a single "pod"
 * (badge + name + value) whose *whole* extent is fitted into the box, not
 * just its centre. `safePodRadius` derives the outermost radius the pods
 * can occupy from the pod's real half-heights, so no screen width can
 * push a label outside the card — the pod bounds are asserted directly by
 * the test suite instead of being taken on trust.
 */

export const MIN_BOX = 236;
export const MAX_BOX = 340;
export const BADGE_SIZE = 40;
export const BADGE_GAP = 16;
/** Gap between the bottom of the badge and the axis name. */
export const POD_LABEL_GAP = 5;
export const LABEL_WIDTH = 84;
export const LABEL_HEIGHT = 12;
export const VALUE_HEIGHT = 16;
export const VALUE_GAP = 2;
/** Pod extent above / below its badge centre. */
export const POD_ABOVE = BADGE_SIZE / 2;
export const POD_BELOW = POD_LABEL_GAP + LABEL_HEIGHT + VALUE_GAP + VALUE_HEIGHT;
export const POD_HEIGHT = POD_ABOVE + POD_BELOW;
/** Kept as the single "half height" figure so a pod can never leave the box. */
export const LABEL_HALF_HEIGHT = Math.max(POD_ABOVE, POD_BELOW);
export const POD_MARGIN = 3;
export const MIN_AXIS_RATIO = 0.08;
export const GRID_LEVELS = 4;
export const ANGLE_OFFSET = -Math.PI / 2;

export type Point = { x: number; y: number };

export type RadarGeometry = {
  box: number;
  center: number;
  /** Radius of the outermost grid ring. Vertices live inside it. */
  maxRadius: number;
  /** Distance from the centre to a pod's badge centre. */
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
 * Largest radius at which every pod still fits inside the box.
 *
 * For an axis that points up, only the pod's *upper* half can leave the
 * box; for one that points down, only its lower half. Axes close to
 * horizontal additionally have to clear half the label width sideways.
 * Taking the minimum over all axes makes this correct for any axis count
 * and any angle offset, not just the five-axis portrait layout.
 */
export function safePodRadius(box: number, angles: number[]): number {
  const center = box / 2;
  const halfLabel = LABEL_WIDTH / 2;
  let limit = center;
  for (const angle of angles) {
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.sin(angle);
    const absSin = Math.abs(sin);
    if (cos > 1e-3) {
      limit = Math.min(limit, (center - halfLabel - POD_MARGIN) / cos);
    }
    if (absSin > 1e-3) {
      const need = sin < 0 ? POD_ABOVE : POD_BELOW;
      limit = Math.min(limit, (center - need - POD_MARGIN) / absSin);
    }
  }
  return Math.max(24, limit);
}

/**
 * @param measuredWidth width reported by onLayout. 0 means "not laid out
 *  yet" and yields the fallback box so nothing renders at radius 0.
 * @param axes number of axes.
 */
export function computeRadarGeometry(measuredWidth: number, axes: number, fallbackWidth = MIN_BOX): RadarGeometry {
  const width = measuredWidth > 0 ? measuredWidth : fallbackWidth;
  const box = clamp(width, MIN_BOX, MAX_BOX);
  const center = box / 2;
  const angles = Array.from({ length: Math.max(3, axes) }, (_, index) => ANGLE_OFFSET + (index / Math.max(3, axes)) * 2 * Math.PI);
  const badgeRadius = safePodRadius(box, angles);
  return {
    box,
    center,
    maxRadius: Math.max(40, badgeRadius - BADGE_GAP),
    badgeRadius,
    angles,
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
 * Pod anchor: where a per-axis badge + label block is centred.
 *
 * Clamped to the box on both axes using the pod's real extents, so the
 * block can never overlap the card border — the failure that put the
 * axis names on top of the neighbouring card.
 */
export function podAnchor(geometry: RadarGeometry, index: number): Point {
  const angle = geometry.angles[index] ?? ANGLE_OFFSET;
  const raw = point(geometry.center, geometry.badgeRadius, angle);
  const halfWidth = LABEL_WIDTH / 2;
  return {
    x: clamp(raw.x, halfWidth, geometry.box - halfWidth),
    y: clamp(raw.y, POD_ABOVE, geometry.box - POD_BELOW),
  };
}

/** Top-left corner of the pod's bounding box, for absolute positioning. */
export function podOrigin(geometry: RadarGeometry, index: number): Point {
  const pod = podAnchor(geometry, index);
  return { x: pod.x - LABEL_WIDTH / 2, y: pod.y - POD_ABOVE };
}

export function badgeAnchor(geometry: RadarGeometry, index: number): Point {
  return podAnchor(geometry, index);
}

export function labelAnchor(geometry: RadarGeometry, index: number): Point {
  return podAnchor(geometry, index);
}

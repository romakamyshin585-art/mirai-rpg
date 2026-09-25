import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Extrapolate, interpolate, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Circle, Defs, G, Line, LinearGradient, Path, Polygon, RadialGradient, Stop, Svg } from 'react-native-svg';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { duration, spring, useReducedMotion } from '../motion';
import {
  BADGE_SIZE,
  GRID_LEVELS,
  LABEL_WIDTH,
  MIN_BOX,
  axisPoints,
  badgeAnchor,
  computeRadarGeometry,
  gradientRadius,
  labelAnchor,
  point,
  polygonPath,
  serializePoints,
} from './radar_geometry';

export type RadarData = {
  category: Category;
  value: number;
  xp: number;
  questsCompleted: number;
  weeklyChange: number;
};

type RadarChartProps = {
  data: RadarData[];
};

type DayValues = Record<Category, number>;

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RadarChart({ data }: RadarChartProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [pulseIndex, setPulseIndex] = useState(-1);
  const pulse = useSharedValue(0);
  const previousValues = useRef<DayValues | null>(null);

  const normalized = useMemo(
    () => CATEGORIES.map(category => data.find(item => item.category === category) ?? {
      category,
      value: 0,
      xp: 0,
      questsCompleted: 0,
      weeklyChange: 0,
    }),
    [data],
  );
  const ratios = useMemo(() => normalized.map(item => Number(item.value) || 0), [normalized]);

  // Single source of truth for every coordinate below: grid, polygon,
  // vertices, badges and labels are all derived from this.
  const geometry = useMemo(() => computeRadarGeometry(width, CATEGORIES.length), [width]);
  const { box, center, maxRadius, angles } = geometry;

  const points = useMemo(() => axisPoints(geometry, ratios), [geometry, ratios]);
  const flatPoints = useMemo(() => points.flatMap(item => [item.x, item.y]), [points]);

  const fromPoints = useSharedValue(flatPoints);
  const toPoints = useSharedValue(flatPoints);
  const transition = useSharedValue(1);
  const reveal = useSharedValue(0);

  useAnimatedReaction(
    () => transition.value,
    progress => {
      // Keep the live geometry in sync even when a transition is
      // interrupted, so vertices never lag a frame behind the fill.
      toPoints.value = interpolateFlat(fromPoints.value, toPoints.value, progress);
    },
  );

  useEffect(() => {
    const next = flatPoints;
    fromPoints.value = interpolateFlat(fromPoints.value, toPoints.value, transition.value);
    toPoints.value = next;
    transition.value = reduced ? withTiming(1, { duration: duration.standard }) : withSpring(1, spring.card);
  }, [flatPoints, fromPoints, reduced, toPoints, transition]);

  useEffect(() => {
    reveal.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withSpring(1, spring.card);
  }, [reduced, reveal, box]);

  useEffect(() => {
    const values = Object.fromEntries(normalized.map(item => [item.category, Number(item.value) || 0])) as DayValues;
    const previous = previousValues.current;
    previousValues.current = values;
    if (!previous) return;
    const changedIndex = CATEGORIES.findIndex(category => previous[category] !== values[category]);
    if (changedIndex < 0) return;
    setPulseIndex(changedIndex);
    pulse.value = 0;
    pulse.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withSpring(1, spring.celebration);
  }, [normalized, pulse, reduced]);

  const chartStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: reduced ? [] : [{ scale: 0.96 + reveal.value * 0.04 }],
  }));
  const outerAnimatedProps = useAnimatedProps(() => ({
    d: interpolatePath(fromPoints.value, toPoints.value, transition.value, center, 1),
  }));
  const innerAnimatedProps = useAnimatedProps(() => ({
    d: interpolatePath(fromPoints.value, toPoints.value, transition.value, center, 0.52),
  }));

  const colorForCategory = (category: Category) => {
    const key = `cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors;
    return colors[key] ?? colors.accent;
  };

  const ready = width > 0;

  return (
    <View
      accessibilityLabel="Диаграмма характеристик персонажа"
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={styles.container}
    >
      <Animated.View style={[styles.chart, chartStyle]}>
        <View style={{ width: box, height: box }}>
          {ready ? (
            <Svg
              width={box}
              height={box}
              viewBox={`0 0 ${box} ${box}`}
              pointerEvents="none"
            >
              <Defs>
                {/* userSpaceOnUse: the gradient is sized from the chart
                    geometry, never from the painted shape's bounding
                    box, so it can never resolve to radius 0. */}
                <LinearGradient
                  id="radarGradient"
                  gradientUnits="userSpaceOnUse"
                  x1={0}
                  y1={0}
                  x2={box}
                  y2={box}
                >
                  <Stop offset="0%" stopColor="#EC4899" stopOpacity="0.96" />
                  <Stop offset="48%" stopColor="#8B5CF6" stopOpacity="0.9" />
                  <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0.94" />
                </LinearGradient>
                <RadialGradient
                  id="radarCore"
                  gradientUnits="userSpaceOnUse"
                  cx={center}
                  cy={center}
                  r={gradientRadius(geometry)}
                >
                  <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.7" />
                  <Stop offset="42%" stopColor="#A855F7" stopOpacity="0.62" />
                  <Stop offset="100%" stopColor="#2563EB" stopOpacity="0.12" />
                </RadialGradient>
              </Defs>
              <Circle
                cx={center}
                cy={center}
                r={maxRadius + 9}
                fill="none"
                stroke={colors.catDiscipline}
                strokeOpacity={0.18}
                strokeWidth={1}
              />
              {Array.from({ length: GRID_LEVELS }, (_, index) => {
                const radius = maxRadius * ((index + 1) / GRID_LEVELS);
                return (
                  <Polygon
                    key={`grid-${index}`}
                    points={serializePoints(angles.map(angle => point(center, radius, angle)))}
                    fill="none"
                    stroke={colors.catDiscipline}
                    strokeOpacity={0.24}
                    strokeWidth={1}
                  />
                );
              })}
              <G>
                {angles.map((angle, index) => {
                  const end = point(center, maxRadius, angle);
                  return (
                    <Line
                      key={CATEGORIES[index]}
                      x1={center}
                      y1={center}
                      x2={end.x}
                      y2={end.y}
                      stroke={colors.catDiscipline}
                      strokeOpacity={0.2}
                      strokeWidth={1}
                    />
                  );
                })}
              </G>
              <AnimatedPath animatedProps={outerAnimatedProps} d={polygonPath(flatPoints, center, 1)} fill="url(#radarGradient)" opacity={0.8} />
              <AnimatedPath animatedProps={outerAnimatedProps} d={polygonPath(flatPoints, center, 1)} fill="url(#radarCore)" opacity={0.66} />
              <AnimatedPath
                animatedProps={outerAnimatedProps}
                d={polygonPath(flatPoints, center, 1)}
                fill="none"
                stroke="#C4B5FD"
                strokeOpacity={0.92}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              <AnimatedPath
                animatedProps={innerAnimatedProps}
                d={polygonPath(flatPoints, center, 0.52)}
                fill="#2563EB"
                fillOpacity={0.2}
                stroke="#93C5FD"
                strokeOpacity={0.42}
                strokeWidth={1}
                strokeLinejoin="round"
              />
              {CATEGORIES.map((category, index) => (
                <RadarVertex
                  key={category}
                  index={index}
                  fromPoints={fromPoints}
                  toPoints={toPoints}
                  progress={transition}
                  color={colorForCategory(category)}
                  backgroundColor={colors.bg}
                />
              ))}
              <Circle cx={center} cy={center} r={2.5} fill="#F8FAFC" fillOpacity={0.9} />
            </Svg>
          ) : null}
          {CATEGORIES.map((category, index) => {
            const item = normalized[index];
            const color = colorForCategory(category);
            const badge = badgeAnchor(geometry, index);
            const label = labelAnchor(geometry, index);
            return (
              <View key={category}>
                <View
                  accessible
                  accessibilityLabel={`${CATEGORY_LABELS[category]}: ${item.xp} XP`}
                  style={[
                    styles.badge,
                    {
                      left: badge.x - BADGE_SIZE / 2,
                      top: badge.y - BADGE_SIZE / 2,
                      backgroundColor: colors.surface,
                      borderColor: color,
                      boxShadow: `0 0 14px ${color}66`,
                    },
                  ]}
                >
                  <LucideIcon name={CATEGORY_ICONS[category]} size={19} color={color} strokeWidth={2.2} />
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[styles.categoryName, { left: label.x - LABEL_WIDTH / 2, top: label.y - 22, color: colors.textSecondary }]}
                >
                  {CATEGORY_LABELS[category]}
                </Text>
                <Text style={[styles.categoryValue, { left: label.x - LABEL_WIDTH / 2, top: label.y - 6, color }]}>{item.xp}</Text>
              </View>
            );
          })}
          {pulseIndex >= 0 && points[pulseIndex] ? (
            <RadarPulse
              x={points[pulseIndex].x}
              y={points[pulseIndex].y}
              color={colorForCategory(CATEGORIES[pulseIndex])}
              progress={pulse}
            />
          ) : null}
        </View>
      </Animated.View>
      {!ready ? <View style={{ height: MIN_BOX }} /> : null}
    </View>
  );
}

function RadarVertex({
  index,
  fromPoints,
  toPoints,
  progress,
  color,
  backgroundColor,
}: {
  index: number;
  fromPoints: SharedValue<number[]>;
  toPoints: SharedValue<number[]>;
  progress: SharedValue<number>;
  color: string;
  backgroundColor: string;
}) {
  const animatedProps = useAnimatedProps(() => ({
    cx: interpolatePoint(fromPoints.value, toPoints.value, progress.value, index, 'x'),
    cy: interpolatePoint(fromPoints.value, toPoints.value, progress.value, index, 'y'),
  }));
  return (
    <G>
      <AnimatedCircle animatedProps={animatedProps} r={11} fill={color} fillOpacity={0.16} />
      <AnimatedCircle animatedProps={animatedProps} r={4.5} fill={color} stroke={backgroundColor} strokeWidth={1.5} />
    </G>
  );
}

function RadarPulse({ x, y, color, progress }: { x: number; y: number; color: string; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.7, 0], Extrapolate.CLAMP),
    transform: [{ scale: 0.7 + progress.value * 0.8 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, { left: x - 9, top: y - 9, backgroundColor: color }, style]} />;
}

function interpolatePoint(from: number[], to: number[], progress: number, index: number, axis: 'x' | 'y') {
  'worklet';
  const offset = index * 2 + (axis === 'x' ? 0 : 1);
  const fromValue = from[offset] ?? 0;
  const toValue = to[offset] ?? fromValue;
  return fromValue + (toValue - fromValue) * progress;
}

function interpolateFlat(from: number[], to: number[], progress: number) {
  'worklet';
  const length = Math.min(from.length, to.length);
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    result[index] = from[index] + (to[index] - from[index]) * progress;
  }
  return result;
}

function interpolatePath(from: number[], to: number[], progress: number, center: number, factor: number) {
  'worklet';
  const flat = interpolateFlat(from, to, progress);
  if (flat.length < 4) return '';
  let result = `M ${(center + (flat[0] - center) * factor).toFixed(1)},${(center + (flat[1] - center) * factor).toFixed(1)}`;
  for (let index = 2; index + 1 < flat.length; index += 2) {
    result += ` L ${(center + (flat[index] - center) * factor).toFixed(1)},${(center + (flat[index + 1] - center) * factor).toFixed(1)}`;
  }
  return `${result} Z`;
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center' },
  chart: { alignItems: 'center' },
  badge: {
    position: 'absolute',
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    position: 'absolute',
    width: LABEL_WIDTH,
    fontFamily: 'Nunito',
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  categoryValue: {
    position: 'absolute',
    width: LABEL_WIDTH,
    fontFamily: 'Nunito',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  pulse: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
});

export default RadarChart;

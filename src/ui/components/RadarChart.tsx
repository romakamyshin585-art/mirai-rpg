import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Extrapolate, interpolate, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Circle, Defs, G, Line, LinearGradient, Path, Polygon, RadialGradient, Stop, Svg } from 'react-native-svg';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { duration, spring } from '../motion';
import { useReducedMotion } from '../motion';

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

type Point = { x: number; y: number };
type DayValues = Record<Category, number>;

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

const GRID_LEVELS = 4;
const BADGE_SIZE = 48;
const ANGLE_OFFSET = -Math.PI / 2;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RadarChart({ data }: RadarChartProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [pulseIndex, setPulseIndex] = useState(-1);
  const size = width > 0 ? Math.min(width, 320) : 280;
  const center = size / 2;
  const maxRadius = size * 0.25;
  const badgeRadius = maxRadius + 34;
  const angles = useMemo(
    () => CATEGORIES.map((_, index) => ANGLE_OFFSET + (index / CATEGORIES.length) * 2 * Math.PI),
    [],
  );
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
  const points = useMemo(
    () => normalized.map((item, index) => {
      const value = Math.max(0, Math.min(1, Number(item.value) || 0));
      return point(center, maxRadius * value, angles[index]);
    }),
    [angles, center, maxRadius, normalized],
  );
  const flatPoints = useMemo(() => points.flatMap(item => [item.x, item.y]), [points]);
  const fromPoints = useSharedValue(flatPoints);
  const toPoints = useSharedValue(flatPoints);
  const currentPoints = useSharedValue(flatPoints);
  const transition = useSharedValue(1);
  const reveal = useSharedValue(0);
  const pulse = useSharedValue(0);
  const previousValues = useRef<DayValues | null>(null);

  useAnimatedReaction(
    () => transition.value,
    progress => {
      currentPoints.value = interpolateFlat(fromPoints.value, toPoints.value, progress);
    },
  );

  useEffect(() => {
    const next = flatPoints;
    fromPoints.value = currentPoints.value;
    toPoints.value = next;
    transition.value = reduced ? withTiming(1, { duration: duration.standard }) : withSpring(1, spring.card);
  }, [currentPoints, flatPoints, fromPoints, reduced, toPoints, transition]);

  useEffect(() => {
    reveal.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withSpring(1, spring.card);
  }, [reduced, reveal, size]);

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

  return (
    <View
      accessibilityLabel="Диаграмма характеристик персонажа"
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={styles.container}
    >
      <Animated.View style={[styles.chart, chartStyle]}>
        <View style={{ width: size, height: size + 28 }}>
          <Svg width={size} height={size} pointerEvents="none">
            <Defs>
              <LinearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#EC4899" stopOpacity="0.96" />
                <Stop offset="48%" stopColor="#8B5CF6" stopOpacity="0.9" />
                <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0.94" />
              </LinearGradient>
              <RadialGradient id="radarCore" cx="58%" cy="58%" r="68%">
                <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.72" />
                <Stop offset="42%" stopColor="#A855F7" stopOpacity="0.64" />
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
            <AnimatedPath animatedProps={outerAnimatedProps} d={pathFromPoints(flatPoints, center, 1)} fill="url(#radarGradient)" opacity={0.82} />
            <AnimatedPath animatedProps={outerAnimatedProps} d={pathFromPoints(flatPoints, center, 1)} fill="url(#radarCore)" opacity={0.68} />
            <AnimatedPath
              animatedProps={outerAnimatedProps}
              d={pathFromPoints(flatPoints, center, 1)}
              fill="none"
              stroke="#C4B5FD"
              strokeOpacity={0.92}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <AnimatedPath
              animatedProps={innerAnimatedProps}
              d={pathFromPoints(flatPoints, center, 0.52)}
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
                category={category}
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
          {CATEGORIES.map((category, index) => {
            const item = normalized[index];
            const color = colorForCategory(category);
            const badge = point(center, badgeRadius, angles[index]);
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
                  <LucideIcon name={CATEGORY_ICONS[category]} size={21} color={color} strokeWidth={2.2} />
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[styles.categoryName, { left: badge.x - 40, top: badge.y + 29, color: colors.textSecondary }]}
                >
                  {CATEGORY_LABELS[category]}
                </Text>
                <Text style={[styles.categoryValue, { left: badge.x - 40, top: badge.y + 43, color }]}>{item.xp}</Text>
              </View>
            );
          })}
          {pulseIndex >= 0 ? (
            <RadarPulse
              x={points[pulseIndex].x}
              y={points[pulseIndex].y}
              color={colorForCategory(CATEGORIES[pulseIndex])}
              progress={pulse}
            />
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

function RadarVertex({
  category,
  index,
  fromPoints,
  toPoints,
  progress,
  color,
  backgroundColor,
}: {
  category: Category;
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
    <G key={category}>
      <AnimatedCircle animatedProps={animatedProps} r={12} fill={color} fillOpacity={0.16} />
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
  return from[offset] + (to[offset] - from[offset]) * progress;
}

function interpolateFlat(from: number[], to: number[], progress: number) {
  'worklet';
  const result: number[] = [];
  for (let index = 0; index < from.length; index += 1) {
    result[index] = from[index] + (to[index] - from[index]) * progress;
  }
  return result;
}

function interpolatePath(from: number[], to: number[], progress: number, center: number, factor: number) {
  'worklet';
  const flat = interpolateFlat(from, to, progress);
  if (flat.length === 0) return '';
  let result = `M ${(center + (flat[0] - center) * factor).toFixed(1)},${(center + (flat[1] - center) * factor).toFixed(1)}`;
  for (let index = 2; index < flat.length; index += 2) {
    result += ` L ${(center + (flat[index] - center) * factor).toFixed(1)},${(center + (flat[index + 1] - center) * factor).toFixed(1)}`;
  }
  return `${result} Z`;
}

function pathFromPoints(flat: number[], center: number, factor: number) {
  if (flat.length === 0) return '';
  let result = `M ${(center + (flat[0] - center) * factor).toFixed(1)},${(center + (flat[1] - center) * factor).toFixed(1)}`;
  for (let index = 2; index < flat.length; index += 2) {
    result += ` L ${(center + (flat[index] - center) * factor).toFixed(1)},${(center + (flat[index + 1] - center) * factor).toFixed(1)}`;
  }
  return `${result} Z`;
}

function point(center: number, radius: number, angle: number): Point {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function serializePoints(points: Point[]) {
  return points.map(item => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
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
    width: 80,
    fontFamily: 'Nunito',
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  categoryValue: {
    position: 'absolute',
    width: 80,
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

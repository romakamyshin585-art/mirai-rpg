import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Svg, Path, Circle, Line, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS, SPACING } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RADAR_SIZE = Math.min(SCREEN_WIDTH - 48, 320);
const CENTER = RADAR_SIZE / 2;
const MAX_RADIUS = CENTER - 24;
const AXES = 5;
const ANGLE_OFFSET = -Math.PI / 2;

export interface RadarData {
  category: Category;
  value: number;
  xp: number;
  questsCompleted: number;
  weeklyChange: number;
}

export interface RadarChartProps {
  data: RadarData[];
  animated?: boolean;
  interactive?: boolean;
  onCategoryPress?: (category: Category) => void;
}

const AXIS_ANGLES = CATEGORIES.map((_, i) => ANGLE_OFFSET + (i / AXES) * 2 * Math.PI);
const GRID_LEVELS = 4;
const GRID_RADII = Array.from({ length: GRID_LEVELS }, (_, i) => MAX_RADIUS * ((i + 1) / GRID_LEVELS));
const LABEL_RADIUS = MAX_RADIUS + 28;

function polarToCartesian(center: number, radius: number, angle: number) {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function getPolygonPoints(values: number[], maxRadius: number, center: number) {
  return values.map((value, i) => polarToCartesian(center, maxRadius * value, AXIS_ANGLES[i]));
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') + ' Z';
}

const GRID_POINTS = GRID_RADII.map((radius) => getPolygonPoints(Array(AXES).fill(1), radius, CENTER));
const AXIS_END_POINTS = AXIS_ANGLES.map((angle) => polarToCartesian(CENTER, MAX_RADIUS + 4, angle));
const LABEL_POINTS = AXIS_ANGLES.map((angle) => polarToCartesian(CENTER, LABEL_RADIUS, angle));

export function RadarChart({ data, interactive = true, onCategoryPress }: RadarChartProps) {
  const { colors, typographyStylesheet } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const normalizedData = useMemo(
    () => CATEGORIES.map((category) => data.find((item) => item.category === category) ?? {
      category,
      value: 0,
      xp: 0,
      questsCompleted: 0,
      weeklyChange: 0,
    }),
    [data],
  );
  const values = useMemo(() => normalizedData.map((item) => item.value), [normalizedData]);
  const points = useMemo(() => getPolygonPoints(values, MAX_RADIUS, CENTER), [values]);
  const selectedData = selectedCategory
    ? normalizedData.find((item) => item.category === selectedCategory) ?? null
    : null;

  const handleCategoryPress = useCallback((category: Category) => {
    if (!interactive) return;
    setSelectedCategory((current) => current === category ? null : category);
    onCategoryPress?.(category);
  }, [interactive, onCategoryPress]);

  const categoryColor = (category: Category) => {
    const key = `cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors;
    return colors[key] || colors.accent;
  };

  return (
    <View style={styles.container}>
      <View style={styles.radarWrapper}>
        <Svg width={RADAR_SIZE} height={RADAR_SIZE} style={styles.radarSvg}>
          <G>
            {GRID_POINTS.map((levelPoints, levelIndex) => (
              <Path
                key={`grid-${levelIndex}`}
                d={pointsToPath(levelPoints)}
                fill="none"
                stroke="#1E2128"
                strokeWidth={StyleSheet.hairlineWidth}
                opacity={0.8}
              />
            ))}
            {CATEGORIES.map((category, i) => {
              const outerPoint = AXIS_END_POINTS[i];
              return (
                <Line
                  key={`axis-${category}`}
                  x1={CENTER}
                  y1={CENTER}
                  x2={outerPoint.x}
                  y2={outerPoint.y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              );
            })}
          </G>
          <Path d={pointsToPath(points)} fill={colors.accent} opacity={0.12} />
          <Path d={pointsToPath(points)} fill="none" stroke={colors.accent} strokeWidth={2} />
          {CATEGORIES.map((category, i) => {
            const point = points[i];
            const color = categoryColor(category);
            const selected = selectedCategory === category;
            return (
              <Circle
                key={`vertex-${category}`}
                cx={point.x}
                cy={point.y}
                r={selected ? 8 : 6}
                fill={color}
                stroke={colors.bg}
                strokeWidth={2}
                onPress={() => handleCategoryPress(category)}
              />
            );
          })}
          <G>
            {CATEGORIES.map((category, i) => {
              const point = LABEL_POINTS[i];
              return (
                <SvgText
                  key={`label-${category}`}
                  x={point.x}
                  y={point.y}
                  textAnchor="middle"
                  fill={colors.textSecondary}
                  fontSize={typographyStylesheet.caption.fontSize}
                  fontWeight="500"
                >
                  {CATEGORY_LABELS[category]}
                </SvgText>
              );
            })}
          </G>
        </Svg>

        {selectedData && (
          <View style={styles.infoPanel}>
            <View style={styles.infoContent}>
              <Text style={[typographyStylesheet.section, { color: categoryColor(selectedData.category) }]}>
                {CATEGORY_LABELS[selectedData.category].toUpperCase()}
              </Text>
              <View style={styles.infoRow}>
                <Text style={[typographyStylesheet.numeric, { color: colors.accent }]}>{selectedData.xp} XP</Text>
                <View style={styles.infoDivider} />
                <Text style={[typographyStylesheet.caption, { color: colors.textSecondary }]}>
                  {selectedData.questsCompleted} квестов
                </Text>
                <View style={styles.infoDivider} />
                <Text style={[typographyStylesheet.caption, { color: selectedData.weeklyChange >= 0 ? colors.success : colors.danger }]}>
                  {selectedData.weeklyChange >= 0 ? '+' : ''}{selectedData.weeklyChange}% за период
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: RADAR_SIZE,
    alignItems: 'center',
  },
  radarWrapper: {
    width: RADAR_SIZE,
    minHeight: RADAR_SIZE,
    borderRadius: RADAR_SIZE / 2,
  },
  radarSvg: {
    width: RADAR_SIZE,
    height: RADAR_SIZE,
  },
  infoPanel: {
    width: '100%',
    marginTop: SPACING.lg,
    borderRadius: 16,
    backgroundColor: '#23262E',
    borderWidth: 1,
    borderColor: '#1E2128',
    overflow: 'hidden',
  },
  infoContent: {
    padding: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  infoDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1E2128',
    marginHorizontal: SPACING.sm,
  },
});

export default RadarChart;

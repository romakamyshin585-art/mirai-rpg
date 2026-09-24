import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line, Path, Svg, Text as SvgText } from 'react-native-svg';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS, useTheme } from '../theme';

export type RadarData = {
  category: Category;
  value: number;
  xp: number;
  questsCompleted: number;
  weeklyChange: number;
};

type RadarChartProps = {
  data: RadarData[];
  animated?: boolean;
  interactive?: boolean;
  onCategoryPress?: (category: Category) => void;
};

const AXES = 5;
const ANGLE_OFFSET = -Math.PI / 2;
const GRID_LEVELS = 4;

export function RadarChart({ data, interactive = true, onCategoryPress }: RadarChartProps) {
  const { colors, typographyStylesheet } = useTheme();
  const [width, setWidth] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const size = width > 0 ? Math.min(width, 300) : 240;
  const center = size / 2;
  const maxRadius = Math.max(42, center - 40);
  const labelRadius = maxRadius + 22;
  const angles = useMemo(
    () => CATEGORIES.map((_, index) => ANGLE_OFFSET + (index / AXES) * 2 * Math.PI),
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
  const polygonPath = useMemo(
    () => pointsToPath(normalized.map(item => point(center, maxRadius * item.value, angles[CATEGORIES.indexOf(item.category)]))),
    [angles, center, maxRadius, normalized],
  );
  const selected = selectedCategory ? normalized.find(item => item.category === selectedCategory) ?? null : null;

  const categoryColor = useCallback((category: Category) => {
    const key = `cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors;
    return colors[key] ?? colors.accent;
  }, [colors]);

  const selectCategory = (category: Category) => {
    if (!interactive) return;
    setSelectedCategory(current => current === category ? null : category);
    onCategoryPress?.(category);
  };

  return (
    <View
      accessible
      accessibilityLabel="Диаграмма характеристик персонажа"
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={styles.container}
    >
      <View style={{ width: size, height: size, alignSelf: 'center' }}>
        <Svg width={size} height={size}>
          <G>
            {Array.from({ length: GRID_LEVELS }, (_, index) => {
              const radius = maxRadius * ((index + 1) / GRID_LEVELS);
              return (
                <Path
                  key={`grid-${index}`}
                  d={pointsToPath(angles.map(angle => point(center, radius, angle)))}
                  fill="none"
                  stroke={colors.borderSubtle}
                  strokeWidth={StyleSheet.hairlineWidth}
                />
              );
            })}
            {angles.map((angle, index) => {
              const end = point(center, maxRadius + 4, angle);
              return (
                <Line
                  key={`axis-${CATEGORIES[index]}`}
                  x1={center}
                  y1={center}
                  x2={end.x}
                  y2={end.y}
                  stroke={colors.borderSubtle}
                  strokeWidth={1}
                />
              );
            })}
          </G>
          <Path d={polygonPath} fill={colors.accent} opacity={0.12} />
          <Path d={polygonPath} fill="none" stroke={colors.accent} strokeWidth={2.2} />
          {CATEGORIES.map((category, index) => {
            const item = normalized[index];
            const vertex = point(center, maxRadius * item.value, angles[index]);
            const active = selectedCategory === category;
            return (
              <Circle
                key={category}
                cx={vertex.x}
                cy={vertex.y}
                r={active ? 7 : 5.5}
                fill={categoryColor(category)}
                stroke={colors.bg}
                strokeWidth={2}
                onPress={() => selectCategory(category)}
              />
            );
          })}
          <G>
            {angles.map((angle, index) => {
              const label = point(center, labelRadius, angle);
              return (
                <SvgText
                  key={CATEGORIES[index]}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={colors.textSecondary}
                  fontSize={typographyStylesheet.caption.fontSize}
                  fontWeight="600"
                >
                  {CATEGORY_LABELS[CATEGORIES[index]]}
                </SvgText>
              );
            })}
          </G>
        </Svg>
      </View>
      {selected ? (
        <View style={[styles.info, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          <Text style={[typographyStylesheet.bodyStrong, { color: categoryColor(selected.category) }]}>
            {CATEGORY_LABELS[selected.category]}
          </Text>
          <Text style={[typographyStylesheet.caption, { color: colors.textMuted }]}>
            {selected.xp} XP · {selected.questsCompleted} квестов
          </Text>
        </View>
      ) : (
        <Text style={[styles.hint, typographyStylesheet.caption, { color: colors.textMuted }]}>Нажми на ось, чтобы увидеть значение</Text>
      )}
    </View>
  );
}

function point(center: number, radius: number, angle: number) {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  return points.map((item, index) => `${index === 0 ? 'M' : 'L'} ${item.x.toFixed(1)} ${item.y.toFixed(1)}`).join(' ') + ' Z';
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center' },
  info: { width: '100%', marginTop: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  hint: { marginTop: 2, textAlign: 'center' },
});

export default RadarChart;

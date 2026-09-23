/**
 * RadarChart — Optimized 5-axis interactive radar.
 * Performance improvements:
 * - Memoized geometry calculations
 * - Fixed JSON.stringify in deps
 * - Removed useTheme() call in render
 * - useAnimatedStyle called at top level (Rules of Hooks compliant)
 */

import React, { useMemo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSharedValue,
  useDerivedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
  Easing,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Path, Circle, Line, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS } from '../theme';
import { SPACING } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

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

// Pre-computed constants
const AXIS_ANGLES = CATEGORIES.map((_, i) => ANGLE_OFFSET + (i / AXES) * 2 * Math.PI);
const GRID_LEVELS = 4;
const GRID_RADII = Array.from({ length: GRID_LEVELS }, (_, i) => MAX_RADIUS * ((i + 1) / GRID_LEVELS));
const LABEL_RADIUS = MAX_RADIUS + 28;

function polarToCartesian(center: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function getPolygonPoints(values: number[], maxRadius: number, center: number) {
  return values.map((value, i) => {
    const radius = maxRadius * value;
    return polarToCartesian(center, radius, AXIS_ANGLES[i]);
  });
}

// Pre-computed grid points (static)
const GRID_POINTS = GRID_RADII.map(radius => 
  getPolygonPoints(Array(AXES).fill(1), radius, CENTER)
);

const AXIS_END_POINTS = AXIS_ANGLES.map(angle => 
  polarToCartesian(CENTER, MAX_RADIUS + 4, angle)
);

const LABEL_POINTS = AXIS_ANGLES.map(angle => 
  polarToCartesian(CENTER, LABEL_RADIUS, angle)
);

export function RadarChart({
  data,
  animated = true,
  interactive = true,
  onCategoryPress,
}: RadarChartProps) {
  const { colors, motion, typographyStylesheet } = useTheme();
  const { numeric, numericDisplay, caption, section } = typographyStylesheet;
  
  const selectedCategory = useSharedValue<Category | null>(null);
  const hoverCategory = useSharedValue<Category | null>(null);
  const morphProgress = useSharedValue(0);
  const entranceProgress = useSharedValue(0);
  
  const sortedData = useMemo(() => {
    return CATEGORIES.map(cat => data.find(d => d.category === cat) || { 
      category: cat, value: 0, xp: 0, questsCompleted: 0, weeklyChange: 0 
    });
  }, [data]);

  const currentValues = useMemo(() => sortedData.map(d => d.value), [sortedData]);
  const targetValues = useMemo(() => sortedData.map(d => d.value), [sortedData]);

  // Stable reference for targetValues comparison
  const targetValuesRef = useRef(targetValues);
  const valuesChanged = useMemo(() => {
    const prev = targetValuesRef.current;
    const curr = targetValues;
    if (prev.length !== curr.length) return true;
    return curr.some((v, i) => v !== prev[i]);
  }, [targetValues]);
  
  if (valuesChanged) {
    targetValuesRef.current = targetValues;
  }

  React.useEffect(() => {
    if (animated) {
      entranceProgress.value = withSpring(1, { damping: 20, stiffness: 150 });
    } else {
      entranceProgress.value = 1;
    }
  }, [animated]);

  const morphValues = useDerivedValue(() => {
    return currentValues.map((current, i) => {
      const target = targetValues[i] ?? 0;
      if (animated) {
        return interpolate(morphProgress.value, [0, 1], [current, target], Extrapolate.CLAMP);
      }
      return target;
    });
  }, [currentValues, targetValues, animated, morphProgress]);

  React.useEffect(() => {
    if (animated && valuesChanged) {
      morphProgress.value = withTiming(1, { duration: motion.durations.normal, easing: Easing.out(Easing.cubic) }, () => {
        morphProgress.value = 0;
      });
    }
  }, [valuesChanged, animated, motion.durations.normal]);

  const handleCategoryPress = useCallback((category: Category) => {
    if (!interactive) return;
    selectedCategory.value = selectedCategory.value === category ? null : category;
    if (onCategoryPress) onCategoryPress(category);
  }, [interactive, onCategoryPress]);

  const polygonPath = useDerivedValue(() => {
    const points = morphValues.value.map((value, i) => {
      const radius = MAX_RADIUS * value * entranceProgress.value;
      return polarToCartesian(CENTER, radius, AXIS_ANGLES[i]);
    });
    return points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ') + ' Z';
  }, [morphValues, entranceProgress]);

  const polygonOpacity = useDerivedValue(() => {
    return selectedCategory.value ? 0.15 : 0.12;
  }, [selectedCategory]);

  // ============================================================
  // useAnimatedStyle — MUST be called at top level (Rules of Hooks)
  // ============================================================
  
  // Vertex animations (5)
  const vertexAnimStyle0 = useAnimatedStyle(() => {
    const value = morphValues.value[0] ?? 0;
    const radius = MAX_RADIUS * value * entranceProgress.value;
    const point = polarToCartesian(CENTER, radius, AXIS_ANGLES[0]);
    const isSelected = selectedCategory.value === CATEGORIES[0];
    const isHovered = hoverCategory.value === CATEGORIES[0];
    const scale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 18, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const vertexAnimStyle1 = useAnimatedStyle(() => {
    const value = morphValues.value[1] ?? 0;
    const radius = MAX_RADIUS * value * entranceProgress.value;
    const point = polarToCartesian(CENTER, radius, AXIS_ANGLES[1]);
    const isSelected = selectedCategory.value === CATEGORIES[1];
    const isHovered = hoverCategory.value === CATEGORIES[1];
    const scale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 18, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const vertexAnimStyle2 = useAnimatedStyle(() => {
    const value = morphValues.value[2] ?? 0;
    const radius = MAX_RADIUS * value * entranceProgress.value;
    const point = polarToCartesian(CENTER, radius, AXIS_ANGLES[2]);
    const isSelected = selectedCategory.value === CATEGORIES[2];
    const isHovered = hoverCategory.value === CATEGORIES[2];
    const scale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 18, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const vertexAnimStyle3 = useAnimatedStyle(() => {
    const value = morphValues.value[3] ?? 0;
    const radius = MAX_RADIUS * value * entranceProgress.value;
    const point = polarToCartesian(CENTER, radius, AXIS_ANGLES[3]);
    const isSelected = selectedCategory.value === CATEGORIES[3];
    const isHovered = hoverCategory.value === CATEGORIES[3];
    const scale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 18, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const vertexAnimStyle4 = useAnimatedStyle(() => {
    const value = morphValues.value[4] ?? 0;
    const radius = MAX_RADIUS * value * entranceProgress.value;
    const point = polarToCartesian(CENTER, radius, AXIS_ANGLES[4]);
    const isSelected = selectedCategory.value === CATEGORIES[4];
    const isHovered = hoverCategory.value === CATEGORIES[4];
    const scale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 18, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const vertexAnimStyles = [vertexAnimStyle0, vertexAnimStyle1, vertexAnimStyle2, vertexAnimStyle3, vertexAnimStyle4];

  // Axis line animations (5)
  const axisLineAnim0 = useAnimatedStyle(() => {
    const isSelected = selectedCategory.value === CATEGORIES[0];
    const isHovered = hoverCategory.value === CATEGORIES[0];
    return {
      opacity: withTiming(isSelected ? 1 : isHovered ? 0.8 : 0.3, { duration: motion.durations.fast }),
      strokeWidth: withTiming(isSelected ? 2 : 1, { duration: motion.durations.fast }),
    };
  });

  const axisLineAnim1 = useAnimatedStyle(() => {
    const isSelected = selectedCategory.value === CATEGORIES[1];
    const isHovered = hoverCategory.value === CATEGORIES[1];
    return {
      opacity: withTiming(isSelected ? 1 : isHovered ? 0.8 : 0.3, { duration: motion.durations.fast }),
      strokeWidth: withTiming(isSelected ? 2 : 1, { duration: motion.durations.fast }),
    };
  });

  const axisLineAnim2 = useAnimatedStyle(() => {
    const isSelected = selectedCategory.value === CATEGORIES[2];
    const isHovered = hoverCategory.value === CATEGORIES[2];
    return {
      opacity: withTiming(isSelected ? 1 : isHovered ? 0.8 : 0.3, { duration: motion.durations.fast }),
      strokeWidth: withTiming(isSelected ? 2 : 1, { duration: motion.durations.fast }),
    };
  });

  const axisLineAnim3 = useAnimatedStyle(() => {
    const isSelected = selectedCategory.value === CATEGORIES[3];
    const isHovered = hoverCategory.value === CATEGORIES[3];
    return {
      opacity: withTiming(isSelected ? 1 : isHovered ? 0.8 : 0.3, { duration: motion.durations.fast }),
      strokeWidth: withTiming(isSelected ? 2 : 1, { duration: motion.durations.fast }),
    };
  });

  const axisLineAnim4 = useAnimatedStyle(() => {
    const isSelected = selectedCategory.value === CATEGORIES[4];
    const isHovered = hoverCategory.value === CATEGORIES[4];
    return {
      opacity: withTiming(isSelected ? 1 : isHovered ? 0.8 : 0.3, { duration: motion.durations.fast }),
      strokeWidth: withTiming(isSelected ? 2 : 1, { duration: motion.durations.fast }),
    };
  });

  const axisLineAnims = [axisLineAnim0, axisLineAnim1, axisLineAnim2, axisLineAnim3, axisLineAnim4];

  // Axis label animations (5)
  const axisLabelAnim0 = useAnimatedStyle(() => {
    const point = LABEL_POINTS[0];
    const isSelected = selectedCategory.value === CATEGORIES[0];
    const isHovered = hoverCategory.value === CATEGORIES[0];
    const scale = isSelected || isHovered ? 1.1 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 20, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const axisLabelAnim1 = useAnimatedStyle(() => {
    const point = LABEL_POINTS[1];
    const isSelected = selectedCategory.value === CATEGORIES[1];
    const isHovered = hoverCategory.value === CATEGORIES[1];
    const scale = isSelected || isHovered ? 1.1 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 20, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const axisLabelAnim2 = useAnimatedStyle(() => {
    const point = LABEL_POINTS[2];
    const isSelected = selectedCategory.value === CATEGORIES[2];
    const isHovered = hoverCategory.value === CATEGORIES[2];
    const scale = isSelected || isHovered ? 1.1 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 20, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const axisLabelAnim3 = useAnimatedStyle(() => {
    const point = LABEL_POINTS[3];
    const isSelected = selectedCategory.value === CATEGORIES[3];
    const isHovered = hoverCategory.value === CATEGORIES[3];
    const scale = isSelected || isHovered ? 1.1 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 20, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const axisLabelAnim4 = useAnimatedStyle(() => {
    const point = LABEL_POINTS[4];
    const isSelected = selectedCategory.value === CATEGORIES[4];
    const isHovered = hoverCategory.value === CATEGORIES[4];
    const scale = isSelected || isHovered ? 1.1 : 1;
    return {
      transform: [
        { translateX: point.x - CENTER },
        { translateY: point.y - CENTER },
        { scale: withSpring(scale, { damping: 20, stiffness: 200 }) },
      ],
      opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    };
  });

  const axisLabelAnims = [axisLabelAnim0, axisLabelAnim1, axisLabelAnim2, axisLabelAnim3, axisLabelAnim4];

  const infoPanelAnim = useAnimatedStyle(() => {
    const selected = selectedCategory.value;
    if (!selected) return { opacity: 0, height: 0, transform: [{ translateY: 12 }] };
    
    return {
      opacity: withTiming(1, { duration: motion.durations.fast }),
      height: 72,
      transform: [{ translateY: withSpring(0, { damping: 20, stiffness: 180 }) }],
    };
  }, [motion.durations.fast]);

  const selectedData = useMemo(() => {
    if (!selectedCategory.value) return null;
    return sortedData.find(d => d.category === selectedCategory.value) || null;
  }, [sortedData, selectedCategory]);

  return (
    <View style={styles.container}>
      <View style={styles.radarWrapper}>
        <View style={styles.radarSvg}>
          <G>
            {GRID_POINTS.map((levelPoints, levelIndex) => (
              <Path
                key={'grid-' + levelIndex}
                d={levelPoints.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ') + ' Z'}
                fill="none"
                stroke="#1E2128"
                strokeWidth={StyleSheet.hairlineWidth}
                opacity={entranceProgress.value}
              />
            ))}
            
            {CATEGORIES.map((_, i) => {
              const outerPoint = AXIS_END_POINTS[i];
              const lineStyle = axisLineAnims[i];
              return (
                <AnimatedLine
                  key={'axis-' + i}
                  x1={CENTER}
                  y1={CENTER}
                  x2={outerPoint.x}
                  y2={outerPoint.y}
                  stroke={colors.catHealth}
                  opacity={lineStyle.opacity}
                  strokeWidth={lineStyle.strokeWidth}
                />
              );
            })}
          </G>

          <AnimatedPath
            d={polygonPath.value}
            fill={colors.accent}
            opacity={polygonOpacity.value}
          />

          <AnimatedPath
            d={polygonPath.value}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2}
          />

          {CATEGORIES.map((cat, i) => (
            <TouchableOpacity
              key={'vertex-' + i}
              onPress={() => handleCategoryPress(cat)}
              onPressIn={() => { hoverCategory.value = cat; }}
              onPressOut={() => { hoverCategory.value = null; }}
              activeOpacity={1}
              style={styles.vertexHitArea}
            >
              <AnimatedCircle
                cx={CENTER}
                cy={CENTER}
                r={6}
                fill={colors['cat' + cat.charAt(0).toUpperCase() + cat.slice(1) as keyof typeof colors] || colors.accent}
                stroke={colors.bg}
                strokeWidth={2}
                transform={vertexAnimStyles[i].transform}
                opacity={vertexAnimStyles[i].opacity}
              />
            </TouchableOpacity>
          ))}

          <G>
            {CATEGORIES.map((cat, i) => {
              const point = LABEL_POINTS[i];
              const labelAnim = axisLabelAnims[i];
              return (
                <AnimatedSvgText
                  key={'label-' + i}
                  transform={[
                    { translateX: point.x - CENTER },
                    { translateY: point.y - CENTER },
                    ...labelAnim.transform,
                  ]}
                  opacity={labelAnim.opacity}
                  textAnchor="middle"
                  fill={colors.textSecondary}
                  fontSize={caption.fontSize}
                  fontWeight="500"
                  fontFamily={typographyStylesheet.body.fontFamily}
                >
                  {CATEGORY_LABELS[cat]}
                </AnimatedSvgText>
              );
            })}
          </G>
        </View>

        <Animated.View style={[styles.infoPanel, infoPanelAnim]}>
          {selectedData && (
            <View style={styles.infoContent}>
              <Text style={{ ...section, color: colors['cat' + selectedData.category.charAt(0).toUpperCase() + selectedData.category.slice(1) as keyof typeof colors] || colors.accent }}>
                {CATEGORY_LABELS[selectedData.category].toUpperCase()}
              </Text>
              <View style={styles.infoRow}>
                <Text style={{ ...numericDisplay, color: colors.accent }}>{selectedData.xp} XP</Text>
                <View style={styles.infoDivider} />
                <Text style={{ ...numeric, color: colors.textSecondary }}>{selectedData.questsCompleted} \u043a\u0432\u0435\u0441\u0442\u043e\u0432</Text>
                <View style={styles.infoDivider} />
                <Text style={[
                  numeric, 
                  { color: selectedData.weeklyChange >= 0 ? colors.success : colors.danger }
                ]}>
                  {selectedData.weeklyChange >= 0 ? '+' : ''}{selectedData.weeklyChange}% \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
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
    height: RADAR_SIZE,
    borderRadius: RADAR_SIZE / 2,
  },
  radarSvg: {
    width: RADAR_SIZE,
    height: RADAR_SIZE,
  },
  vertexHitArea: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    top: CENTER - 16,
    left: CENTER - 16,
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
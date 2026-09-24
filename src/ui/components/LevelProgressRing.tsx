import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';
import { levelProgress } from '../../domain/level';
import { duration, spring } from '../motion';
import { useReducedMotion } from '../motion';
import { useTheme } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type LevelProgressRingProps = {
  xp: number;
  size?: number;
  strokeWidth?: number;
  showLevel?: boolean;
  celebrate?: boolean;
};

export function LevelProgressRing({ xp, size = 80, strokeWidth = 6, showLevel = true, celebrate = false }: LevelProgressRingProps) {
  const { colors, typographyStylesheet } = useTheme();
  const reduced = useReducedMotion();
  const progress = levelProgress(xp);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.max(0, Math.min(1, progress.level_progress_pct / 100));
  const value = useSharedValue(target);
  const glow = useSharedValue(0);

  useEffect(() => {
    value.value = reduced
      ? withTiming(target, { duration: duration.standard })
      : withSpring(target, spring.card);
    if (celebrate) {
      glow.value = reduced
        ? withDelay(60, withSequence(withTiming(1, { duration: duration.reducedMotion }), withDelay(220, withTiming(0, { duration: duration.reducedMotion }))))
        : withDelay(60, withSequence(withTiming(1, { duration: duration.micro }), withDelay(220, withTiming(0, { duration: duration.standard }))));
    }
  }, [celebrate, glow, reduced, target, value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - value.value),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 0.9 + glow.value * 0.25 }],
  }));

  return (
    <View
      accessible
      accessibilityLabel={`Уровень ${progress.level}, ${progress.level_progress_pct} процентов до следующего`}
      style={[styles.container, { width: size, height: size }]}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.surfaceFloating}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.content}>
        <Text
          style={[
            typographyStylesheet.numeric,
            { color: showLevel ? colors.text : colors.accent, fontSize: showLevel ? size * 0.25 : size * 0.22 },
          ]}
        >
          {showLevel ? `Lv.${progress.level}` : `${progress.level_progress_pct}%`}
        </Text>
        {showLevel ? (
          <Text style={[typographyStylesheet.caption, { color: colors.textMuted, fontSize: Math.max(9, size * 0.1) }]}>
            {progress.level_progress_pct}%
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#F5A524' },
  svg: { position: 'absolute', top: 0, left: 0 },
  content: { alignItems: 'center', justifyContent: 'center' },
});

export default LevelProgressRing;

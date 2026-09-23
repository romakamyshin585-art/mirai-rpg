/**
 * LevelProgressRing — Animated circular progress for level/XP.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSharedValue, withSpring, useAnimatedProps } from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';
import { useTheme } from '../theme';
import { levelProgress } from '../../domain/level';
import Animated from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface LevelProgressRingProps {
  xp: number;
  size?: number;
  strokeWidth?: number;
  showLevel?: boolean;
}

export function LevelProgressRing({ xp, size = 80, strokeWidth = 6, showLevel = true }: LevelProgressRingProps) {
  const { colors } = useTheme();
  const { numericDisplay, caption } = useTheme().typographyStylesheet;
  const progress = levelProgress(xp);
  const pct = progress.level_progress_pct / 100;
  
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const entranceProgress = useSharedValue(0);
  const progressAnim = useSharedValue(0);

  React.useEffect(() => {
    entranceProgress.value = withSpring(1, { damping: 22, stiffness: 180 });
    progressAnim.value = withSpring(pct, { damping: 20, stiffness: 150 });
  }, [pct]);

  const circleProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference * (1 - progressAnim.value) * entranceProgress.value;
    return {
      strokeDashoffset,
      opacity: entranceProgress.value,
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1E2128"
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          {...circleProps}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F5A524"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform={[{ rotate: '-90deg' }]}
        />
      </Svg>
      
      <View style={styles.centerContent}>
        {showLevel && (
          <>
            <Text style={{ ...useTheme().typographyStylesheet.numericDisplay, color: colors.text, fontSize: size * 0.28 }}>Lv.{progress.level}</Text>
            <Text style={{ ...useTheme().typographyStylesheet.caption, color: colors.textMuted, marginTop: -4 }}>{progress.level_progress_pct}%</Text>
          </>
        )}
        {!showLevel && (
          <Text style={{ ...useTheme().typographyStylesheet.numericDisplay, color: colors.accent, fontSize: size * 0.22 }}>{Math.round(pct * 100)}%</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LevelProgressRing;
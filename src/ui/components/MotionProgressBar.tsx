import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { duration, spring } from '../motion';
import { useReducedMotion } from '../motion';

type MotionProgressBarProps = {
  value: number;
  trackColor: string;
  fillColor: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function MotionProgressBar({
  value,
  trackColor,
  fillColor,
  height = 7,
  style,
  accessibilityLabel,
}: MotionProgressBarProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(normalize(value));
  const normalized = normalize(value);

  useEffect(() => {
    progress.value = reduced
      ? withTiming(normalized, { duration: duration.standard })
      : withSpring(normalized, spring.card);
  }, [normalized, progress, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(normalized * 100) }}
      style={[styles.track, { height, backgroundColor: trackColor }, style]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: fillColor }, fillStyle]} />
    </View>
  );
}

function normalize(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: 999, overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 999 },
});

export default MotionProgressBar;

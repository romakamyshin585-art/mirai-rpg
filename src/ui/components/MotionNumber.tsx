import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration } from '../motion';
import { useReducedMotion } from '../motion';

type MotionNumberProps = {
  value: number;
  style?: StyleProp<TextStyle>;
  suffix?: string;
  formatter?: (value: number) => string;
};

export function MotionNumber({ value, style, suffix = '', formatter }: MotionNumberProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: reduced ? duration.reducedMotion : duration.standard,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduced, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ scale: 0.96 + progress.value * 0.04 }],
  }));

  const text = formatter ? formatter(value) : String(value);

  return <Animated.Text style={[styles.number, animatedStyle, style]}>{text}{suffix}</Animated.Text>;
}

const styles = StyleSheet.create({
  number: { includeFontPadding: false },
});

export default MotionNumber;

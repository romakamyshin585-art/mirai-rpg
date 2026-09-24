import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { duration, spring, stagger } from '../motion';
import { useReducedMotion } from '../motion';

type MotionRevealProps = {
  children: ReactNode;
  index?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

export function MotionReveal({ children, index = 0, distance = 18, style }: MotionRevealProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const delay = Math.min(index, stagger.maxStaggeredItems - 1) * stagger.itemDelay;

  useEffect(() => {
    const target = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withSpring(1, spring.card);
    progress.value = withDelay(delay, target);
  }, [delay, progress, reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolate.CLAMP),
    transform: reduced ? [] : [{ translateY: interpolate(progress.value, [0, 1], [distance, 0], Extrapolate.CLAMP) }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export default MotionReveal;

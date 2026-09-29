import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration } from '../motion';
import { useReducedMotion } from '../motion';

type MotionNumberProps = {
  value: number;
  style?: StyleProp<TextStyle>;
  suffix?: string;
  formatter?: (value: number) => string;
};

/**
 * A number that animates in whenever it changes.
 *
 * Two things here are load-bearing, and both were wrong at once.
 *
 * **The animation is cancelled on unmount.** `progress` is bound to an
 * `Animated.Text` through `useAnimatedStyle`, and that mapper runs on the UI
 * thread. If the component goes away while a `withTiming` is still in flight,
 * the mapper keeps writing to a view tag React has already removed, and
 * Reanimated throws "Cannot find host instance for this component" over on
 * the UI thread. A throw over there is not a render error, so no error
 * boundary sees it: the window stays up and the screen goes blank, with
 * nothing in logcat and no way out short of reinstalling.
 *
 * **The caller must not key this by `value`.** The obvious way to replay the
 * animation on a new number is `key={`today-xp-${xp}`}`, which turns a value
 * change into an unmount plus a mount - so the outgoing instance is killed
 * mid-animation, which is exactly the case above. The replay is already
 * handled here: the effect depends on `value` and resets `progress` to 0
 * before starting the timing, so the same instance animates again. Home used
 * three of those keys, and completing a single quest changed all three at
 * once, which is why the Home tab went blank after a quest and nowhere else.
 */
export function MotionNumber({ value, style, suffix = '', formatter }: MotionNumberProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    // Back to 0 first, so a changed value replays the entrance on this same
    // instance instead of needing a remount to restart from scratch.
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduced ? duration.reducedMotion : duration.standard,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(progress);
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

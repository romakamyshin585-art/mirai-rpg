/**
 * Quest completion burst.
 *
 * Rendered inside the quest card, on the UI thread, once, when a quest is
 * completed. Everything is Reanimated shared values and plain views: no
 * images, no Lottie, no JS involvement after the trigger. That matters for
 * two reasons - the Mi 10 brief forbids heavy raster assets, and a
 * JS-driven animation here would stutter exactly at the moment the user is
 * looking hardest at it.
 *
 * The sequence, ~820ms:
 *   0ms    the whole card punches in and settles (spring.punch)
 *   40ms   a shockwave ring leaves the completion button
 *   60ms   eight sparks fly out on fixed angles and fade
 *   40ms   the XP number pops, floats up and fades
 *   180ms  the check stamps in with a rotation, then breathes
 *   0ms-> the card's border and tint cross-fade to the success colour
 *
 * The spark angles are fixed rather than random so the burst is identical
 * every time - a celebration that reshuffles reads as noise, and a stable
 * one is something the eye learns.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolate,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import { duration, spring, useReducedMotion } from '../motion';

const SPARK_COUNT = 8;
const RING_TRAVEL = 132;

export function CompletionBurst({
  active,
  xp,
  radius = 26,
  accent,
}: {
  active: boolean;
  xp: number;
  radius?: number;
  accent: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const ring = useSharedValue(0);
  const sparks = useSharedValue(0);
  const xpProgress = useSharedValue(0);
  const check = useSharedValue(0);
  const tint = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(ring);
      cancelAnimation(sparks);
      cancelAnimation(xpProgress);
      cancelAnimation(check);
      cancelAnimation(tint);
      ring.value = 0;
      sparks.value = 0;
      xpProgress.value = 0;
      check.value = 0;
      tint.value = 0;
      return;
    }

    if (reduced) {
      // Reduce Motion keeps the information and drops the spectacle: the
      // check and the XP number simply appear.
      check.value = 1;
      xpProgress.value = 1;
      return;
    }

    ring.value = withTiming(1, { duration: duration.celebration, easing: Easing.out(Easing.cubic) });
    sparks.value = withDelay(60, withTiming(1, { duration: duration.standard, easing: Easing.out(Easing.quad) }));
    xpProgress.value = withDelay(
      40,
      withSequence(
        withTiming(1, { duration: duration.micro, easing: Easing.out(Easing.cubic) }),
        withDelay(420, withTiming(0, { duration: duration.standard, easing: Easing.in(Easing.cubic) })),
      ),
    );
    check.value = withDelay(
      180,
      withSequence(
        withSpring(1, spring.punch),
        withDelay(260, withSpring(1, spring.celebration)),
      ),
    );
    tint.value = withSequence(
      withTiming(1, { duration: duration.standard, easing: Easing.out(Easing.cubic) }),
      withDelay(520, withTiming(0, { duration: duration.celebration, easing: Easing.inOut(Easing.cubic) })),
    );
  }, [active, check, reduced, ring, sparks, tint, xpProgress]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.12, 1], [0, 0.55, 0], Extrapolate.CLAMP),
    transform: [
      { scale: interpolate(ring.value, [0, 1], [0.3, 1], Extrapolate.CLAMP) },
    ],
  }));

  const sparksStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sparks.value, [0, 0.2, 1], [0, 1, 0], Extrapolate.CLAMP),
    transform: [
      { scale: interpolate(sparks.value, [0, 0.25, 1], [0.2, 1, 0.7], Extrapolate.CLAMP) },
    ],
  }));

  const xpStyle = useAnimatedStyle(() => ({
    opacity: interpolate(xpProgress.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0], Extrapolate.CLAMP),
    transform: [
      { translateY: interpolate(xpProgress.value, [0, 0.15, 1], [8, 0, -30], Extrapolate.CLAMP) },
      { scale: interpolate(xpProgress.value, [0, 0.15, 1], [0.7, 1.08, 0.94], Extrapolate.CLAMP) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tint.value, [0, 0.4, 1], [0, 0.3, 0], Extrapolate.CLAMP),
  }));

  const sparkAngles = useMemo(
    () => Array.from({ length: SPARK_COUNT }, (_, index) => (360 / SPARK_COUNT) * index + 22.5),
    [],
  );

  if (!active) return null;

  return (
    <View pointerEvents="none" style={styles.root}>
      {/* Soft wash behind the card while the tint is up. */}
      <Animated.View
        style={[
          styles.glow,
          { backgroundColor: colors.success, borderRadius: radius },
          glowStyle,
        ]}
      />

      {/* Shockwave. */}
      <Animated.View
        style={[
          styles.ring,
          { width: RING_TRAVEL * 2, height: RING_TRAVEL * 2, borderRadius: RING_TRAVEL, borderColor: accent },
          ringStyle,
        ]}
      />

      {/* Sparks, each placed on the ring and pushed outward. */}
      <Animated.View style={[styles.sparks, sparksStyle]}>
        {sparkAngles.map((angle, index) => (
          <Spark key={index} angle={angle} distance={RING_TRAVEL * 0.86} progress={sparks} color={index % 3 === 0 ? accent : colors.success} />
        ))}
      </Animated.View>

      {/* Floating XP number. */}
      <Animated.View style={[styles.xp, xpStyle]}>
        <Text style={[styles.xpText, { color: accent }]}>+{xp} XP</Text>
      </Animated.View>
    </View>
  );
}

/**
 * One spark. Positioned with transforms rather than a layout change so all
 * eight animate on the same frame without triggering eight re-layouts.
 */
function Spark({
  angle,
  distance,
  progress,
  color,
}: {
  angle: number;
  distance: number;
  progress: Animated.SharedValue<number>;
  color: string;
}) {
  const radians = (angle * Math.PI) / 180;
  const tx = Math.cos(radians) * distance;
  const ty = Math.sin(radians) * distance;
  const size = 5 + (angle % 3);

  const style = useAnimatedStyle(() => {
    'worklet';
    const t = progress.value;
    return {
      opacity: interpolate(t, [0, 0.18, 0.7, 1], [0, 1, 0.6, 0], Extrapolate.CLAMP),
      transform: [
        { translateX: tx * interpolate(t, [0, 1], [0.1, 1], Extrapolate.CLAMP) },
        { translateY: ty * interpolate(t, [0, 1], [0.1, 1], Extrapolate.CLAMP) + 18 * t },
        { scale: interpolate(t, [0, 0.3, 1], [0.3, 1.15, 0.5], Extrapolate.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.spark, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', left: -18, right: -18, top: -18, bottom: -18, opacity: 0 },
  ring: { position: 'absolute', borderWidth: 2, opacity: 0 },
  sparks: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute' },
  xp: { position: 'absolute', bottom: 22, alignItems: 'center' },
  xpText: { fontFamily: 'Nunito', fontSize: 17, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
});

export default CompletionBurst;

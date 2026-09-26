/**
 * The crystal mark — the app's identity, animated.
 *
 * ## Why this exists in-app and not on the launcher
 *
 * The brief asked for an animated 3D icon on the home screen. Android 10
 * (the Mi 10's OS) has no support for that: `AnimatedIconDrawable` and
 * themed monochrome icons arrived in API 33, MIUI 12 on Android 10 is API
 * 29, and a launcher icon there is a static PNG. There is no manifest flag
 * or library that changes this.
 *
 * So the icon ships in two forms:
 *  - the launcher icon: a rendered 3D crystal (see `tools/make_icon.py`),
 *    static, because the platform requires it;
 *  - this component: the same crystal, built from vectors and animated, so
 *    the mark is alive everywhere the app itself is — and it costs a few
 *    SVG nodes instead of a megabyte of raster frames.
 *
 * ## Cost discipline
 *
 * The spin is faked with `scaleX`, i.e. it is a 2D transform, not a 3D
 * renderer. The specular sweep is a translating gradient, not a shader.
 * Both run on the UI thread via Reanimated, and the ambient loop pauses
 * when the app is backgrounded — a perpetual `withRepeat` behind a lock
 * screen is a measurable battery cost for an animation nobody sees.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolate,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Defs, LinearGradient, Line, Polygon, RadialGradient, Stop, Svg } from 'react-native-svg';
import { useTheme } from '../theme';
import { duration, spring, useReducedMotion } from '../motion';

/**
 * Silhouette in a -1..1 box, matching the generated icon exactly. Same
 * points, same facet split — the animated mark and the launcher icon are
 * the same object, not two drawings that happen to look alike.
 */
type Pt = readonly [number, number];

const T: Pt = [0, -1];
const UR: Pt = [0.54, -0.6];
const R: Pt = [1, -0.06];
const LR: Pt = [0.6, 0.56];
const B: Pt = [0, 1];
const LL: Pt = [-0.6, 0.56];
const L: Pt = [-1, -0.06];
const UL: Pt = [-0.54, -0.6];
const ML: Pt = [-0.33, -0.02];
const MR: Pt = [0.33, -0.02];
const NL: Pt = [-0.26, 0.5];
const NR: Pt = [0.26, 0.5];
const MID: Pt = [0, 0.26];
const C: Pt = [0, -0.02];

type Facet = { points: Pt[]; color: string; opacity?: number };

function buildFacets(): Facet[] {
  return [
    // pavilion, converging on the bottom point
    { points: [B, LL, NL], color: '#3B1F6B' },
    { points: [B, NL, NR], color: '#4C1D95' },
    { points: [B, NR, LR], color: '#5B21B6' },
    { points: [B, LR, R], color: '#4C1D95' },
    // side shoulders
    { points: [ML, UL, LL, NL], color: '#3B1F6B' },
    { points: [UL, L, LL], color: '#2E1065' },
    { points: [MR, UR, LR, NR], color: '#6D28D9' },
    { points: [UR, R, LR], color: '#7C3AED' },
    // middle band
    { points: [ML, MR, MID], color: '#8B5CF6' },
    { points: [ML, MID, NL], color: '#5B21B6' },
    { points: [MR, MID, NR], color: '#6D28D9' },
    { points: [NL, NR, MID], color: '#4C1D95' },
    // crown, radiating from the top point
    { points: [T, UL, ML], color: '#7C3AED' },
    { points: [T, ML, C], color: '#8B5CF6' },
    { points: [T, C, MR], color: '#A78BFA' },
    { points: [T, MR, UR], color: '#C4B5FD' },
    { points: [T, UR, R], color: '#A78BFA' },
  ];
}

const FACETS = buildFacets();
const OUTLINE: Pt[] = [T, UR, R, LR, B, LL, L, UL, T];

export type CrystalMarkProps = {
  size?: number;
  /** Slow ambient spin. Off for small decorative instances. */
  animated?: boolean;
};

export function CrystalMark({ size = 96, animated = true }: CrystalMarkProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(false);

  const spin = useSharedValue(0);
  const sheen = useSharedValue(-0.6);
  const entrance = useSharedValue(0);
  const core = useSharedValue(0);

  // Ambient motion only while the app is in front. `AppState` rather than
  // a blind `withRepeat`: the loop is cheap, but not free, and the device
  // is a phone on battery.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!animated || reduced || !foreground) {
      cancelAnimation(spin);
      spin.value = 1;
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 7200, easing: Easing.inOut(Easing.sin) }), -1, false);
    return () => cancelAnimation(spin);
  }, [animated, foreground, reduced, spin]);

  useEffect(() => {
    if (!animated || reduced || !foreground) {
      cancelAnimation(sheen);
      sheen.value = 0.5;
      return;
    }
    sheen.value = 0;
    sheen.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    return () => cancelAnimation(sheen);
  }, [animated, foreground, reduced, sheen]);

  useEffect(() => {
    if (reduced) {
      entrance.value = 1;
      core.value = 1;
      return;
    }
    entrance.value = withSequence(
      withTiming(1.08, { duration: duration.micro, easing: Easing.out(Easing.cubic) }),
      withSpring(1, spring.celebration),
    );
    core.value = withDelay(160, withSpring(1, spring.card));
  }, [core, entrance, reduced]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: reduced
      ? [{ scale: entrance.value }]
      : [
          { scale: 0.86 + entrance.value * 0.14 },
          // A 2D horizontal squash stands in for a Y-axis rotation: the
          // gem appears to turn about its vertical axis without a 3D
          // renderer, and costs one transform.
          { scaleX: interpolate(spin.value, [0, 0.5, 1], [1, 0.34, 1], Extrapolate.CLAMP) },
        ],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-size * 0.9, size * 0.9], Extrapolate.CLAMP) }],
    opacity: animated && !reduced ? 0.55 : 0.3,
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: core.value,
    transform: [{ scale: 0.4 + core.value * 0.6 }],
  }));

  const facets = useMemo(
    () =>
      FACETS.map((facet, index) => ({
        key: index,
        points: facet.points
          .map(([x, y]) => `${(size / 2 + (x * size) / 2.35).toFixed(1)},${(size / 2 + (y * size) / 2.35).toFixed(1)}`)
          .join(' '),
        color: facet.color,
      })),
    [size],
  );

  const outline = useMemo(
    () =>
      OUTLINE.map(([x, y]) => `${(size / 2 + (x * size) / 2.35).toFixed(1)},${(size / 2 + (y * size) / 2.35).toFixed(1)}`).join(' '),
    [size],
  );

  const edgeLines = useMemo(
    () =>
      ([[T, ML], [T, MR], [ML, MR], [ML, NL], [MR, NR], [NL, NR], [NL, B], [NR, B]] as Pt[][]).map(
        ([a, b]) => ({
          x1: size / 2 + (a[0] * size) / 2.35,
          y1: size / 2 + (a[1] * size) / 2.35,
          x2: size / 2 + (b[0] * size) / 2.35,
          y2: size / 2 + (b[1] * size) / 2.35,
        }),
      ),
    [size],
  );

  return (
    <Animated.View style={[{ width: size, height: size }, wrapStyle]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="crystalSheen" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={size * 0.4} y2={size}>
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <RadialGradient
            id="crystalCore"
            gradientUnits="userSpaceOnUse"
            cx={size / 2}
            cy={size / 2 - size * 0.0085}
            r={size * 0.16}
          >
            <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.9" />
            <Stop offset="60%" stopColor={colors.accent} stopOpacity="0.35" />
            <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {facets.map(facet => (
          <Polygon key={facet.key} points={facet.points} fill={facet.color} />
        ))}

        {edgeLines.map((line, index) => (
          <Line
            key={`edge-${index}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#DDD6FE"
            strokeOpacity={0.28}
            strokeWidth={1}
          />
        ))}

        <Polygon points={outline} fill="none" stroke={colors.catKnowledge} strokeOpacity={0.55} strokeWidth={1.4} strokeLinejoin="round" />

        <Animated.View style={sheenStyle} pointerEvents="none">
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Polygon points={outline} fill="url(#crystalSheen)" />
          </Svg>
        </Animated.View>

        <Animated.View style={coreStyle} pointerEvents="none">
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Polygon points={outline} fill="url(#crystalCore)" />
          </Svg>
        </Animated.View>
      </Svg>
    </Animated.View>
  );
}

/** Wordmark lockup: crystal + name, for headers and empty states. */
export function CrystalLockup({ size = 40, label, hint }: { size?: number; label: string; hint?: string }) {
  const { colors, typographyStylesheet: typography } = useTheme();
  return (
    <View style={styles.lockup}>
      <CrystalMark size={size} />
      <View style={styles.lockupCopy}>
        <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>
          {label}
        </Text>
        {hint ? (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lockupCopy: { flex: 1, minWidth: 0 },
});

export default CrystalMark;

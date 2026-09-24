import { useEffect } from 'react';
import { Easing, Extrapolate, interpolate, interpolateColor, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion as useReanimatedReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { duration, scale, spring, stagger } from './motion/tokens';

export const MOTION_PRESETS = {
  micro: {
    press: spring.press,
    hover: spring.press,
    tap: spring.press,
    duration: duration.micro,
  },
  standard: {
    entrance: spring.card,
    exit: spring.card,
    modal: spring.sheet,
    tabSwitch: spring.navigation,
    duration: duration.standard,
    easing: Easing.out(Easing.cubic),
  },
  major: {
    pageTransition: spring.navigation,
    radarMorph: spring.card,
    focusMode: spring.sheet,
    sheet: spring.sheet,
    duration: duration.major,
    easing: Easing.out(Easing.cubic),
  },
  celebration: {
    unlock: spring.celebration,
    levelUp: spring.celebration,
    milestone: spring.celebration,
    confetti: spring.celebration,
    duration: duration.celebration,
    easing: Easing.out(Easing.cubic),
  },
} as const;

export type MotionTier = keyof typeof MOTION_PRESETS;
type SpringConfigToken = { damping: number; stiffness: number; mass: number };
type TimingConfig = { delay?: number; easing?: (value: number) => number };

function getSpringConfig(tier: MotionTier): SpringConfigToken {
  if (tier === 'micro') return spring.press;
  if (tier === 'standard') return spring.card;
  if (tier === 'major') return spring.sheet;
  return spring.celebration;
}

function getDuration(tier: MotionTier): number {
  if (tier === 'micro') return duration.micro;
  if (tier === 'standard') return duration.standard;
  if (tier === 'major') return duration.major;
  return duration.celebration;
}

function getEasing(tier: MotionTier) {
  if (tier === 'celebration') return Easing.out(Easing.cubic);
  if (tier === 'major') return Easing.inOut(Easing.cubic);
  return Easing.out(Easing.cubic);
}

export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}

export function createSpring(value: number, tier: MotionTier = 'standard', config?: { delay?: number }) {
  if (config?.delay) return withDelay(config.delay, withSpring(value, getSpringConfig(tier)));
  return withSpring(value, getSpringConfig(tier));
}

export function createTiming(value: number, tier: MotionTier = 'standard', config?: TimingConfig) {
  const animation = withTiming(value, {
    duration: getDuration(tier),
    easing: config?.easing ?? getEasing(tier),
  });
  if (config?.delay) return withDelay(config.delay, animation);
  return animation;
}

export interface EntranceConfig {
  tier?: MotionTier;
  delay?: number;
  from?: number;
  to?: number;
}

export function useEntranceAnimation(config: EntranceConfig = {}) {
  const { tier = 'standard', delay = 0, from = 0, to = 1 } = config;
  const reduced = useReducedMotion();
  const progress = useSharedValue(from);

  useEffect(() => {
    const target = reduced
      ? withTiming(to, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withSpring(to, getSpringConfig(tier));
    progress.value = delay ? withDelay(delay, target) : target;
  }, [delay, progress, reduced, tier, to]);

  return progress;
}

export function usePressAnimation() {
  const progress = useSharedValue(1);
  const reduced = useReducedMotion();

  const pressIn = () => {
    progress.value = reduced ? 1 : withSpring(scale.pressIn, spring.press);
  };

  const pressOut = () => {
    progress.value = reduced ? 1 : withSpring(1, spring.press);
  };

  const pressStyle = useAnimatedStyle(() => ({
    transform: reduced ? [] : [{ scale: progress.value }],
  }));

  return { progress, pressIn, pressOut, pressStyle };
}

export interface FadeConfig {
  tier?: MotionTier;
  delay?: number;
  from?: number;
  to?: number;
}

export function useFadeAnimation(config: FadeConfig = {}) {
  const { tier = 'standard', delay = 0, from = 0, to = 1 } = config;
  const reduced = useReducedMotion();
  const opacity = useSharedValue(from);

  useEffect(() => {
    const target = reduced
      ? withTiming(to, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withTiming(to, { duration: duration.standard, easing: getEasing(tier) });
    opacity.value = delay ? withDelay(delay, target) : target;
  }, [delay, opacity, reduced, tier, to]);

  return opacity;
}

export interface SlideConfig {
  tier?: MotionTier;
  delay?: number;
  from?: { x?: number; y?: number };
  to?: { x?: number; y?: number };
}

export function useSlideAnimation(config: SlideConfig = {}) {
  const { tier = 'standard', delay = 0, from = { y: 20 }, to = { x: 0, y: 0 } } = config;
  const reduced = useReducedMotion();
  const translateX = useSharedValue(from.x ?? 0);
  const translateY = useSharedValue(from.y ?? 0);

  useEffect(() => {
    const targetX = reduced ? 0 : to.x ?? 0;
    const targetY = reduced ? 0 : to.y ?? 0;
    const xAnimation = withTiming(targetX, { duration: reduced ? duration.reducedMotion : duration.standard, easing: getEasing(tier) });
    const yAnimation = withTiming(targetY, { duration: reduced ? duration.reducedMotion : duration.standard, easing: getEasing(tier) });
    translateX.value = delay ? withDelay(delay, xAnimation) : xAnimation;
    translateY.value = delay ? withDelay(delay, yAnimation) : yAnimation;
  }, [delay, reduced, tier, to.x, to.y, translateX, translateY]);

  return useAnimatedStyle(() => ({
    transform: reduced ? [] : [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));
}

export function useScrollHeader(maxDistance = 140) {
  const reduced = useReducedMotion();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [] };
    return {
      opacity: interpolate(scrollY.value, [0, maxDistance], [1, 0.86], Extrapolate.CLAMP),
      transform: [{ translateY: interpolate(scrollY.value, [0, maxDistance], [0, -8], Extrapolate.CLAMP) }],
    };
  });
  return { scrollY, onScroll, style };
}

export function useAnimatedColorProgress(value: number, from: string, to: string) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);
  const color = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [from, to]),
  }));
  useEffect(() => {
    progress.value = reduced
      ? withTiming(value ? 1 : 0, { duration: duration.reducedMotion })
      : withTiming(value ? 1 : 0, { duration: duration.standard, easing: Easing.out(Easing.cubic) });
  }, [progress, reduced, value]);
  return color;
}

export function interpolateClamp(value: number, inputRange: number[], outputRange: number[], extrapolate: 'clamp' | 'extend' | 'identity' = 'clamp') {
  return interpolate(value, inputRange, outputRange, extrapolate);
}

export function rotateDeg(value: number, fromDeg = 0, toDeg = 360) {
  return `${interpolateClamp(value, [0, 1], [fromDeg, toDeg])}deg`;
}

export function scaleValue(value: number, from = 0.9, to = 1) {
  return interpolateClamp(value, [0, 1], [from, to]);
}

export function staggerDelay(index: number, baseDelay = 0, step = stagger.itemDelay) {
  return baseDelay + Math.min(index, stagger.maxStaggeredItems - 1) * step;
}

export type HapticType = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

const HAPTIC_MAP: Record<HapticType, () => Promise<void>> = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

export function useHaptics() {
  const reduced = useReducedMotion();
  const trigger = async (type: HapticType) => {
    if (!hapticsEnabled || reduced) return;
    try {
      await HAPTIC_MAP[type]();
    } catch {
      return;
    }
  };
  return {
    trigger,
    press: () => trigger('light'),
    selection: () => trigger('selection'),
    success: () => trigger('success'),
    error: () => trigger('error'),
    warning: () => trigger('warning'),
    heavy: () => trigger('heavy'),
  };
}

export const HAPTIC_EVENTS = {
  tabPress: 'light' as HapticType,
  buttonPress: 'light' as HapticType,
  cardPress: 'selection' as HapticType,
  questComplete: 'medium' as HapticType,
  questCreate: 'light' as HapticType,
  modalOpen: 'light' as HapticType,
  modalClose: 'selection' as HapticType,
  pullToRefresh: 'light' as HapticType,
  achievementUnlock: 'success' as HapticType,
  levelUp: 'heavy' as HapticType,
  streakMilestone: 'heavy' as HapticType,
  tabSwitch: 'selection' as HapticType,
  deepLink: 'light' as HapticType,
} as const;

export { duration, scale, spring, stagger } from './motion/tokens';

export default {
  MOTION_PRESETS,
  useReducedMotion,
  useEntranceAnimation,
  usePressAnimation,
  useFadeAnimation,
  useSlideAnimation,
  useScrollHeader,
  useAnimatedColorProgress,
  useHaptics,
  staggerDelay,
  HAPTIC_EVENTS,
  setHapticsEnabled,
  interpolateClamp,
  rotateDeg,
  scaleValue,
};

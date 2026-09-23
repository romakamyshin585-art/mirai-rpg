/**
 * Motion System — Unified animation presets & haptics
 * 
 * Four tiers:
 * 1. micro — press, hover, tiny state changes
 * 2. standard — screen entrance, modal appear, tab switch
 * 3. major — page transitions, radar morph, focus mode
 * 4. celebration — achievement unlock, level up, milestone
 * 
 * All animations run on UI thread via Reanimated.
 * Reduced motion respected via useReducedMotion.
 */

import { useSharedValue, withSpring, withTiming, withDelay, Easing, interpolate } from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';

// ============================================================
// MOTION PRESETS (tokens)
// ============================================================

export const MOTION_PRESETS = {
  // 1. MICRO — press, hover, tiny feedback (<100ms)
  micro: {
    press: { damping: 18, stiffness: 280 },
    hover: { damping: 20, stiffness: 250 },
    tap: { damping: 22, stiffness: 300 },
    duration: 80,
  },

  // 2. STANDARD — screen entrance, modal, tab switch (200-300ms)
  standard: {
    entrance: { damping: 22, stiffness: 180 },
    exit: { damping: 24, stiffness: 200 },
    modal: { damping: 20, stiffness: 160 },
    tabSwitch: { damping: 22, stiffness: 200 },
    duration: 250,
    easing: Easing.out(Easing.cubic),
  },

  // 3. MAJOR — page transitions, radar morph, focus mode (400-600ms)
  major: {
    pageTransition: { damping: 20, stiffness: 150 },
    radarMorph: { damping: 18, stiffness: 140 },
    focusMode: { damping: 16, stiffness: 120 },
    sheet: { damping: 20, stiffness: 150 },
    duration: 400,
    easing: Easing.out(Easing.cubic),
  },

  // 4. CELEBRATION — achievement unlock, level up, milestone (600-1000ms)
  celebration: {
    unlock: { damping: 15, stiffness: 180 },
    levelUp: { damping: 12, stiffness: 150 },
    milestone: { damping: 10, stiffness: 120 },
    confetti: { damping: 8, stiffness: 100 },
    duration: 800,
    easing: Easing.out(Easing.back(1.2)),
  },
} as const;

export type MotionTier = keyof typeof MOTION_PRESETS;

type PresetWithEntrance = { entrance: { damping: number; stiffness: number } };
type PresetWithPageTransition = { pageTransition: { damping: number; stiffness: number } };
type PresetWithModal = { modal: { damping: number; stiffness: number } };
type PresetWithPress = { press: { damping: number; stiffness: number } };
type PresetWithEasing = { easing?: any };
type PresetWithDuration = { duration: number };

function getSpringConfig(tier: MotionTier): { damping: number; stiffness: number } {
  const preset = MOTION_PRESETS[tier];
  if ('entrance' in preset) return (preset as PresetWithEntrance).entrance;
  if ('pageTransition' in preset) return (preset as PresetWithPageTransition).pageTransition;
  if ('modal' in preset) return (preset as PresetWithModal).modal;
  if ('press' in preset) return (preset as PresetWithPress).press;
  return MOTION_PRESETS.standard.entrance;
}

function getEasing(tier: MotionTier) {
  const preset = MOTION_PRESETS[tier];
  if ('easing' in preset) return (preset as PresetWithEasing).easing;
  return Easing.out(Easing.cubic);
}

function getDuration(tier: MotionTier) {
  const preset = MOTION_PRESETS[tier];
  return (preset as PresetWithDuration).duration;
}

// ============================================================
// REDUCED MOTION
// ============================================================

let reducedMotionCache: boolean | null = null;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (reducedMotionCache !== null) {
      setReduced(reducedMotionCache);
      return;
    }
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reducedMotionCache = enabled;
      setReduced(enabled);
    });
  }, []);

  return reduced;
}

// ============================================================
// SPRING / TIMING FACTORIES (respect reduced motion)
// ============================================================

export function createSpring(value: number, tier: MotionTier = 'standard', config?: { delay?: number }): any {
  const reduced = reducedMotionCache ?? false;
  const springConfig = getSpringConfig(tier);

  if (reduced) {
    return withTiming(value, { duration: getDuration('standard') / 2, easing: Easing.out(Easing.cubic) });
  }

  const anim = withSpring(value, springConfig);
  if (config?.delay && config.delay > 0) {
    return withDelay(config.delay, anim);
  }
  return anim;
}

export function createTiming(value: number, tier: MotionTier = 'standard', config?: { delay?: number; easing?: any }): any {
  const reduced = reducedMotionCache ?? false;

  if (reduced) {
    return withTiming(value, { duration: getDuration('standard') / 2, easing: Easing.out(Easing.cubic) });
  }

  const anim = withTiming(value, { 
    duration: getDuration(tier), 
    easing: config?.easing ?? getEasing(tier) 
  });
  if (config?.delay && config.delay > 0) {
    return withDelay(config.delay, anim);
  }
  return anim;
}

// ============================================================
// ENTRANCE ANIMATION HOOK (staggered)
// ============================================================

export interface EntranceConfig {
  tier?: MotionTier;
  delay?: number;
  stagger?: number;
  from?: number;
  to?: number;
}

export function useEntranceAnimation(config: EntranceConfig = {}) {
  const { tier = 'standard', delay = 0, stagger = 0, from = 0, to = 1 } = config;
  const reduced = useReducedMotion();
  const progress = useSharedValue(from);

  useEffect(() => {
    if (reduced) {
      progress.value = withTiming(to, { duration: getDuration('standard') / 2 });
      return;
    }
    progress.value = createSpring(to, tier, { delay: delay + stagger });
  }, [reduced, tier, delay, stagger, to]);

  return progress;
}

// ============================================================
// PRESS ANIMATION HOOK
// ============================================================

export function usePressAnimation() {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  const pressIn = () => {
    if (reduced) return;
    scale.value = withSpring(0.94, MOTION_PRESETS.micro.press);
  };

  const pressOut = () => {
    if (reduced) return;
    scale.value = withSpring(1, MOTION_PRESETS.micro.press);
  };

  const pressStyle = {
    transform: [{ scale }],
  };

  return { scale, pressIn, pressOut, pressStyle };
}

// ============================================================
// FADE ANIMATION HOOK
// ============================================================

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
    if (reduced) {
      opacity.value = withTiming(to, { duration: getDuration('standard') / 2 });
      return;
    }
    opacity.value = createTiming(to, tier, { delay });
  }, [reduced, tier, delay, to]);

  return opacity;
}

// ============================================================
// SLIDE ANIMATION HOOK
// ============================================================

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
    if (reduced) {
      translateX.value = withTiming(to.x ?? 0, { duration: getDuration('standard') / 2 });
      translateY.value = withTiming(to.y ?? 0, { duration: getDuration('standard') / 2 });
      return;
    }
    translateX.value = createTiming(to.x ?? 0, tier, { delay });
    translateY.value = createTiming(to.y ?? 0, tier, { delay });
  }, [reduced, tier, delay, to.x, to.y]);

  return {
    transform: [
      { translateX },
      { translateY },
    ],
  };
}

// ============================================================
// HAPTICS SYSTEM
// ============================================================

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
      // Silently fail on unsupported platforms
    }
  };

  // Pre-defined semantic triggers
  const press = () => trigger('light');
  const selection = () => trigger('selection');
  const success = () => trigger('success');
  const error = () => trigger('error');
  const warning = () => trigger('warning');
  const heavy = () => trigger('heavy');

  return { trigger, press, selection, success, error, warning, heavy };
}

// ============================================================
// SEMANTIC HAPTIC TRIGGERS (for consistent UX)
// ============================================================

export const HAPTIC_EVENTS = {
  // Micro - only for meaningful press
  tabPress: 'light' as HapticType,
  buttonPress: 'light' as HapticType,
  cardPress: 'selection' as HapticType,

  // Standard - meaningful actions
  questComplete: 'medium' as HapticType,
  questCreate: 'light' as HapticType,
  modalOpen: 'light' as HapticType,
  modalClose: 'selection' as HapticType,
  pullToRefresh: 'light' as HapticType,

  // Major - milestones
  achievementUnlock: 'success' as HapticType,
  levelUp: 'heavy' as HapticType,
  streakMilestone: 'heavy' as HapticType,

  // Navigation
  tabSwitch: 'selection' as HapticType,
  deepLink: 'light' as HapticType,
} as const;

// ============================================================
// ANIMATED VALUE HELPERS (UI thread)
// ============================================================

export function interpolateClamp(
  value: any,
  inputRange: number[],
  outputRange: number[],
  extrapolate: 'clamp' | 'extend' | 'identity' = 'clamp'
) {
  return interpolate(value, inputRange, outputRange, extrapolate);
}

export function rotateDeg(value: any, fromDeg = 0, toDeg = 360) {
  return `${interpolateClamp(value, [0, 1], [fromDeg, toDeg])}deg`;
}

export function scaleValue(value: any, from = 0.9, to = 1) {
  return interpolateClamp(value, [0, 1], [from, to]);
}

// ============================================================
// STAGGER HELPER
// ============================================================

export function staggerDelay(index: number, baseDelay = 0, step = 30): number {
  return baseDelay + index * step;
}

export function useStaggeredEntrance(count: number, config: { tier?: MotionTier; baseDelay?: number; step?: number } = {}) {
  const { tier = 'standard', baseDelay = 0, step = 30 } = config;
  const progresses = Array.from({ length: count }, (_, i) => 
    useEntranceAnimation({ tier, delay: staggerDelay(i, baseDelay, step) })
  );
  return progresses;
}

export default {
  MOTION_PRESETS,
  useReducedMotion,
  useEntranceAnimation,
  usePressAnimation,
  useFadeAnimation,
  useSlideAnimation,
  useHaptics,
  useStaggeredEntrance,
  createSpring,
  createTiming,
  HAPTIC_EVENTS,
  setHapticsEnabled,
  interpolateClamp,
  rotateDeg,
  scaleValue,
};
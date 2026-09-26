/**
 * Local Expo module: Android 10+ predefined haptics.
 *
 * Wraps `expo-modules-miraihaptics`, a native module in this repo. It is
 * Android-only by configuration, so the caller keeps using `expo-haptics`
 * on iOS — the Taptic Engine has its own vocabulary and this module has
 * nothing to add there.
 *
 * The module is imported lazily and every call is wrapped: a device whose
 * HAL rejects an effect, or an install where autolinking did not pick the
 * module up, must fall back to `expo-haptics` rather than crash.
 */

import { NativeModules, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type PredefinedEffect = 'tick' | 'click' | 'doubleClick' | 'heavyClick';

type MiraiHapticsNative = {
  isPredefinedSupported?: () => boolean;
  play?: (effect: PredefinedEffect) => Promise<void>;
};

const native: MiraiHapticsNative | undefined =
  Platform.OS === 'android' ? (NativeModules.MiraiHaptics as MiraiHapticsNative | undefined) : undefined;

let supported: boolean | null = null;

/** True when the OS can play the tuned effects (Android 10 / API 29+). */
export function supportsPredefined(): boolean {
  if (Platform.OS !== 'android') return false;
  if (supported !== null) return supported;
  try {
    supported = native?.isPredefinedSupported?.() === true;
  } catch {
    supported = false;
  }
  return supported;
}

/** Play a tuned effect, silently degrading to nothing if unavailable. */
export function playPredefined(effect: PredefinedEffect): void {
  if (!supportsPredefined()) return;
  try {
    void native?.play?.(effect);
  } catch {
    // decorative only
  }
}

export const HAPTIC_EFFECTS = {
  /** Lightest: tick marks, chip changes, slider steps. */
  tick: 'tick',
  /** Default press. */
  click: 'click',
  /** Two-part confirmation, e.g. "done" then "recorded". */
  doubleClick: 'doubleClick',
  /** Celebration: level up, achievement unlocked. */
  heavyClick: 'heavyClick',
} as const satisfies Record<string, PredefinedEffect>;

/** Fallback used on iOS and on Android < 10. */
export const FALLBACK: Record<PredefinedEffect, Haptics.ImpactFeedbackStyle> = {
  tick: Haptics.ImpactFeedbackStyle.Light,
  click: Haptics.ImpactFeedbackStyle.Medium,
  doubleClick: Haptics.ImpactFeedbackStyle.Medium,
  heavyClick: Haptics.ImpactFeedbackStyle.Heavy,
};

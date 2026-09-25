/**
 * Mirai RPG Design System — Single Source of Truth
 *
 * APP READ: Personal RPG progression tracker, calm premium, unified-brand.
 * Dials: EXPRESSION=6, MOTION=5, DENSITY=4
 * Platforms: Android first-class, iOS first-class, web best-effort
 *
 * SAFE choices: system font fallback, native nav chrome, restrained neutral ramp,
 * conventional radii (8/12/16), one accent, one gray family.
 * RISKS (3):
 *  1. True-black OLED bg (#000000 not used; #0E0F12 near-black) — gain: depth perception, cost: elevation via borders not shadows
 *  2. Custom font (Nunito) loaded locally — gain: brand voice, cost: font loading, Dynamic Type bounds
 *  3. Translucent nav bar with blur — gain: premium layering, cost: Android perf fallback to opacity
 *
 * LEGACY API: This file exports the exact same token names as before for backward compatibility.
 * New code should use the NEW_* prefixed exports.
 */

import { useColorScheme } from 'react-native';
import { createContext, useContext, useMemo } from 'react';
import { duration, spring } from './motion/tokens';

// ============================================================
// NEW DESIGN SYSTEM (internal constants)
// ============================================================

// --- Semantic Color Tokens (Dark mode primary) ---
const _NEW_COLORS_DARK = {
  bg: '#0E0F12',
  surface: '#1A1C22',
  surfaceElevated: '#23262E',
  surfaceFloating: '#2A2D36',
  surfaceOverlay: 'rgba(14, 15, 18, 0.85)',

  border: '#2E323C',
  borderSubtle: '#1E2128',
  borderFocus: '#F5A524',

  text: '#E6E8EC',
  textSecondary: '#A0A4AE',
  textMuted: '#6B707A',
  textInverse: '#0E0F12',

  accent: '#F5A524',
  accentSoft: '#3D2B0A',
  accentMuted: '#7A5212',

  success: '#22C55E',
  successSoft: '#14532D',
  danger: '#EF4444',
  dangerSoft: '#7F1D1D',
  warning: '#F59E0B',
  warningSoft: '#78350F',

  catHealth: '#F472B6',
  catHealthSoft: '#701A4A',
  catKnowledge: '#60A5FA',
  catKnowledgeSoft: '#1E3A5F',
  catCareer: '#F5A524',
  catCareerSoft: '#3D2B0A',
  catDiscipline: '#A78BFA',
  catDisciplineSoft: '#3B1F6B',
  catSocial: '#34D399',
  catSocialSoft: '#064E2E',

  rarityCommon: '#6B7280',
  rarityRare: '#3B82F6',
  rarityEpic: '#A855F7',
  rarityLegendary: '#F59E0B',
} as const;

const _NEW_COLORS_LIGHT_OVERRIDES = {
  bg: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceElevated: '#F1F3F5',
  surfaceFloating: '#FFFFFF',
  surfaceOverlay: 'rgba(248, 249, 250, 0.9)',

  border: '#DEE2E6',
  borderSubtle: '#E9ECEF',
  borderFocus: '#F5A524',

  text: '#1A1C22',
  textSecondary: '#495057',
  textMuted: '#868E96',
  textInverse: '#FFFFFF',

  accent: '#D4880B',
  accentSoft: '#FFF3CD',
  accentMuted: '#B8740A',

  success: '#1E7D32',
  successSoft: '#E8F5E9',
  danger: '#C62828',
  dangerSoft: '#FDEDEC',
  warning: '#F57F17',
  warningSoft: '#FFF8E1',

  catHealth: '#D63384',
  catHealthSoft: '#FCE4EC',
  catKnowledge: '#0D6EFD',
  catKnowledgeSoft: '#E7F1FF',
  catCareer: '#D4880B',
  catCareerSoft: '#FFF3CD',
  catDiscipline: '#7C3AED',
  catDisciplineSoft: '#F3E8FF',
  catSocial: '#28A745',
  catSocialSoft: '#E8F5E9',

  rarityCommon: '#6C757D',
  rarityRare: '#0D6EFD',
  rarityEpic: '#9B59B6',
  rarityLegendary: '#F57F17',
} as const;

function getNewColors(isDark: boolean) {
  return isDark ? _NEW_COLORS_DARK : { ..._NEW_COLORS_DARK, ..._NEW_COLORS_LIGHT_OVERRIDES };
}

// --- Spacing (4pt grid) ---
const _NEW_SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// --- Radius ---
// One scale, used everywhere. Role-based rather than free-form: the
// audit found 27 distinct radii across the UI (11/13/14/15/17/18/20/21/
// 22/24/27/28/32...) with 42/54/82px "squircle" tiles landing on
// different values from one file to the next. Circles are exempt: their
// radius is half the box by definition.
const _NEW_RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  /** Content cards and summary blocks. */
  card: 18,
  xl: 20,
  '2xl': 24,
  pill: 999,
} as const;

/**
 * Apple "Materials" - translucent layers without refraction.
 *
 * Deliberately not Liquid Glass: no lensing, no bending, no travelling
 * highlight. On RN these are an expo-blur intensity plus a flat overlay
 * tint, and on Android the blur is skipped entirely (see
 * `useMaterialStyle`) because a per-frame blur behind a scrolling list
 * costs frames on most devices.
 */
const _NEW_MATERIALS = {
  ultraThin: { blurIntensity: 20, overlayOpacity: 0.06 },
  thin: { blurIntensity: 35, overlayOpacity: 0.08 },
  /** Cards. */
  regular: { blurIntensity: 50, overlayOpacity: 0.1 },
  /** Modals and sheets. */
  thick: { blurIntensity: 70, overlayOpacity: 0.14 },
} as const;

// --- Elevation (paired iOS shadow + Android elevation) ---
const _NEW_ELEVATION = {
  level1: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  level2: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  level3: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  navBar: {
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// --- Typography ---
const _NEW_FONT_FAMILY = 'Nunito';

const _NEW_TYPOGRAPHY = {
  display: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    maxFontSizeMultiplier: 1.3,
    fontVariant: ['tabular-nums'] as const,
  },
  title: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700' as const,
    maxFontSizeMultiplier: 1.3,
  },
  section: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    maxFontSizeMultiplier: 1.3,
  },
  body: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  secondary: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  caption: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  numeric: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  numericDisplay: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums'] as const,
    maxFontSizeMultiplier: 1.3,
  },
  numericSmall: {
    fontFamily: _NEW_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums'] as const,
  },
} as const;

const _NEW_MOTION = {
  durations: {
    fast: duration.micro,
    normal: duration.standard,
    slow: duration.major,
  },
  springs: {
    gentle: spring.card,
    snappy: spring.navigation,
    bouncy: spring.celebration,
  },
  reduced: {
    fast: duration.reducedMotion,
    normal: duration.reducedMotion,
    slow: duration.reducedMotion,
  },
} as const;

// --- Icon ---
const _NEW_ICON = {
  family: 'lucide',
  strokeWidth: {
    regular: 2,
    bold: 2.5,
    light: 1.5,
  },
  size: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
    xxl: 40,
  },
  nav: {
    size: 26,
    strokeWidth: 2.2,
  },
} as const;

// --- Haptics ---
const _NEW_HAPTICS = {
  selection: 'selection',
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  success: 'notification',
  error: 'notification',
} as const;

// ============================================================
// BACKWARD-COMPATIBLE EXPORTS
//
// These predate the design system above and are kept only where they are
// still referenced. New code must use useTheme() and the NEW_* tokens.
// ============================================================

export const BOTTOM_NAV_BASE_HEIGHT = 72;

// Legacy RARITY_COLORS (with index signature for dynamic access)
export const RARITY_COLORS: Record<string, string> = {
  common: '#6B7280',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

// Legacy CATEGORY_LABELS
export const CATEGORY_LABELS = {
  health: 'Здоровье',
  knowledge: 'Знания',
  career: 'Карьера',
  discipline: 'Дисциплина',
  social: 'Общение',
} as const;

// ============================================================
// NEW API EXPORTS (for new code) - re-export internal constants
// ============================================================

export const NEW_SPACING_TOKENS = {
  xs: _NEW_SPACING[1],
  sm: _NEW_SPACING[2],
  md: _NEW_SPACING[3],
  lg: _NEW_SPACING[4],
  xl: _NEW_SPACING[6],
  xxl: _NEW_SPACING[8],
} as const;

export const NEW_COLORS = _NEW_COLORS_DARK;
export const NEW_RADIUS = _NEW_RADIUS;
export const NEW_MATERIALS = _NEW_MATERIALS;
export type MaterialName = keyof typeof _NEW_MATERIALS;
export const NEW_ELEVATION = _NEW_ELEVATION;
export const NEW_TYPOGRAPHY = _NEW_TYPOGRAPHY;
export const NEW_MOTION = _NEW_MOTION;
export const NEW_ICON = _NEW_ICON;
export const NEW_HAPTICS = _NEW_HAPTICS;
export const NEW_FONT_FAMILY = _NEW_FONT_FAMILY;
export const NEW_CATEGORY_COLORS = {
  health: _NEW_COLORS_DARK.catHealth,
  knowledge: _NEW_COLORS_DARK.catKnowledge,
  career: _NEW_COLORS_DARK.catCareer,
  discipline: _NEW_COLORS_DARK.catDiscipline,
  social: _NEW_COLORS_DARK.catSocial,
} as const;
export const NEW_CATEGORY_LABELS = CATEGORY_LABELS;
export const NEW_RARITY_COLORS = {
  common: _NEW_COLORS_DARK.rarityCommon,
  rare: _NEW_COLORS_DARK.rarityRare,
  epic: _NEW_COLORS_DARK.rarityEpic,
  legendary: _NEW_COLORS_DARK.rarityLegendary,
} as const;

/**
 * StyleSheet-compatible typography.
 *
 * Same values as NEW_TYPOGRAPHY, but with `fontVariant` widened to a
 * mutable array: StyleSheet.create rejects readonly tuples, and screens
 * spread these straight into styles.
 */
export const TYPOGRAPHY_STYLESHEET = {
  display: { ..._NEW_TYPOGRAPHY.display, fontVariant: ['tabular-nums'] as any },
  title: { ..._NEW_TYPOGRAPHY.title },
  section: { ..._NEW_TYPOGRAPHY.section },
  body: { ..._NEW_TYPOGRAPHY.body },
  bodyStrong: { ..._NEW_TYPOGRAPHY.bodyStrong },
  secondary: { ..._NEW_TYPOGRAPHY.secondary },
  caption: { ..._NEW_TYPOGRAPHY.caption },
  numeric: { ..._NEW_TYPOGRAPHY.numeric, fontVariant: ['tabular-nums'] as any },
  numericDisplay: { ..._NEW_TYPOGRAPHY.numericDisplay, fontVariant: ['tabular-nums'] as any },
  numericSmall: { ..._NEW_TYPOGRAPHY.numericSmall, fontVariant: ['tabular-nums'] as any },
} as const;

// ============================================================
// THEME CONTEXT (dynamic color scheme)
// ============================================================

type NewColorsType = typeof _NEW_COLORS_DARK;

interface ThemeContextValue {
  colors: NewColorsType;
  isDark: boolean;
  spacing: typeof NEW_SPACING_TOKENS;
  radius: typeof _NEW_RADIUS;
  elevation: typeof _NEW_ELEVATION;
  materials: typeof _NEW_MATERIALS;
  typography: typeof _NEW_TYPOGRAPHY;
  typographyStylesheet: typeof TYPOGRAPHY_STYLESHEET;
  motion: typeof _NEW_MOTION;
  icon: typeof _NEW_ICON;
  haptics: typeof _NEW_HAPTICS;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isDark = useColorScheme() === 'dark';
  const colors = useMemo(() => getNewColors(isDark), [isDark]);

  const value = useMemo(
    () => ({
      colors: colors as NewColorsType,
      isDark,
      spacing: NEW_SPACING_TOKENS,
      radius: _NEW_RADIUS,
      elevation: _NEW_ELEVATION,
      materials: _NEW_MATERIALS,
      typography: _NEW_TYPOGRAPHY,
      typographyStylesheet: TYPOGRAPHY_STYLESHEET,
      motion: _NEW_MOTION,
      icon: _NEW_ICON,
      haptics: _NEW_HAPTICS,
    }),
    [colors, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// ============================================================
// UTILITIES
// ============================================================

export function makeShadow(level: keyof typeof _NEW_ELEVATION, color?: string) {
  const e = _NEW_ELEVATION[level];
  return {
    shadowColor: color ?? '#000000',
    shadowOffset: e.shadowOffset,
    shadowOpacity: e.shadowOpacity,
    shadowRadius: e.shadowRadius,
    elevation: e.elevation,
  };
}
/**
 * Theme tokens. Mirai RPG uses a dark, slightly desaturated palette
 * with one warm accent (amber for XP) and per-category colors.
 *
 * Single source of truth: no hard-coded colors in screens.
 */

export const COLORS = {
  bg: '#0E0F12',
  card: '#1A1C22',
  cardElevated: '#23262E',
  border: '#2E323C',
  text: '#E6E8EC',
  textMuted: '#8A8E99',
  textDim: '#5A5E69',
  accent: '#F5A524',       // XP / primary action
  accentDim: '#7A5212',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  // category colors
  catHealth:    '#F472B6',
  catKnowledge: '#60A5FA',
  catCareer:    '#F5A524',
  catDiscipline:'#A78BFA',
  catSocial:    '#34D399',
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  health:     COLORS.catHealth,
  knowledge:  COLORS.catKnowledge,
  career:     COLORS.catCareer,
  discipline: COLORS.catDiscipline,
  social:     COLORS.catSocial,
};

export const RARITY_COLORS: Record<string, string> = {
  common:    '#6B7280',
  rare:      '#3B82F6',
  epic:      '#A855F7',
  legendary: '#F59E0B',
};

export const CATEGORY_LABELS: Record<string, string> = {
  health:     'Здоровье',
  knowledge:  'Знания',
  career:     'Карьера',
  discipline: 'Дисциплина',
  social:     'Общение',
};

export const RADIUS = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const FONT = {
  h1: 28,
  h2: 22,
  h3: 18,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

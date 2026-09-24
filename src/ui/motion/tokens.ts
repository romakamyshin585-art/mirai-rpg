export const duration = {
  micro: 120,
  standard: 260,
  major: 380,
  celebration: 650,
  reducedMotion: 150,
} as const;

export const spring = {
  press: { damping: 15, stiffness: 400, mass: 1 },
  navigation: { damping: 20, stiffness: 200, mass: 1 },
  sheet: { damping: 22, stiffness: 180, mass: 1 },
  card: { damping: 16, stiffness: 260, mass: 1 },
  celebration: { damping: 10, stiffness: 150, mass: 1 },
} as const;

export const scale = {
  pressIn: 0.97,
  tabActive: 1.08,
  cardPress: 0.98,
} as const;

export const stagger = {
  itemDelay: 50,
  maxStaggeredItems: 6,
} as const;

export type DurationTokens = typeof duration;
export type SpringTokens = typeof spring;
export type ScaleTokens = typeof scale;
export type StaggerTokens = typeof stagger;

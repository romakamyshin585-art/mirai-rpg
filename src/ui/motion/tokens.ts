/**
 * Motion tokens.
 *
 * Dials (motion.tsx): EXPRESSION 7, PRECISION 5, CALM 4.
 *
 * The numbers below were retuned for a 90 Hz panel. Two rules drove it:
 *
 *  - **Longer, not slower.** A 120 ms transition on a 90 Hz display is
 *    roughly eleven frames, which is enough to read as a flicker rather
 *    than a movement. Every duration was stretched by 25-30% so the motion
 *    is legible, which also gives the eye time to follow what moved.
 *  - **A higher damping ratio.** Damping is what separates "precise" from
 *    "bouncy": the ratio below ~0.7 lets a spring overshoot visibly, and
 *    on a moving element an overshoot reads as imprecision. The celebration
 *    spring is the only one allowed to cross zero on purpose.
 *
 * `duration.reducedMotion` is deliberately short rather than zero - a hard
 * cut looks like a glitch, a short cross-fade looks like intent.
 */

export const duration = {
  /** Press feedback, chip colour, small fades. */
  micro: 140,
  /** Panels, sheets, standard state changes. */
  standard: 320,
  /** Screen entrances and larger layout moves. */
  major: 440,
  /** Full celebration sequences. */
  celebration: 820,
  /** Stagger step between siblings. */
  stagger: 46,
  /** Reduced Motion: present, not abrupt. */
  reducedMotion: 180,
} as const;

/**
 * Spring configs.
 *
 * `damping` is the ratio, `stiffness` the pull. A ratio near 1 lands
 * smoothly with no overshoot, which is what a moving element needs; the
 * sub-1 values are reserved for things that are *meant* to feel physical.
 */
export const spring = {
  /** Buttons and chips under the finger. Fast, no wobble. */
  press: { damping: 18, stiffness: 420, mass: 1 },
  /** Tab bar, filter pills, anything that tracks a finger. */
  navigation: { damping: 26, stiffness: 190, mass: 1 },
  /** Bottom sheets. */
  sheet: { damping: 28, stiffness: 175, mass: 1 },
  /** Cards, list items, generic entrances. */
  card: { damping: 20, stiffness: 240, mass: 1 },
  /** Milestones: level up, achievement. A little overshoot is the point. */
  celebration: { damping: 13, stiffness: 180, mass: 1 },
  /** The completion punch: a real overshoot, then a settle. */
  punch: { damping: 9, stiffness: 260, mass: 1 },
  /** icon-morph: a panel unfolding out of its trigger icon. */
  morph: { damping: 22, stiffness: 200, mass: 1 },
} as const;

export const scale = {
  pressIn: 0.97,
  tabActive: 1.08,
  cardPress: 0.98,
  /** The whole card gives a little as a quest completes. */
  cardComplete: 0.985,
} as const;

export const stagger = {
  itemDelay: 46,
  maxStaggeredItems: 8,
} as const;

export type DurationTokens = typeof duration;
export type SpringTokens = typeof spring;
export type ScaleTokens = typeof scale;
export type StaggerTokens = typeof stagger;

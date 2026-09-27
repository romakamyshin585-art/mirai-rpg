/** Canonical category set, mirrors the 5 stat dimensions. */
export const CATEGORIES = ['health', 'knowledge', 'career', 'discipline', 'social'] as const;
export type Category = typeof CATEGORIES[number];

/**
 * Display names live here rather than in the theme, so pure domain code
 * (search, ranking) can use them without importing React Native. `theme`
 * re-exports this map, which is what the UI imports.
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  health: 'Здоровье',
  knowledge: 'Знания',
  career: 'Карьера',
  discipline: 'Дисциплина',
  social: 'Общение',
};

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

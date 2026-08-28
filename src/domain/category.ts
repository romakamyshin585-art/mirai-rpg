/** Canonical category set, mirrors the 5 stat dimensions. */
export const CATEGORIES = ['health', 'knowledge', 'career', 'discipline', 'social'] as const;
export type Category = typeof CATEGORIES[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

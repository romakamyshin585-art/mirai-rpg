import { CATEGORIES, isCategory } from '../src/domain/category';

describe('categories', () => {
  test('five canonical categories', () => {
    expect(CATEGORIES).toEqual(['health', 'knowledge', 'career', 'discipline', 'social']);
  });
  test('isCategory accepts valid', () => {
    expect(isCategory('health')).toBe(true);
    expect(isCategory('social')).toBe(true);
  });
  test('isCategory rejects invalid', () => {
    expect(isCategory('finance')).toBe(false);
    expect(isCategory('')).toBe(false);
    expect(isCategory(null)).toBe(false);
    expect(isCategory(42)).toBe(false);
  });
});

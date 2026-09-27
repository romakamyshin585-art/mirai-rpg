/**
 * Quest search tests.
 *
 * The behaviour that matters: Cyrillic folding, all-terms-must-match, and
 * an ordering that puts the obvious answer first. A search that returns the
 * right rows in the wrong order is still a bad search.
 */
import { normalizeSearch, scoreQuest, searchQuests } from '../src/domain/quest_search';
import type { Category } from '../src/domain/category';

const quest = (id: string, title: string, description: string | null, category: Category = 'health') => ({
  id,
  title,
  description,
  category,
});

const CATALOGUE = [
  quest('a', 'Пробежка 5 км', 'Средний темп, без остановок', 'health'),
  quest('b', 'Пять километров', 'Первые 5 км с остановками', 'health'),
  quest('c', 'Пётр и забор', 'Классика', 'knowledge'),
  quest('d', 'Зелёный чай', 'Бодрость с утра', 'health'),
  quest('e', 'Карьерный план', 'Что делать в следующем квартале', 'career'),
  quest('f', 'Метод помидора', 'Техника тайм-менеджмента', 'discipline'),
];

describe('normalizeSearch', () => {
  test('lowercases and folds ё onto е', () => {
    expect(normalizeSearch('Зелёный ЧАЙ')).toBe('зеленый чай');
  });

  test('strips punctuation but keeps digits, spaces and dashes', () => {
    expect(normalizeSearch('Пробежка 5 км!')).toBe('пробежка 5 км');
    expect(normalizeSearch('утро-вечер')).toBe('утро-вечер');
  });

  test('collapses runs of whitespace', () => {
    expect(normalizeSearch('  дневной    сон ')).toBe('дневной сон');
  });
});

describe('scoreQuest', () => {
  test('an empty query matches everything with score 0', () => {
    expect(scoreQuest(CATALOGUE[0]!, '   ')?.score).toBe(0);
  });

  test('a title prefix outranks a title substring', () => {
    const prefix = scoreQuest(CATALOGUE[1]!, 'пять')!.score;
    const substring = scoreQuest(CATALOGUE[1]!, 'километров')!.score;
    expect(prefix).toBeGreaterThan(substring);
  });

  test('a title match outranks a description-only match', () => {
    const inTitle = scoreQuest(CATALOGUE[5]!, 'помидора')!.score;
    const inDescription = scoreQuest(CATALOGUE[5]!, 'тайм-менеджмента')!.score;
    expect(inTitle).toBeGreaterThan(inDescription);
  });

  test('every term must match somewhere', () => {
    expect(scoreQuest(CATALOGUE[0]!, 'пробежка вертолёт')).toBeNull();
    expect(scoreQuest(CATALOGUE[0]!, 'пробежка км')?.score).toBeGreaterThan(0);
  });

  test('ё and е are interchangeable in both directions', () => {
    expect(scoreQuest(CATALOGUE[3]!, 'зеленый')).not.toBeNull();
    expect(scoreQuest(CATALOGUE[2]!, 'пётр')).not.toBeNull();
    expect(scoreQuest(CATALOGUE[2]!, 'петр')).not.toBeNull();
  });

  test('the category name is a weak last-resort match', () => {
    const byCategory = scoreQuest(CATALOGUE[0]!, 'здоровье')!.score;
    const byTitle = scoreQuest(CATALOGUE[0]!, 'пробежка')!.score;
    expect(byCategory).toBeGreaterThan(0);
    expect(byCategory).toBeLessThan(byTitle);
  });
});

describe('searchQuests', () => {
  test('an empty query returns everything, unsorted', () => {
    const result = searchQuests(CATALOGUE, '');
    expect(result).toHaveLength(CATALOGUE.length);
    expect(result.map(item => item.quest.id)).toEqual(CATALOGUE.map(item => item.id));
  });

  test('ranks the exact word first', () => {
    const result = searchQuests(CATALOGUE, 'пять');
    expect(result[0]?.quest.id).toBe('b');
  });

  test('finds a quest from its description', () => {
    const result = searchQuests(CATALOGUE, 'квартале');
    expect(result.map(item => item.quest.id)).toContain('e');
  });

  test('equal scores keep the catalogue order, so the list cannot shuffle', () => {
    // Two quests that both match only through their description score the
    // same, so the tie-break has to fall back to catalogue order.
    const tied = [
      quest('x', 'Первая запись', 'разминка перед забегом', 'health'),
      quest('y', 'Вторая запись', 'разминка после забега', 'health'),
    ];
    const firstRun = searchQuests(tied, 'разминка').map(item => item.quest.id);
    const secondRun = searchQuests(tied, 'разминка').map(item => item.quest.id);
    expect(firstRun).toEqual(['x', 'y']);
    expect(secondRun).toEqual(firstRun);
  });

  test('a query that matches nothing returns an empty list, not everything', () => {
    expect(searchQuests(CATALOGUE, 'квантовая физика')).toHaveLength(0);
  });

  test('diacritics and case are ignored', () => {
    const result = searchQuests(CATALOGUE, 'ЗЕЛЁНЫЙ');
    expect(result.map(item => item.quest.id)).toEqual(['d']);
  });
});

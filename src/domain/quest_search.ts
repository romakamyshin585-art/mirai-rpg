/**
 * Quest search.
 *
 * Kept as a pure module so it can be unit tested without a renderer, and so
 * the matching rules are stated once instead of being re-implemented
 * inside the screen.
 *
 * Two Russian-specific details:
 *
 *  - **ё folds onto е.** A user typing "пять" must find "Пять" but also
 *    "пётр", and "зелёный" must be found by "зеленый". Without folding the
 *    search silently misses the most obvious matches.
 *  - **The ё key is a corner-case on Android too**, so folding has to happen
 *    on both sides of the comparison, not just on the query.
 *
 * Matching is substring based and ordered by relevance: a title prefix beats
 * a title substring, which beats a description hit. With 226 quests and no
 * server, a plain filter is instant; ordering is what makes the first three
 * results feel chosen rather than arbitrary.
 */

import type { Category } from './category';
import { CATEGORY_LABELS } from './category';

export type SearchableQuest = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
};

/** Lowercase, ё→е, and collapse whitespace so "дневной   сон" matches. */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every whitespace-separated term must appear somewhere in the quest. */
function tokenize(query: string): string[] {
  return normalizeSearch(query).split(' ').filter(Boolean);
}

export type SearchScore = {
  score: number;
  /** Index of the first matching character in the title, for stable ordering. */
  titleHit: number;
};

/**
 * Relevance score, or `null` when the quest does not match.
 *
 * Deliberately simple and monotonic: prefix in the title (120) > word-start
 * in the title (90) > substring in the title (60) > substring in the
 * description (25). Adding tokens multiplies nothing and adds nothing, so
 * matching more words always ranks at least as high.
 */
export function scoreQuest(quest: SearchableQuest, rawQuery: string): SearchScore | null {
  const terms = tokenize(rawQuery);
  if (terms.length === 0) return { score: 0, titleHit: 0 };

  const title = normalizeSearch(quest.title);
  const description = normalizeSearch(quest.description ?? '');
  const label = normalizeSearch(CATEGORY_LABELS[quest.category]);

  let score = 0;
  let titleHit = Number.MAX_SAFE_INTEGER;
  let matchedAny = false;

  for (const term of terms) {
    let termScore = 0;
    let termHit = Number.MAX_SAFE_INTEGER;
    let termMatched = false;

    const titleIndex = title.indexOf(term);
    if (titleIndex === 0) {
      termScore = 120;
      termHit = 0;
      termMatched = true;
    } else if (titleIndex > 0) {
      const atWordStart = titleIndex === 0 || title[titleIndex - 1] === ' ';
      termScore = atWordStart ? 90 : 60;
      termHit = titleIndex;
      termMatched = true;
    }

    if (!termMatched) {
      const descriptionIndex = description.indexOf(term);
      if (descriptionIndex >= 0) {
        termScore = 25;
        termMatched = true;
      }
    }

    // Category name is a last-resort match, and a weak one: searching
    // "здоровье" should surface health quests, not bury a real title match.
    if (!termMatched && label.includes(term)) {
      termScore = 8;
      termMatched = true;
    }

    if (!termMatched) return null;
    matchedAny = true;
    score += termScore;
    if (termHit < titleHit) titleHit = termHit;
  }

  return matchedAny ? { score, titleHit } : null;
}

export type SearchResult<T extends SearchableQuest> = {
  quest: T;
  score: number;
};

/**
 * Filter and rank. An empty query returns the input untouched, so the screen
 * does not re-order the list just because the field is empty.
 */
export function searchQuests<T extends SearchableQuest>(quests: readonly T[], rawQuery: string): SearchResult<T>[] {
  const query = rawQuery.trim();
  if (!query) return quests.map(quest => ({ quest, score: 0 }));

  const results: SearchResult<T>[] = [];
  for (const quest of quests) {
    const scored = scoreQuest(quest, query);
    if (scored) results.push({ quest, score: scored.score });
  }
  // Stable: equal scores keep the catalogue's own order, so the list never
  // shuffles between two renders of the same state.
  results.sort((a, b) => (b.score !== a.score ? b.score - a.score : 0));
  return results;
}

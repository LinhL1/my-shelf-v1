import { hasTag } from '../lib/tags';
import type { Book } from '../types';

export const VIEWS = ['all', 'read', 'added'] as const;
export type View = (typeof VIEWS)[number];

export const SORTS = ['added', 'title', 'author'] as const;
export type Sort = (typeof SORTS)[number];

const RECENT_LIMIT = 12;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const byTitle = (a: Book, b: Book) => collator.compare(a.title, b.title);
const byDateAdded = (a: Book, b: Book) => b.dateAdded - a.dateAdded;

const comparators: Record<Sort, (a: Book, b: Book) => number> = {
  title: byTitle,
  added: byDateAdded,
  // Books without an author go last.
  author: (a, b) =>
    Number(!a.author) - Number(!b.author) || collator.compare(a.author, b.author) || byTitle(a, b),
};

/**
 * Applies the current view, tag filter, search and sort to the collection. A book must carry
 * every selected tag, so “TBR” and “Fiction” together narrow to fiction still to be read.
 */
export function selectBooks(
  books: Book[],
  view: View,
  sort: Sort,
  query: string,
  tags: readonly string[] = [],
) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const matches = books.filter((book) => {
    if (!tags.every((tag) => hasTag(book.tags, tag))) return false;
    const text = fold(`${book.title} ${book.author} ${book.tags.join(' ')}`);
    return terms.every((term) => text.includes(term));
  });

  switch (view) {
    case 'read':
      return matches
        .filter((b) => b.lastOpened !== null)
        .sort((a, b) => b.lastOpened! - a.lastOpened!)
        .slice(0, RECENT_LIMIT);
    case 'added':
      return matches.sort(byDateAdded).slice(0, RECENT_LIMIT);
    case 'all':
      return matches.sort(comparators[sort]);
  }
}

/** Case- and accent-insensitive form for matching. */
function fold(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

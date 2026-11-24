import type { Book } from '../types';

/**
 * Where reading last stopped, noted synchronously. The database write it accompanies can still be
 * waiting for a page to render when the tab is closed; this one cannot be lost that way.
 */
export type Position = Pick<Book, 'id' | 'currentPage' | 'progress'> & { lastOpened: number };

const KEY = 'my-shelf:position';

export function notePosition(position: Position) {
  try {
    localStorage.setItem(KEY, JSON.stringify(position));
  } catch {
    // The database still has it.
  }
}

/** The book with its noted position, if that is newer than what was stored. */
export function withNotedPosition(position: Position, book: Book | undefined): Book | null {
  if (!book || (book.lastOpened ?? 0) >= position.lastOpened) return null;
  return { ...book, ...position };
}

export function notedPosition(): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Position> | null;
    if (typeof value?.id !== 'string') return null;
    const { id, currentPage, progress, lastOpened } = value;
    if (![currentPage, progress, lastOpened].every(Number.isFinite)) return null;
    return { id, currentPage: currentPage!, progress: progress!, lastOpened: lastOpened! };
  } catch {
    return null;
  }
}

export type Layout = 'single' | 'double';

/** What is visible at once. In single layout only `right` is used. */
export interface Spread {
  index: number;
  left: number | null;
  right: number | null;
}

/**
 * Double layout follows a printed book: page 1 is a right-hand page on its own,
 * then 2–3, 4–5, and so on.
 */
export function spreadForPage(page: number, pageCount: number, layout: Layout): Spread {
  if (layout === 'single') return { index: page - 1, left: null, right: page };
  const index = Math.floor(page / 2);
  const left = index * 2;
  return {
    index,
    left: left >= 1 ? left : null,
    right: left + 1 <= pageCount ? left + 1 : null,
  };
}

export function firstPage(spread: Spread) {
  return spread.left ?? spread.right!;
}

export function lastPage(spread: Spread) {
  return spread.right ?? spread.left!;
}

/** The page to go to when turning once, or null at either end of the book. */
export function turnTarget(spread: Spread, direction: 1 | -1, pageCount: number): number | null {
  const target = direction === 1 ? lastPage(spread) + 1 : firstPage(spread) - 1;
  return target >= 1 && target <= pageCount ? target : null;
}

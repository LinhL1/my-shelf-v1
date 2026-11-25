import type { CSSProperties } from 'react';
import type { Book } from '../types';

/** How far each book is turned away from the viewer, exposing its spine. */
export const BOOK_ANGLE = 34;

const COS = Math.cos((BOOK_ANGLE * Math.PI) / 180);
const SIN = Math.sin((BOOK_ANGLE * Math.PI) / 180);

const MAX_COVER_WIDTH = 230;
/** Captions need some room even under a very small book. */
const MIN_FOOTPRINT = 116;

export interface BookSize {
  width: number;
  height: number;
  thickness: number;
  /** Horizontal space the turned book takes up on the shelf. */
  footprint: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** On-screen size of a book: real proportions, height hinting at the page format, thickness from page count. */
export function bookSize(book: Book, scale: number): BookSize {
  // Pocket formats (~560pt) to A4 (~842pt) map onto a modest range so the shelf stays even.
  let height = 206 + (clamp(book.coverHeightPt, 560, 842) - 560) * 0.16;
  let width = height * book.coverAspect;
  if (width > MAX_COVER_WIDTH) {
    height *= MAX_COVER_WIDTH / width;
    width = MAX_COVER_WIDTH;
  }
  const thickness = clamp(11 + book.pageCount * 0.075, 12, 64);

  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const depth = Math.round(thickness * scale);
  return {
    width,
    height,
    thickness: depth,
    footprint: Math.max(MIN_FOOTPRINT * scale, Math.ceil(width * COS + depth * SIN)),
  };
}

const COMPACT_WIDTH = 560;
/** Footprint of a typical A4 book at full size. */
const TYPICAL_FOOTPRINT = 164;

/** Spacing and book scale for a shelf. On phones, books shrink just enough for two to fit side by side. */
export function shelfMetrics(shelfWidth: number) {
  if (shelfWidth >= COMPACT_WIDTH) return { gap: 32, padding: 44, scale: 1 };
  const gap = 20;
  const padding = 14;
  const scale = (shelfWidth - padding * 2 - gap) / 2 / TYPICAL_FOOTPRINT;
  return { gap, padding, scale: clamp(scale, 0.6, 1) };
}

/** The one viewpoint books and shelves share, at scale 1: distance to the books, and eye level above the board. */
const CAMERA = 1400;
const EYE = 340;
/** Half the depth of a board. Books stand on its centre line; the widest, thickest one reaches just short of this. */
const HALF_DEPTH = 96;
/** Thickness of a board's front edge. */
const EDGE = 20;

/** How far below the books' centre line (px on screen) a point on the board at depth `z` appears. */
const project = (z: number) => EYE * (CAMERA / (CAMERA - z) - 1);

/** CSS variables that draw a board, and the books on it, from the same viewpoint. */
export function shelfPerspective(scale: number, padding: number) {
  const px = (value: number) => `${(value * scale).toFixed(2)}px`;
  return {
    '--camera': px(CAMERA),
    '--eye': px(EYE),
    '--board-back': px(-project(-HALF_DEPTH)),
    '--board-front': px(project(HALF_DEPTH)),
    '--board-edge': px(EDGE),
    // Each book has its own vanishing point, so the ends of a board taper gently rather than by the full
    // perspective of its width, which would leave the outer books hanging over the sides.
    '--board-taper': `${padding * 0.6}px`,
  } as CSSProperties;
}

export interface Placed {
  book: Book;
  size: BookSize;
}

/** Fills shelves left to right, starting a new one when the next book does not fit. */
export function packShelves(books: Book[], shelfWidth: number, gap: number, scale: number) {
  const shelves: Placed[][] = [];
  let used = Infinity;
  for (const book of books) {
    const size = bookSize(book, scale);
    if (used + gap + size.footprint > shelfWidth) {
      shelves.push([]);
      used = -gap;
    }
    shelves.at(-1)!.push({ book, size });
    used += gap + size.footprint;
  }
  return shelves;
}

import type { Box } from './PageRenderer';

const MAX_NOTE = 220;
const PAGE_GAP = 16;
const SCREEN_GAP = 10;
/** The book may give up this much of its size to make room for notes. */
const MIN_SHRINK = 0.55;

const minNote = (stageWidth: number) => Math.min(150, Math.max(112, stageWidth * 0.14));

/**
 * Whether notes fit in the blank space beside the book. `gutter` is the space outside the stage
 * on each side, and `bookWidth` how wide the book is when nothing has to make room.
 */
export function marginFit(stageWidth: number, gutter: number, bookWidth: number) {
  const needed = minNote(stageWidth) + PAGE_GAP + SCREEN_GAP;
  const maxBookWidth = stageWidth - 2 * Math.max(0, needed - gutter);
  return {
    possible: bookWidth > 0 && maxBookWidth >= bookWidth * MIN_SHRINK,
    maxBookWidth,
    /** Space to keep free on each side while zoomed in, when the book fills the screen. */
    rail: needed,
  };
}

/** Horizontal extent of the notes beside the book, in stage coordinates. */
export function noteColumns(stage: Box, gutter: number, bookLeft: number, bookRight: number) {
  const width = (space: number) => Math.min(MAX_NOTE, space - PAGE_GAP - SCREEN_GAP);
  const left = width(bookLeft + gutter);
  const right = width(stage.width + gutter - bookRight);
  return {
    left: { x: bookLeft - PAGE_GAP - left, width: left },
    right: { x: bookRight + PAGE_GAP, width: right },
  };
}

/**
 * Tops for a column of notes: each as close as possible to the text it belongs to, without
 * overlapping. When there are too many for the column they overlap evenly, like a stack of cards.
 * Items must be sorted by `y`.
 */
export function stackNotes(items: { y: number; height: number }[], limit: number, gap: number) {
  const tops: number[] = [];
  let floor = 0;
  for (const { y, height } of items) {
    const top = Math.max(y, floor);
    tops.push(top);
    floor = top + height + gap;
  }
  let ceiling = limit;
  for (let i = items.length - 1; i >= 0; i--) {
    tops[i] = Math.min(tops[i]!, ceiling - items[i]!.height);
    ceiling = tops[i]! - gap;
  }
  if (items.length > 0 && tops[0]! < 0) {
    const step = (limit - items.at(-1)!.height) / Math.max(1, items.length - 1);
    return items.map((_, i) => Math.max(0, i * step));
  }
  return tops;
}

import type { Highlight, Rect } from '../types';
import type { Box } from './PageRenderer';

/**
 * Where a page's picture sits inside its sheet of paper. In whole device pixels, so that one
 * canvas pixel lands on exactly one screen pixel.
 */
export function placeImage(image: Box, box: Box, dpr: number) {
  const fit = Math.min(box.width / image.width, box.height / image.height);
  const pixelWidth = Math.round(image.width * fit * dpr);
  const pixelHeight = Math.round(image.height * fit * dpr);
  return {
    pixelWidth,
    pixelHeight,
    left: Math.round((box.width * dpr - pixelWidth) / 2) / dpr,
    top: Math.round((box.height * dpr - pixelHeight) / 2) / dpr,
    width: pixelWidth / dpr,
    height: pixelHeight / dpr,
  };
}

/** Highlights are thin targets, so a near miss counts. In fractions of the page. */
const SLACK = 0.004;

/** The highlight at a spot on a page (in fractions). The newest wins where several overlap. */
export function highlightAt(highlights: Highlight[], page: number, x: number, y: number) {
  const inside = (r: Rect) =>
    x >= r.x - SLACK && x <= r.x + r.width + SLACK && y >= r.y - SLACK && y <= r.y + r.height + SLACK;
  return highlights.findLast((h) => h.segments.some((s) => s.page === page && s.rects.some(inside)));
}

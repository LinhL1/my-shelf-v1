import type { CSSProperties } from 'react';
import { isDark } from '../lib/color';
import { useCoverUrl } from '../lib/covers';
import type { Book } from '../types';
import { BOOK_ANGLE, type BookSize } from './bookGeometry';

/** Below this thickness (px) a spine title would not be legible. */
const MIN_TITLED_SPINE = 17;

/** A closed book standing upright: a CSS cuboid with a cover and a spine. */
export function Book3D({ book, size }: { book: Book; size: BookSize }) {
  const cover = useCoverUrl(book.id);
  const { width, height, thickness } = size;
  const dark = isDark(book.spineColor);

  const style = {
    width,
    height,
    '--book-thickness': `${thickness}px`,
    '--book-angle': `${BOOK_ANGLE}deg`,
    '--book-color': book.spineColor,
  } as CSSProperties;

  return (
    <span className="book" style={style} aria-hidden="true">
      <span className="book-shadow" />
      <span className="book-body">
        <span className="book-face book-cover">
          {cover && <img src={cover} alt="" draggable={false} />}
        </span>
        <span
          className="book-face book-spine"
          style={{
            color: dark ? 'rgba(255,255,255,.92)' : 'rgba(30,28,25,.88)',
            fontSize: Math.min(15, Math.max(9.5, thickness * 0.44)),
          }}
        >
          {thickness >= MIN_TITLED_SPINE && <span className="book-spine-title">{book.title}</span>}
        </span>
      </span>
    </span>
  );
}

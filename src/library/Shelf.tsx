import type { CSSProperties } from 'react';
import { openBook } from '../lib/router';
import type { Book } from '../types';
import { StarIcon } from '../ui/icons';
import { Book3D } from './Book3D';
import { BookMenu, type BookAction } from './BookMenu';
import { shelfPerspective, type Placed } from './bookGeometry';

interface ShelfProps {
  items: Placed[];
  gap: number;
  padding: number;
  scale: number;
  onAction: (action: BookAction, book: Book) => void;
}

/** One shelf board with its books standing on it and their labels underneath. */
export function Shelf({ items, gap, padding, scale, onAction }: ShelfProps) {
  const height = Math.max(...items.map((i) => i.size.height));
  return (
    <li className="shelf" style={shelfPerspective(scale, padding)}>
      <div className="shelf-board-position" style={{ top: height }}>
        <ShelfBoard />
      </div>
      <ul className="shelf-row" style={{ gap, paddingInline: padding }}>
        {items.map(({ book, size }) => (
          <li key={book.id} className="shelf-slot" style={{ width: size.footprint }}>
            <button
              type="button"
              className="book-button"
              style={{ '--row-height': `${height}px` } as CSSProperties}
              onClick={() => openBook(book.id)}
              aria-label={`Open ${book.title}${book.author ? ` by ${book.author}` : ''}`}
            >
              <Book3D book={book} size={size} />
            </button>
            <Caption book={book} onAction={onAction} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/** A wooden board seen from slightly above. Expects the variables from `shelfPerspective`. */
export function ShelfBoard() {
  return (
    <div className="shelf-board" aria-hidden="true">
      <div className="shelf-board-top" />
      <div className="shelf-board-front" />
    </div>
  );
}

function Caption({ book, onAction }: { book: Book; onAction: ShelfProps['onAction'] }) {
  const percent = Math.round(book.progress * 100);
  return (
    <div className="group/caption relative mt-10 pr-5">
      <p className="line-clamp-2 font-serif text-sm leading-snug text-ink" title={book.title}>
        {book.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted" title={book.author || undefined}>
        {book.author || 'Unknown author'}
      </p>
      {book.rating !== null && <Stars rating={book.rating} />}
      {book.lastOpened !== null && (
        <div className="mt-2.5">
          <div
            className="h-0.5 w-14 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Reading progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-wood" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 truncate text-[11px] tabular-nums text-muted">
            Page {book.currentPage} · {percent}%
          </p>
        </div>
      )}
      <BookMenu book={book} onAction={(action) => onAction(action, book)} />
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="mt-1.5 flex gap-px" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={`size-3 ${n <= rating ? 'fill-current text-wood' : 'text-[#d6d3cb]'}`}
        />
      ))}
    </div>
  );
}

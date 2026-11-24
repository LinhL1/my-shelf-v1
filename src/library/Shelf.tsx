import { openBook } from '../lib/router';
import type { Book } from '../types';
import { Book3D } from './Book3D';
import { BookMenu, type BookAction } from './BookMenu';
import type { Placed } from './bookGeometry';

interface ShelfProps {
  items: Placed[];
  gap: number;
  padding: number;
  onAction: (action: BookAction, book: Book) => void;
}

/** One shelf board with its books standing on it and their labels underneath. */
export function Shelf({ items, gap, padding, onAction }: ShelfProps) {
  const height = Math.max(...items.map((i) => i.size.height));
  return (
    <li className="shelf">
      <ul className="shelf-row" style={{ gap, paddingInline: padding }}>
        {items.map(({ book, size }) => (
          <li key={book.id} className="shelf-slot" style={{ width: size.footprint }}>
            <button
              type="button"
              className="book-button"
              style={{ height }}
              onClick={() => openBook(book.id)}
              aria-label={`Open ${book.title}${book.author ? ` by ${book.author}` : ''}`}
            >
              <Book3D book={book} size={size} />
            </button>
            <Caption book={book} onAction={onAction} />
          </li>
        ))}
      </ul>
      <div className="shelf-board" style={{ top: height }} aria-hidden="true" />
    </li>
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
      {book.lastOpened !== null && (
        <div className="mt-2 flex items-center gap-2">
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
          <span className="text-[11px] tabular-nums text-muted">{percent}%</span>
        </div>
      )}
      <BookMenu book={book} onAction={(action) => onAction(action, book)} />
    </div>
  );
}

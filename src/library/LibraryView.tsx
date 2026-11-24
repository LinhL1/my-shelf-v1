import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../lib/LibraryProvider';
import { getFile } from '../lib/db';
import { openBook } from '../lib/router';
import { useElementSize } from '../lib/useElementSize';
import { usePreference } from '../lib/usePreference';
import type { Book } from '../types';
import { ChevronDownIcon, PlusIcon, SearchIcon } from '../ui/icons';
import type { BookAction } from './BookMenu';
import { packShelves, shelfMetrics } from './bookGeometry';
import { EditBookDialog } from './EditBookDialog';
import { ImportStatus } from './ImportStatus';
import { RemoveBookDialog } from './RemoveBookDialog';
import { selectBooks, SORTS, VIEWS, type Sort, type View } from './selectBooks';
import { Shelf } from './Shelf';
import { useFileDrop } from './useFileDrop';

const VIEW_LABELS: Record<View, string> = {
  all: 'All books',
  read: 'Recently read',
  added: 'Recently added',
};
const SORT_LABELS: Record<Sort, string> = {
  added: 'Date added',
  title: 'Title',
  author: 'Author',
};

/** Scroll position to return to when a book is closed. */
let lastScroll = 0;

export function LibraryView() {
  const { books, status, importFiles } = useLibrary();
  const [query, setQuery] = useState('');
  const [view, setView] = usePreference('view', VIEWS, 'all');
  const [sort, setSort] = usePreference('sort', SORTS, 'added');
  const [dialog, setDialog] = useState<{ kind: 'edit' | 'remove'; bookId: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [shelfRef, { width: shelfWidth }] = useElementSize<HTMLDivElement>();
  const dragging = useFileDrop(importFiles);

  const { gap, padding, scale } = shelfMetrics(shelfWidth);
  const visible = useMemo(() => selectBooks(books, view, sort, query), [books, view, sort, query]);
  const shelves = useMemo(
    () => (shelfWidth > 0 ? packShelves(visible, shelfWidth - padding * 2, gap, scale) : []),
    [visible, shelfWidth, padding, gap, scale],
  );

  const hasShelves = shelves.length > 0;
  useLayoutEffect(() => {
    if (!hasShelves) return;
    window.scrollTo(0, lastScroll);
    const remember = () => {
      lastScroll = window.scrollY;
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [hasShelves]);

  const pickFiles = () => fileInput.current?.click();
  const onAction = (action: BookAction, book: Book) => {
    if (action === 'open') openBook(book.id);
    else if (action === 'download') void downloadOriginal(book);
    else setDialog({ kind: action, bookId: book.id });
  };
  const dialogBook = dialog && books.find((b) => b.id === dialog.bookId);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-8">
          <h1 className="shrink-0 font-serif text-lg">My Shelf</h1>
          <label className="relative ml-auto w-full max-w-64 min-w-0">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="field pl-8"
              placeholder="Search"
              aria-label="Search books by title or author"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className="button button-primary shrink-0" onClick={pickFiles}>
            <PlusIcon className="size-4" />
            Add Book
          </button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          importFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
        {books.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 text-sm">
            <div className="flex gap-5" role="group" aria-label="View">
              {VIEWS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  className={`py-1 transition-colors ${
                    view === id ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                  onClick={() => setView(id)}
                >
                  {VIEW_LABELS[id]}
                </button>
              ))}
            </div>
            {view === 'all' && (
              <label className="relative flex items-center gap-1.5 text-muted">
                Sort by
                <select
                  className="cursor-pointer appearance-none rounded bg-transparent py-1 pr-5 text-ink"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                >
                  {SORTS.map((id) => (
                    <option key={id} value={id}>
                      {SORT_LABELS[id]}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-0 size-3.5" />
              </label>
            )}
          </div>
        )}

        <div ref={shelfRef}>
          {hasShelves && (
            <ul className="space-y-12 pt-4" aria-label="Bookshelf">
              {shelves.map((items) => (
                <Shelf
                  key={items[0]!.book.id}
                  items={items}
                  gap={gap}
                  padding={padding}
                  onAction={onAction}
                />
              ))}
            </ul>
          )}
        </div>

        {status === 'failed' && (
          <Message title="Your library could not be opened">
            This browser is blocking local storage. Private windows and strict privacy settings can
            cause this.
          </Message>
        )}
        {status === 'blocked' && (
          <Message title="My Shelf is open in another tab">
            That tab is running an older version. Close it, and your library will open here.
          </Message>
        )}
        {status === 'ready' && books.length === 0 && (
          <div className="pt-[16vh]">
            <div className="shelf-board relative!" aria-hidden="true" />
            <Message title="Your shelf is empty">
              <span className="block">Drop PDF files anywhere on this page, or choose them from your device.</span>
              <button type="button" className="button mt-5" onClick={pickFiles}>
                Choose files
              </button>
            </Message>
          </div>
        )}
        {status === 'ready' && books.length > 0 && visible.length === 0 && (
          <Message title={query.trim() ? 'No matching books' : 'Nothing here yet'}>
            {query.trim()
              ? `Nothing matches “${query.trim()}”.`
              : 'Books you open will appear here.'}
          </Message>
        )}
      </main>

      <ImportStatus onEdit={(book) => setDialog({ kind: 'edit', bookId: book.id })} />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-paper/90 p-4">
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted">
            <p className="font-serif text-lg">Drop PDFs to add them to your shelf</p>
          </div>
        </div>
      )}

      {dialog && dialogBook && dialog.kind === 'edit' && (
        <EditBookDialog book={dialogBook} onClose={() => setDialog(null)} />
      )}
      {dialog && dialogBook && dialog.kind === 'remove' && (
        <RemoveBookDialog book={dialogBook} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-14 text-center">
      <h2 className="font-serif text-lg">{title}</h2>
      <div className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/** Saves the stored PDF back to disk, byte for byte as it was imported. */
async function downloadOriginal(book: Book) {
  const file = await getFile(book.id);
  if (!file) return;
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = book.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

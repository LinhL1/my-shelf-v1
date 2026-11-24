import { useEffect } from 'react';
import { useLibrary } from '../lib/LibraryProvider';
import type { Book } from '../types';
import { AlertIcon, CheckIcon, CloseIcon } from '../ui/icons';

const AUTO_DISMISS_MS = 6000;

/** Progress and results of the current import batch. */
export function ImportStatus({ onEdit }: { onEdit: (book: Book) => void }) {
  const { imports, books, dismissImports } = useLibrary();

  const finished = imports.filter((i) => i.status === 'done' || i.status === 'failed').length;
  const busy = finished < imports.length;
  const needsAttention = imports.some(
    (i) => i.status === 'failed' || (i.bookId && !books.find((b) => b.id === i.bookId)?.author),
  );

  // Results that need no action clear themselves.
  useEffect(() => {
    if (imports.length === 0 || busy || needsAttention) return;
    const timer = setTimeout(dismissImports, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [imports, busy, needsAttention, dismissImports]);

  if (imports.length === 0) return null;

  return (
    <section
      className="fixed inset-x-4 bottom-4 z-30 rounded-lg border border-line bg-white shadow-lg shadow-black/5 sm:left-auto sm:w-84"
      aria-label="Import status"
    >
      <header className="flex items-center justify-between py-2 pr-2 pl-4">
        <h2 className="text-sm font-medium" role="status">
          {busy ? `Adding book ${finished + 1} of ${imports.length}…` : 'Import finished'}
        </h2>
        {!busy && (
          <button type="button" className="icon-button size-8" aria-label="Dismiss" onClick={dismissImports}>
            <CloseIcon className="size-4" />
          </button>
        )}
      </header>
      <ul className="max-h-60 overflow-y-auto border-t border-line py-1">
        {imports.map((item) => {
          const book = item.bookId ? books.find((b) => b.id === item.bookId) : undefined;
          return (
            <li key={item.key} className="flex items-start gap-3 px-4 py-2 text-sm">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {item.status === 'working' && <span className="spinner" />}
                {item.status === 'waiting' && <span className="size-1.5 rounded-full bg-line" />}
                {item.status === 'done' && <CheckIcon className="size-4 text-muted" />}
                {item.status === 'failed' && <AlertIcon className="size-4 text-danger" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={item.fileName}>
                  {book?.title ?? item.fileName}
                </span>
                {item.status === 'failed' && (
                  <span className="block text-xs leading-relaxed text-danger">{item.message}</span>
                )}
                {book && !book.author && (
                  <span className="block text-xs text-muted">No author found</span>
                )}
              </span>
              {book && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-ink"
                  onClick={() => onEdit(book)}
                >
                  Edit
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

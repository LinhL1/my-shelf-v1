import { useState } from 'react';
import { useLibrary } from '../lib/LibraryProvider';
import type { Book } from '../types';
import { Dialog } from '../ui/Dialog';

export function RemoveBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const { removeBook } = useLibrary();
  const [error, setError] = useState('');

  const remove = async () => {
    try {
      await removeBook(book.id);
      onClose();
    } catch (cause) {
      console.error(cause);
      setError('The book could not be removed.');
    }
  };

  return (
    <Dialog title="Remove this book?" onClose={onClose}>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        <span className="text-ink">{book.title}</span>, its reading progress, highlights and notes
        will be removed from this library. The file you imported it from is not affected.
      </p>
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="button" onClick={onClose} autoFocus>
          Cancel
        </button>
        <button type="button" className="button button-danger" onClick={() => void remove()}>
          Remove
        </button>
      </div>
    </Dialog>
  );
}

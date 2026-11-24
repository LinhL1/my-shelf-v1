import { useState } from 'react';
import { useLibrary } from '../lib/LibraryProvider';
import type { Book } from '../types';
import { Dialog } from '../ui/Dialog';

export function EditBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const { updateBook } = useLibrary();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [error, setError] = useState('');

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await updateBook(book.id, { title: trimmed, author: author.trim() });
      onClose();
    } catch (cause) {
      console.error(cause);
      setError('The changes could not be saved.');
    }
  };

  return (
    <Dialog title="Edit details" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block">
          <span className="text-xs text-muted">Title</span>
          <input
            className="field mt-1"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Author</span>
          <input
            className="field mt-1"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
          />
        </label>
        <p className="text-xs leading-relaxed break-words text-muted">
          {book.fileName}
          <br />
          {book.pageCount} {book.pageCount === 1 ? 'page' : 'pages'} · {formatSize(book.fileSize)} · added{' '}
          {new Date(book.dateAdded).toLocaleDateString()}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function formatSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

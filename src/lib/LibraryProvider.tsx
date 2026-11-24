import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Book, BookPatch } from '../types';
import { releaseCover } from './covers';
import * as db from './db';

export interface ImportItem {
  key: number;
  fileName: string;
  status: 'waiting' | 'working' | 'done' | 'failed';
  message?: string;
  bookId?: string;
}

interface Library {
  books: Book[];
  status: 'loading' | 'ready' | 'failed';
  imports: ImportItem[];
  importFiles: (files: Iterable<File>) => void;
  dismissImports: () => void;
  updateBook: (id: string, patch: BookPatch) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
}

const LibraryContext = createContext<Library | null>(null);

export function useLibrary() {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('useLibrary must be used inside LibraryProvider');
  return library;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [status, setStatus] = useState<Library['status']>('loading');
  const [imports, setImports] = useState<ImportItem[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextKey = useRef(0);

  useEffect(() => {
    let active = true;
    db.listBooks().then(
      (stored) => {
        if (!active) return;
        setBooks(stored);
        setStatus('ready');
      },
      (error: unknown) => {
        console.error(error);
        if (active) setStatus('failed');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const importFiles = useCallback((files: Iterable<File>) => {
    const jobs = Array.from(files, (file) => ({ key: nextKey.current++, file }));
    if (jobs.length === 0) return;
    void db.requestPersistence();

    setImports((items) => [
      // A new batch replaces finished results but keeps anything still running.
      ...items.filter((i) => i.status === 'waiting' || i.status === 'working'),
      ...jobs.map(({ key, file }) => ({ key, fileName: file.name, status: 'waiting' as const })),
    ]);
    const update = (key: number, patch: Partial<ImportItem>) =>
      setImports((items) => items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

    // One at a time: rendering covers is CPU-bound, and it keeps memory flat for large batches.
    for (const { key, file } of jobs) {
      queue.current = queue.current.then(async () => {
        update(key, { status: 'working' });
        try {
          const { prepareBook } = await import('./importBook');
          const newBook = await prepareBook(file, await db.listBooks());
          await db.addBook(newBook);
          setBooks((current) => [...current, newBook.book]);
          update(key, { status: 'done', bookId: newBook.book.id });
        } catch (error) {
          update(key, { status: 'failed', message: describeImportFailure(error) });
        }
      });
    }
  }, []);

  const dismissImports = useCallback(
    () => setImports((items) => items.filter((i) => i.status === 'waiting' || i.status === 'working')),
    [],
  );

  const updateBook = useCallback(async (id: string, patch: BookPatch) => {
    setBooks((current) => current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    await db.patchBook(id, patch);
  }, []);

  const removeBook = useCallback(async (id: string) => {
    await db.deleteBook(id);
    releaseCover(id);
    setBooks((current) => current.filter((b) => b.id !== id));
  }, []);

  const value = useMemo(
    () => ({ books, status, imports, importFiles, dismissImports, updateBook, removeBook }),
    [books, status, imports, importFiles, dismissImports, updateBook, removeBook],
  );
  return <LibraryContext value={value}>{children}</LibraryContext>;
}

function describeImportFailure(error: unknown) {
  if (!(error instanceof Error)) return 'This PDF could not be imported.';
  // The importer is loaded on demand, so its error class is matched structurally.
  if (error.name === 'ImportError') return error.message;
  if (error.name === 'QuotaExceededError') return 'There is not enough browser storage for this book.';
  console.error(error);
  return 'This PDF could not be imported.';
}

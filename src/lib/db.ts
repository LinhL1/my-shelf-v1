import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, BookPatch, NewBook } from '../types';

/**
 * Binary data is kept apart from metadata so that saving reading progress on
 * every page turn never rewrites a cover or a PDF.
 */
interface ShelfSchema extends DBSchema {
  books: { key: string; value: Book };
  covers: { key: string; value: Blob };
  files: { key: string; value: Blob };
}

let connection: Promise<IDBPDatabase<ShelfSchema>> | null = null;

function database() {
  connection ??= openDB<ShelfSchema>('my-shelf', 1, {
    upgrade(db) {
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('covers');
      db.createObjectStore('files');
    },
    terminated() {
      connection = null;
    },
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

export async function listBooks(): Promise<Book[]> {
  return (await database()).getAll('books');
}

export async function getBook(id: string) {
  return (await database()).get('books', id);
}

export async function getCover(id: string) {
  return (await database()).get('covers', id);
}

export async function getFile(id: string) {
  return (await database()).get('files', id);
}

export async function addBook({ book, cover, file }: NewBook) {
  const tx = (await database()).transaction(['books', 'covers', 'files'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').add(book),
    tx.objectStore('covers').add(cover, book.id),
    tx.objectStore('files').add(file, book.id),
    tx.done,
  ]);
}

export async function patchBook(id: string, patch: BookPatch) {
  const tx = (await database()).transaction('books', 'readwrite');
  const current = await tx.store.get(id);
  if (current) await tx.store.put({ ...current, ...patch });
  await tx.done;
}

export async function deleteBook(id: string) {
  const tx = (await database()).transaction(['books', 'covers', 'files'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('covers').delete(id),
    tx.objectStore('files').delete(id),
    tx.done,
  ]);
}

/** Asks the browser not to evict the library under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Best effort; the library still works without the guarantee.
  }
}

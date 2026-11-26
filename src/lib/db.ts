import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, BookPatch, Highlight, NewBook } from '../types';
import { notedPosition, withNotedPosition } from './lastPosition';

/**
 * Binary data is kept apart from metadata so that saving reading progress on
 * every page turn never rewrites a cover or a PDF.
 */
interface ShelfSchema extends DBSchema {
  books: { key: string; value: Book };
  covers: { key: string; value: Blob };
  files: { key: string; value: Blob };
  highlights: { key: string; value: Highlight; indexes: { bookId: string } };
}

let connection: Promise<IDBPDatabase<ShelfSchema>> | null = null;
let notifyBlocked = () => {};

/** Called when an older version of the app, open in another tab, keeps the library from opening. */
export function onBlocked(listener: () => void) {
  notifyBlocked = listener;
}

function database() {
  connection ??= openDB<ShelfSchema>('my-shelf', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('covers');
        db.createObjectStore('files');
      }
      if (oldVersion < 2) {
        db.createObjectStore('highlights', { keyPath: 'id' }).createIndex('bookId', 'bookId');
      }
    },
    blocked() {
      notifyBlocked();
    },
    blocking(_current, _blocked, event) {
      // Another tab has a newer version of the app; step aside so that it can upgrade.
      (event.target as IDBDatabase).close();
      connection = null;
    },
    terminated() {
      connection = null;
    },
  })
    .then(async (db) => {
      await recoverPosition(db).catch((error: unknown) => console.error(error));
      return db;
    })
    .catch((error: unknown) => {
      connection = null;
      throw error;
    });
  return connection;
}

/** Catches up when the tab was closed before the last position could be stored. */
async function recoverPosition(db: IDBPDatabase<ShelfSchema>) {
  const position = notedPosition();
  if (!position) return;
  const tx = db.transaction('books', 'readwrite');
  const book = withNotedPosition(position, await tx.store.get(position.id));
  if (book) await tx.store.put(book);
  await tx.done;
}

/** Fills in fields that books stored by earlier versions of the app do not have. */
function upgradeBook(book: Book): Book {
  return { ...book, tags: book.tags ?? [], rating: book.rating ?? null };
}

export async function listBooks(): Promise<Book[]> {
  return (await (await database()).getAll('books')).map(upgradeBook);
}

export async function getBook(id: string) {
  const book = await (await database()).get('books', id);
  return book && upgradeBook(book);
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
  const tx = (await database()).transaction(
    ['books', 'covers', 'files', 'highlights'],
    'readwrite',
  );
  const highlights = tx.objectStore('highlights');
  const orphans = await highlights.index('bookId').getAllKeys(id);
  await Promise.all([
    ...orphans.map((key) => highlights.delete(key)),
    tx.objectStore('books').delete(id),
    tx.objectStore('covers').delete(id),
    tx.objectStore('files').delete(id),
    tx.done,
  ]);
}

/** Oldest first. */
export async function listHighlights(bookId: string): Promise<Highlight[]> {
  const found = await (await database()).getAllFromIndex('highlights', 'bookId', bookId);
  return found.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putHighlight(highlight: Highlight) {
  await (await database()).put('highlights', highlight);
}

export async function deleteHighlight(id: string) {
  await (await database()).delete('highlights', id);
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

import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getBook, getFile } from '../lib/db';
import { openPdf } from '../lib/pdf';
import type { Book } from '../types';
import { PageRenderer } from './PageRenderer';

export type BookDocument =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; book: Book; renderer: PageRenderer; pageCount: number; aspect: number };

/** Loads a stored book and opens its PDF, releasing everything when the reader closes. */
export function useBookDocument(bookId: string): BookDocument {
  const [state, setState] = useState<BookDocument>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof openPdf> | null = null;
    let renderer: PageRenderer | null = null;

    const load = async () => {
      const [book, file] = await Promise.all([getBook(bookId), getFile(bookId)]);
      if (!active) return;
      if (!book || !file) {
        setState({ status: 'failed', message: 'This book is no longer on your shelf.' });
        return;
      }
      task = openPdf(file);
      const doc = await task.promise;
      const aspect = await typicalAspect(doc);
      if (!active) return;
      renderer = new PageRenderer(doc);
      setState({ status: 'ready', book, renderer, pageCount: doc.numPages, aspect });
    };

    load().catch((error: unknown) => {
      if (!active) return;
      console.error(error);
      setState({ status: 'failed', message: 'This book could not be opened.' });
    });

    return () => {
      active = false;
      renderer?.destroy();
      void task?.destroy();
    };
  }, [bookId]);

  return state;
}

/**
 * The most common page proportions, from a small sample. Covers and fold-outs often differ
 * from the body, and the open book should be shaped like the body.
 */
async function typicalAspect(doc: PDFDocumentProxy) {
  const n = doc.numPages;
  const sample = new Set([2, 3, Math.ceil(n / 3), Math.ceil(n / 2), n - 1, 1].filter((p) => p >= 1 && p <= n));
  const counts = new Map<string, { aspect: number; count: number }>();
  for (const number of sample) {
    try {
      const { width, height } = (await doc.getPage(number)).getViewport({ scale: 1 });
      const aspect = width / height;
      const entry = counts.get(aspect.toFixed(2)) ?? { aspect, count: 0 };
      entry.count++;
      counts.set(aspect.toFixed(2), entry);
    } catch {
      // A damaged page should not stop the rest of the book from opening.
    }
  }
  const [best] = [...counts.values()].sort((a, b) => b.count - a.count);
  return best?.aspect ?? 0.7;
}

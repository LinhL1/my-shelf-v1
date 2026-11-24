import { useCallback, useRef, useState } from 'react';
import { deleteHighlight, putHighlight } from '../lib/db';
import { createId } from '../lib/id';
import type { Highlight, HighlightColor, HighlightPatch, HighlightSegment } from '../types';

/** The highlights of one book. Changes show at once and are written straight to storage. */
export function useHighlights(bookId: string, stored: Highlight[]) {
  const [highlights, setHighlights] = useState(stored);
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef(stored);

  const commit = useCallback((next: Highlight[], saved: Promise<void>) => {
    latest.current = next;
    setHighlights(next);
    saved.then(
      () => setSaveFailed(false),
      (error: unknown) => {
        console.error(error);
        setSaveFailed(true);
      },
    );
  }, []);

  const update = useCallback(
    (id: string, patch: HighlightPatch) => {
      const current = latest.current.find((h) => h.id === id);
      if (!current) return;
      const next = { ...current, ...patch, updatedAt: Date.now() };
      commit(latest.current.map((h) => (h.id === id ? next : h)), putHighlight(next));
    },
    [commit],
  );

  const insert = useCallback(
    (highlight: Highlight) => commit([...latest.current, highlight], putHighlight(highlight)),
    [commit],
  );

  /** Marks text, or recolours the highlight that already marks exactly that text. */
  const add = useCallback(
    (marked: { segments: HighlightSegment[]; text: string }, color: HighlightColor): string => {
      const same = latest.current.find((h) => isSame(h, marked));
      if (same) {
        update(same.id, { color });
        return same.id;
      }
      const now = Date.now();
      const { segments, text } = marked;
      const id = createId();
      insert({ id, bookId, segments, text, color, note: '', createdAt: now, updatedAt: now });
      return id;
    },
    [bookId, insert, update],
  );

  const remove = useCallback(
    (id: string) => commit(latest.current.filter((h) => h.id !== id), deleteHighlight(id)),
    [commit],
  );

  return { highlights, saveFailed, add, update, remove, restore: insert };
}

function isSame(highlight: Highlight, marked: { segments: HighlightSegment[]; text: string }) {
  if (highlight.text !== marked.text || highlight.segments.length !== marked.segments.length) return false;
  return highlight.segments.every((segment, i) => {
    const other = marked.segments[i]!;
    const [a, b] = [segment.rects[0]!, other.rects[0]!];
    return (
      segment.page === other.page && Math.abs(a.x - b.x) < 0.005 && Math.abs(a.y - b.y) < 0.005
    );
  });
}

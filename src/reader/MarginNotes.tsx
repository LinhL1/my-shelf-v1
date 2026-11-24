import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { useDevicePixelRatio } from '../lib/useDevicePixelRatio';
import type { Highlight, HighlightPatch } from '../types';
import { noteColumns, stackNotes } from './marginLayout';
import { NoteEditor } from './NoteEditor';
import { placeImage } from './pageGeometry';
import type { Box, PageRenderer } from './PageRenderer';
import type { Layout, Spread } from './spreads';

const NOTE_GAP = 12;
/** An open note may reach over the edge of the page to be comfortable to write in. */
const MIN_EDITOR = 190;

interface MarginNotesProps {
  renderer: PageRenderer;
  spread: Spread;
  layout: Layout;
  /** Size of a page. */
  box: Box;
  stage: Box;
  gutter: number;
  /** Left and right edge of what the notes sit beside, in stage coordinates. */
  beside: [left: number, right: number];
  /** Set while zoomed in: notes move up and down with the book. */
  scroller: RefObject<HTMLElement | null> | null;
  content: RefObject<HTMLElement | null>;
  highlights: Highlight[];
  active: { id: string; focus: boolean } | null;
  /** Pointed at, either the note or its highlight. */
  hoveredId: string | null;
  /** When the page has finished turning, in `performance.now()` time. Notes appear then. */
  showAt: number;
  onActivate: (id: string) => void;
  onHover: (id: string | null) => void;
  onChange: (id: string, patch: HighlightPatch) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/** Sticky notes in the blank space beside the book, level with their highlights and in their colour. */
export function MarginNotes(props: MarginNotesProps) {
  const { renderer, spread, layout, box, stage, gutter, highlights, active, hoveredId } = props;
  const dpr = useDevicePixelRatio();
  const leftImage = usePageImage(renderer, spread.left);
  const rightImage = usePageImage(renderer, spread.right);
  const elements = useRef(new Map<string, HTMLElement>());
  const [delay] = useState(() => Math.max(0, props.showAt - performance.now()));
  const [heights, setHeights] = useState<Record<string, number>>({});

  // Measured after every render, because typing, colours and widths all change heights.
  useLayoutEffect(() => {
    const measured: Record<string, number> = {};
    for (const [id, element] of elements.current) measured[id] = element.offsetHeight;
    setHeights((current) => (sameHeights(current, measured) ? current : measured));
  });

  const scrolledTop = useContentTop(props.scroller, props.content);
  const bookTop = scrolledTop ?? (stage.height - box.height) / 2;
  const columns = noteColumns(stage, gutter, ...props.beside);

  const place = (highlight: Highlight) => {
    const segment = highlight.segments.find((s) => s.page === spread.left || s.page === spread.right);
    if (!segment) return null;
    const { page, rects } = segment;
    const from = Math.min(...rects.map((r) => r.x));
    const to = Math.max(...rects.map((r) => r.x + r.width));
    const onLeft = layout === 'double' ? page === spread.left : (from + to) / 2 < 0.45;
    const image = page === spread.left ? leftImage : rightImage;
    const frame =
      image?.status === 'ready' ? placeImage(image, box, dpr) : { top: 0, height: box.height };
    return {
      highlight,
      side: onLeft ? ('left' as const) : ('right' as const),
      x: from,
      y: bookTop + frame.top + rects[0]!.y * frame.height,
    };
  };

  const placed = highlights
    .filter((h) => h.note.trim() || h.id === active?.id)
    .map(place)
    .filter((a) => a !== null);

  const notes = (['left', 'right'] as const).flatMap((side) => {
    const column = placed.filter((a) => a.side === side).sort((a, b) => a.y - b.y || a.x - b.x);
    const tops = stackNotes(
      column.map((a) => ({ y: a.y - 6, height: heights[a.highlight.id] ?? 88 })),
      stage.height,
      NOTE_GAP,
    );
    const density = column.length <= 4 ? 'roomy' : column.length <= 7 ? 'close' : 'tight';
    return column.map(({ highlight }, i) => {
      let { x, width } = columns[side];
      if (highlight.id === active?.id && width < MIN_EDITOR) {
        if (side === 'right') x -= MIN_EDITOR - width;
        width = MIN_EDITOR;
      }
      return { highlight, x, width, top: tops[i]!, density };
    });
  });

  return (
    <div
      className="margin-notes"
      style={{ animationDelay: `${delay}ms` }}
      aria-label="Notes"
      role="region"
    >
      {notes.map(({ highlight, x, width, top, density }) => {
        const { id } = highlight;
        const editing = id === active?.id;
        return (
          <div
            key={id}
            ref={(element) => {
              if (element) elements.current.set(id, element);
              return () => void elements.current.delete(id);
            }}
            className="margin-note"
            data-note={id}
            data-editing={editing}
            data-hovered={id === hoveredId}
            data-density={density}
            style={{ left: x, width, top }}
            onPointerEnter={() => props.onHover(id)}
            onPointerLeave={() => props.onHover(null)}
          >
            {editing ? (
              <NoteEditor
                highlight={highlight}
                focus={active.focus}
                onChange={(patch) => props.onChange(id, patch)}
                onRemove={() => props.onRemove(id)}
                onClose={props.onClose}
              />
            ) : (
              <button
                type="button"
                className="note-card"
                data-color={highlight.color}
                data-annotation-ui
                aria-label={`Note: ${highlight.note}. On: ${highlight.text}`}
                onClick={() => props.onActivate(id)}
                onFocus={() => props.onHover(id)}
                onBlur={() => props.onHover(null)}
              >
                <span className="note-text">{highlight.note.trim()}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Top of the zoomed book, in stage coordinates; null when not zoomed. */
function useContentTop(
  scroller: RefObject<HTMLElement | null> | null,
  content: RefObject<HTMLElement | null>,
) {
  return useSyncExternalStore(
    useCallback(
      (listener) => {
        const element = scroller?.current;
        element?.addEventListener('scroll', listener, { passive: true });
        return () => element?.removeEventListener('scroll', listener);
      },
      [scroller],
    ),
    () => {
      const stage = scroller?.current?.parentElement?.querySelector('.reader-stage');
      if (!stage || !content.current) return null;
      return Math.round(
        content.current.getBoundingClientRect().top - stage.getBoundingClientRect().top,
      );
    },
  );
}

function usePageImage(renderer: PageRenderer, page: number | null) {
  return useSyncExternalStore(
    useCallback(
      (listener) => (page === null ? () => {} : renderer.subscribe(page, listener)),
      [renderer, page],
    ),
    () => (page === null ? undefined : renderer.peek(page)),
  );
}

function sameHeights(a: Record<string, number>, b: Record<string, number>) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
}

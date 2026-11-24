import { createContext, useContext, useMemo } from 'react';
import type { Highlight, Rect } from '../types';

interface HighlightView {
  highlights: Highlight[];
  /** Highlight being edited, and the one pointed at (itself or through its note). */
  activeId: string | null;
  hoveredId: string | null;
  /** Whether to mark highlights that have a note, because the note itself is not on screen. */
  markNotes: boolean;
  activate: (id: string, clientY: number) => void;
}

export const HighlightContext = createContext<HighlightView>({
  highlights: [],
  activeId: null,
  hoveredId: null,
  markNotes: false,
  activate: () => {},
});

interface HighlightLayerProps {
  page: number;
  canvas: HTMLCanvasElement;
  interactive: boolean;
}

/**
 * Paints the highlights of a page. The pointer goes through to the text above, so that marked
 * text can be selected again; the buttons serve the keyboard and screen readers.
 */
export function HighlightLayer({ page, canvas, interactive }: HighlightLayerProps) {
  const view = useContext(HighlightContext);
  return view.highlights.map((highlight) => {
    const rects = highlight.segments.find((s) => s.page === page)?.rects;
    if (!rects) return null;
    const { id, color, note, text } = highlight;
    return (
      <HighlightMark
        key={id}
        rects={rects}
        canvas={canvas}
        className={view.markNotes && note.trim() ? 'has-note' : ''}
        color={color}
        emphasized={id === view.activeId || id === view.hoveredId}
        label={`Highlight: ${text}${note.trim() ? `. Note: ${note}` : ''}`}
        onActivate={interactive ? (y) => view.activate(id, y) : undefined}
      />
    );
  });
}

interface HighlightMarkProps {
  rects: Rect[];
  canvas: HTMLCanvasElement;
  className: string;
  color: string;
  emphasized: boolean;
  label: string;
  onActivate?: (clientY: number) => void;
}

function HighlightMark(props: HighlightMarkProps) {
  const { rects, canvas, className, color, emphasized, label, onActivate } = props;
  const dark = useMemo(() => isDarkBehind(canvas, rects[0]!), [canvas, rects]);
  return (
    <button
      type="button"
      className={`highlight ${className}`}
      data-color={color}
      data-dark={dark}
      data-emphasized={emphasized}
      aria-label={label}
      tabIndex={onActivate ? 0 : -1}
      onClick={(event) =>
        onActivate?.(event.currentTarget.firstElementChild!.getBoundingClientRect().top)
      }
    >
      {rects.map((rect, i) => (
        <span
          key={i}
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
          }}
        />
      ))}
    </button>
  );
}

/** Ink on paper is tinted by multiplying, which would not show on a dark background. */
function isDarkBehind(canvas: HTMLCanvasElement, rect: Rect) {
  const size = 12;
  const sample = document.createElement('canvas');
  sample.width = sample.height = size;
  const ctx = sample.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  ctx.drawImage(
    canvas,
    rect.x * width,
    rect.y * height,
    Math.max(1, rect.width * width),
    Math.max(1, rect.height * height),
    0,
    0,
    size,
    size,
  );
  const { data } = ctx.getImageData(0, 0, size, size);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return sum / (size * size) < 110;
}

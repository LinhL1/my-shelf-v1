import { useLayoutEffect, useRef, useState } from 'react';
import type { HighlightColor } from '../types';
import { NoteIcon } from '../ui/icons';
import { ColorSwatches } from './ColorSwatches';
import type { TextSelection } from './textSelection';

const GAP = 10;
/** Kept clear of the edges of the screen. */
const MARGIN = 8;

interface SelectionToolbarProps {
  selection: TextSelection;
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
}

/** Appears next to selected text. */
export function SelectionToolbar({ selection, onHighlight, onNote }: SelectionToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const { offsetWidth: width, offsetHeight: height } = ref.current!;
    const { first, last } = selection;
    const above = first.top - GAP - height;
    const below = last.bottom + GAP;
    const fitsBelow = below + height < window.innerHeight - MARGIN;
    // Phones show their own menu above selected text, and handles right under it.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const placeBelow = touch ? fitsBelow : above < MARGIN && fitsBelow;
    const line = placeBelow ? last : first;
    const left = line.left + line.width / 2 - width / 2;
    setPosition({
      left: Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - width)),
      top: Math.max(MARGIN, placeBelow ? below + (touch ? 18 : 0) : above),
    });
  }, [selection]);

  return (
    <div
      ref={ref}
      className="selection-toolbar"
      role="toolbar"
      aria-label="Highlight selected text"
      data-annotation-ui
      style={position}
      // Keeps the text selected.
      onMouseDown={(event) => event.preventDefault()}
    >
      <ColorSwatches action="Highlight in" onPick={onHighlight} />
      <span className="h-5 w-px bg-line" />
      <button type="button" className="icon-button h-8 gap-1.5 px-2 text-xs" onClick={onNote}>
        <NoteIcon className="size-4.5" />
        Add note
      </button>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Highlight, HighlightPatch } from '../types';
import { TrashIcon } from '../ui/icons';
import { ColorSwatches } from './ColorSwatches';

interface NoteEditorProps {
  highlight: Highlight;
  /** Whether to start typing right away. */
  focus: boolean;
  /** Repeats the marked text, for when it may not be on screen. */
  quote?: boolean;
  onChange: (patch: HighlightPatch) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Everything that can be done with a highlight. Changes are saved as they are made. */
export function NoteEditor(props: NoteEditorProps) {
  const { highlight, focus, quote, onChange, onRemove, onClose } = props;
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = input.current!;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [highlight.note]);

  useEffect(() => {
    const element = input.current!;
    if (!focus) return;
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
  }, [focus]);

  return (
    <div
      className="note-editor"
      role="group"
      aria-label="Highlight"
      data-color={highlight.color}
      data-annotation-ui
      onKeyDown={(event) => {
        const done =
          event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey));
        if (!done || event.nativeEvent.isComposing) return;
        event.stopPropagation();
        onClose();
      }}
    >
      {quote && <p className="note-quote">{highlight.text}</p>}
      <textarea
        ref={input}
        className="note-input"
        rows={2}
        aria-label="Note"
        placeholder="Add a note"
        value={highlight.note}
        onChange={(event) => onChange({ note: event.target.value })}
      />
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        <ColorSwatches
          action="Change highlight to"
          current={highlight.color}
          onPick={(color) => onChange({ color })}
        />
        <span className="ml-auto flex items-center">
          <button
            type="button"
            className="icon-button size-7"
            aria-label="Remove highlight"
            title="Remove highlight"
            onClick={onRemove}
          >
            <TrashIcon className="size-4" />
          </button>
          <button type="button" className="icon-button h-7 px-2 text-xs" onClick={onClose}>
            Done
          </button>
        </span>
      </div>
    </div>
  );
}

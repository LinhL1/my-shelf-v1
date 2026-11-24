import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

interface PageControlsProps {
  page: number;
  lastVisible: number;
  /** Human-readable visible pages, e.g. "12–13". */
  label: string;
  pageCount: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onTurn: (direction: 1 | -1) => void;
  onGoTo: (page: number) => void;
}

export function PageControls(props: PageControlsProps) {
  const { page, lastVisible, label, pageCount, canGoBack, canGoForward, onTurn, onGoTo } = props;
  // While the slider is being dragged it previews a page; the book only turns on release.
  const [preview, setPreview] = useState<number | null>(null);

  const commitPreview = () => {
    if (preview === null) return;
    onGoTo(preview);
    setPreview(null);
  };

  const position = preview ?? (lastVisible === pageCount ? pageCount : page);
  const fill = pageCount > 1 ? ((position - 1) / (pageCount - 1)) * 100 : 100;
  const percent = Math.round(((preview ?? lastVisible) / pageCount) * 100);

  return (
    <div className="mx-auto flex max-w-xl items-center gap-2 text-xs text-muted tabular-nums sm:gap-3">
      <button
        type="button"
        className="icon-button size-9 shrink-0"
        aria-label="Previous"
        disabled={!canGoBack}
        onClick={() => onTurn(-1)}
      >
        <ChevronLeftIcon className="size-4.5" />
      </button>
      <PageField
        label={preview === null ? label : String(preview)}
        pageCount={pageCount}
        onGoTo={onGoTo}
      />
      <input
        type="range"
        className="page-slider min-w-0 flex-1"
        style={{ '--fill': `${fill}%` } as CSSProperties}
        aria-label="Position in book"
        aria-valuetext={`Page ${position} of ${pageCount}`}
        min={1}
        max={pageCount}
        value={position}
        disabled={pageCount === 1}
        onChange={(event) => setPreview(Number(event.target.value))}
        onPointerUp={commitPreview}
        onKeyUp={commitPreview}
        onBlur={commitPreview}
      />
      <span className="w-9 shrink-0 text-right" aria-label={`${percent}% read`}>
        {percent}%
      </span>
      <button
        type="button"
        className="icon-button size-9 shrink-0"
        aria-label="Next"
        disabled={!canGoForward}
        onClick={() => onTurn(1)}
      >
        <ChevronRightIcon className="size-4.5" />
      </button>
    </div>
  );
}

interface PageFieldProps {
  label: string;
  pageCount: number;
  onGoTo: (page: number) => void;
}

/** Shows the visible pages; click it and type a number to jump. */
function PageField({ label, pageCount, onGoTo }: PageFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const editing = draft !== null;

  // Selects the number so typing replaces it, once the field shows the draft.
  useLayoutEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const finish = () => {
    const page = Number.parseInt(draft ?? '', 10);
    if (!cancelled.current && Number.isFinite(page)) onGoTo(page);
    setDraft(null);
  };

  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        ref={input}
        className="page-field"
        style={{ width: `${String(pageCount).length * 2 + 2.5}ch` }}
        inputMode="numeric"
        aria-label="Go to page"
        value={draft ?? label}
        onFocus={() => {
          cancelled.current = false;
          setDraft(label.split('–')[0]!);
        }}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          cancelled.current = event.key === 'Escape';
          event.currentTarget.blur();
        }}
      />
      <span>/ {pageCount}</span>
    </span>
  );
}

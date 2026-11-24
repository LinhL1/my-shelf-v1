import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { notePosition } from '../lib/lastPosition';
import { useLibrary } from '../lib/LibraryProvider';
import { openLibrary } from '../lib/router';
import { useDevicePixelRatio } from '../lib/useDevicePixelRatio';
import { useElementSize } from '../lib/useElementSize';
import { usePreference } from '../lib/usePreference';
import { HIGHLIGHT_COLORS, type Book, type Highlight, type HighlightColor } from '../types';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  DoublePageIcon,
  ExpandIcon,
  NoteIcon,
  SinglePageIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../ui/icons';
import { HighlightContext } from './HighlightLayer';
import { marginFit } from './marginLayout';
import { MarginNotes } from './MarginNotes';
import { NoteEditor } from './NoteEditor';
import { DOUBLE_TURN_MS, OpenBook, SINGLE_TURN_MS } from './OpenBook';
import { PageControls } from './PageControls';
import { highlightAt } from './pageGeometry';
import type { Box, PageRenderer } from './PageRenderer';
import { SelectionToolbar } from './SelectionToolbar';
import { firstPage, lastPage, spreadForPage, turnTarget, type Layout } from './spreads';
import { useBookDocument } from './useBookDocument';
import { useFullscreen } from './useFullscreen';
import { useHighlights } from './useHighlights';
import { useIdle } from './useIdle';
import { usePixelAlignment } from './usePixelAlignment';
import { useReaderKeys } from './useReaderKeys';
import { useSwipe } from './useSwipe';
import { useTextSelection } from './useTextSelection';
import { useZoom } from './useZoom';

/** A click on text waits this long before turning the page, in case it is a double click. */
const DOUBLE_CLICK_MS = 240;
/** Moving the pointer further than this makes it a drag. */
const CLICK_SLOP = 5;
const UNDO_MS = 7000;
const RESUMED_MS = 3000;

export default function ReaderView({ bookId }: { bookId: string }) {
  const source = useBookDocument(bookId);

  if (source.status === 'ready') {
    return (
      <Reader
        book={source.book}
        storedHighlights={source.highlights}
        renderer={source.renderer}
        pageCount={source.pageCount}
        aspect={source.aspect}
      />
    );
  }
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-desk">
      {source.status === 'loading' ? (
        <span className="page-loading spinner" role="status" aria-label="Opening book" />
      ) : (
        <>
          <p className="text-sm">{source.message}</p>
          <button type="button" className="button" onClick={openLibrary}>
            Back to library
          </button>
        </>
      )}
    </div>
  );
}

/** Whole device pixels; an even width, so that half a page is whole too. */
function snapBox(width: number, height: number, dpr: number): Box {
  return {
    width: (Math.floor((width * dpr) / 2) * 2) / dpr,
    height: Math.floor(height * dpr) / dpr,
  };
}

interface ReaderProps {
  book: Book;
  storedHighlights: Highlight[];
  renderer: PageRenderer;
  pageCount: number;
  aspect: number;
}

/** The highlight being edited. */
interface Active {
  id: string;
  /** Whether to start typing a note right away. */
  focus: boolean;
  /** Where it is on screen, so that a docked editor can stay out of its way. */
  clientY: number;
}

function Reader({ book, storedHighlights, renderer, pageCount, aspect }: ReaderProps) {
  const { updateBook } = useLibrary();
  const root = useRef<HTMLDivElement>(null);
  const [mainRef, main] = useElementSize<HTMLElement>();
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [preferred, setPreferred] = usePreference<Layout>('layout', ['single', 'double'], 'double');
  const [notesShown, setNotesShown] = usePreference('notes', ['shown', 'hidden'], 'shown');
  const [color, setColor] = usePreference<HighlightColor>(
    'highlight-color',
    HIGHLIGHT_COLORS,
    'yellow',
  );
  const [position, setPosition] = useState({
    page: Math.min(Math.max(book.currentPage, 1), pageCount),
    animate: false,
    turnedAt: -Infinity,
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const fullscreen = useFullscreen(root);
  const idle = useIdle(fullscreen.active);
  const dpr = useDevicePixelRatio();
  const { zoom, zoomed, scroller, content, dragHandlers, ...zoomControls } = useZoom(root);
  const { highlights, ...edit } = useHighlights(book.id, storedHighlights);
  const [active, setActive] = useState<Active | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Highlight | null>(null);
  const [resumedAt, setResumedAt] = useState(position.page > 1 ? position.page : null);

  const canPair = stage.width >= 768 && stage.height >= 420 && stage.width > stage.height * 0.95;
  const layout: Layout = canPair && preferred === 'double' ? 'double' : 'single';
  const { page } = position;
  const spread = useMemo(() => spreadForPage(page, pageCount, layout), [page, pageCount, layout]);

  // Notes go in the blank space beside the book. Where there is too little of it, a book that has
  // notes makes room for them. While zoomed the book keeps its size, and its notes get a rail on
  // each side of the screen instead.
  const gutter = (main.width - stage.width) / 2;
  const maxColumns = layout === 'double' ? 2 : 1;
  const fullWidth = Math.min(stage.width / maxColumns, stage.height * aspect) * maxColumns;
  const margin = marginFit(stage.width, gutter, fullWidth);
  const hasNotes = highlights.some((h) => h.note.trim() !== '');
  const notesFit = notesShown === 'shown' && margin.possible;
  // Once made, room stays until the page turns, so that closing a note never moves the book.
  const [opened, setOpened] = useState(false);
  if (active !== null && !opened) setOpened(true);
  const wantsRoom = notesFit && (hasNotes || opened);
  const [makeRoom, setMakeRoom] = useState(wantsRoom);
  if (makeRoom !== wantsRoom && !zoomed) setMakeRoom(wantsRoom);
  const rail = zoomed && wantsRoom ? margin.rail : 0;
  const bookWidth = makeRoom ? Math.min(fullWidth, margin.maxBookWidth) : fullWidth;

  const box = useMemo(() => {
    const width = bookWidth / maxColumns;
    return snapBox(width, width / aspect, dpr);
  }, [bookWidth, maxColumns, aspect, dpr]);
  const zoomedBox = useMemo(
    () => (zoom === 1 ? box : snapBox(box.width * zoom, box.height * zoom, dpr)),
    [box, zoom, dpr],
  );
  const columns = layout === 'double' && spread.left !== null && spread.right !== null ? 2 : 1;

  usePixelAlignment(scroller, content, dpr);

  // Rails narrow the zoomed view from both sides; what is in it stays where it was on screen.
  const previousRail = useRef(rail);
  useLayoutEffect(() => {
    const change = rail - previousRail.current;
    previousRail.current = rail;
    if (change !== 0 && zoomed && scroller.current) scroller.current.scrollLeft += change;
  }, [rail, zoomed, scroller]);

  const goTo = useCallback(
    (target: number, animate = true) => {
      const next = Math.min(Math.max(Math.round(target), 1), pageCount);
      const turnedAt = animate ? performance.now() : -Infinity;
      setPosition((current) =>
        current.page === next ? current : { page: next, animate, turnedAt },
      );
    },
    [pageCount],
  );
  const previous = turnTarget(spread, -1, pageCount);
  const next = turnTarget(spread, 1, pageCount);
  const turn = (direction: 1 | -1, animate = true) => {
    const target = direction === 1 ? next : previous;
    if (target !== null) goTo(target, animate);
  };

  // Render what is visible first, then what the reader is most likely to turn to.
  useEffect(() => {
    const nearby = [firstPage(spread), lastPage(spread)];
    for (const [start, step] of [[lastPage(spread), 1], [firstPage(spread), -1]] as const) {
      for (let i = 1; i <= 2; i++) nearby.push(start + step * i);
    }
    const pages = [...new Set(nearby)].filter((p) => p >= 1 && p <= pageCount);
    renderer.request(pages, box);
  }, [renderer, spread, box, dpr, pageCount]);

  // A new page is read from its top.
  useLayoutEffect(() => {
    scroller.current?.scrollTo(layout === 'double' ? { top: 0, left: 0 } : { top: 0 });
  }, [scroller, spread.index, layout]);

  const savedPage = firstPage(spread);
  const savedProgress = lastPage(spread) / pageCount;
  const measured = stage.width > 0;
  useEffect(() => {
    // Until the stage is measured the layout, and so the progress, is not final.
    if (!measured) return;
    const patch = {
      currentPage: page,
      // Having only opened the book does not count as progress.
      progress: savedPage === 1 && pageCount > 1 ? 0 : savedProgress,
      lastOpened: Date.now(),
    };
    notePosition({ id: book.id, ...patch });
    updateBook(book.id, patch).then(
      () => setSaveFailed(false),
      (error: unknown) => {
        console.error(error);
        setSaveFailed(true);
      },
    );
  }, [book.id, updateBook, measured, page, savedPage, savedProgress, pageCount]);

  useReaderKeys({
    turn,
    first: () => goTo(1),
    last: () => goTo(pageCount),
    zoomIn: zoomControls.zoomIn,
    zoomOut: zoomControls.zoomOut,
    resetZoom: zoomControls.reset,
    scroll: zoomed
      ? (direction) => scroller.current?.scrollBy({ top: direction * 140, behavior: 'smooth' })
      : undefined,
    toggleFullscreen: fullscreen.supported ? fullscreen.toggle : undefined,
    dismiss: () => {
      setActive(null);
      selected.clear();
    },
  });
  const swipe = useSwipe((direction) => turn(direction), !zoomed);

  const selected = useTextSelection(root, `${spread.index} ${layout} ${zoomedBox.width}`);
  const highlightSelection = (withColor: HighlightColor) => {
    if (!selected.selection) return null;
    const id = edit.add(selected.selection, withColor);
    selected.clear();
    return id;
  };
  const removeHighlight = (id: string) => {
    setRemoved(highlights.find((h) => h.id === id) ?? null);
    setActive(null);
    edit.remove(id);
  };
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);
  useEffect(() => {
    const timer = setTimeout(() => setResumedAt(null), RESUMED_MS);
    return () => clearTimeout(timer);
  }, []);

  // An open note belongs to what is on screen.
  useEffect(() => {
    setActive(null);
    setOpened(false);
  }, [spread.index]);
  const activeHighlight = active ? highlights.find((h) => h.id === active.id) : undefined;
  const highlightView = useMemo(
    () => ({
      highlights,
      activeId: active?.id ?? null,
      hoveredId,
      markNotes: !notesFit,
      activate: (id: string, clientY: number) => setActive({ id, focus: true, clientY }),
    }),
    [highlights, active?.id, hoveredId, notesFit],
  );

  // Pressing anywhere but on a note closes it. That press does nothing else.
  const press = useRef({ x: 0, y: 0, mouse: true, dismisses: false });
  const pendingTurn = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pendingTurn.current), []);
  const onPressStart = (event: PointerEvent) => {
    const onNote = (event.target as Element).closest('[data-annotation-ui]') !== null;
    const hasSelection = document.getSelection()?.isCollapsed === false;
    clearTimeout(pendingTurn.current);
    press.current = {
      x: event.clientX,
      y: event.clientY,
      mouse: event.pointerType === 'mouse',
      dismisses: !onNote && (active !== null || hasSelection),
    };
    if (!onNote) setActive(null);
    setResumedAt(null);
  };

  const highlightUnder = (event: MouseEvent) => {
    const host = (event.target as Element).closest<HTMLElement>('.text-host');
    if (!host) return undefined;
    const rect = host.getBoundingClientRect();
    return highlightAt(
      highlights,
      Number(host.dataset.page),
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  };
  const onBookClick = (event: MouseEvent) => {
    const target = event.target as Element;
    const { x, y, mouse, dismisses } = press.current;
    if (!target.closest('.text-host')) return;
    // Neither the end of a drag nor a double click on a word.
    if (Math.hypot(event.clientX - x, event.clientY - y) > CLICK_SLOP) return;
    if (document.getSelection()?.isCollapsed === false) return;
    const highlight = highlightUnder(event);
    if (highlight) {
      setActive({ id: highlight.id, focus: mouse, clientY: event.clientY });
      return;
    }
    if (zoomed || dismisses) return;
    const direction = event.clientX < window.innerWidth / 2 ? -1 : 1;
    if (mouse && target.closest('.text-layer span')) {
      pendingTurn.current = setTimeout(() => turn(direction), DOUBLE_CLICK_MS);
    } else {
      turn(direction);
    }
  };
  const onBookPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    // Over a note, the note itself decides.
    if ((event.target as Element).closest('.margin-note')) return;
    const id = event.buttons === 0 ? (highlightUnder(event)?.id ?? null) : null;
    if (id !== hoveredId) setHoveredId(id);
  };
  const onZoneClick = (event: MouseEvent, direction: 1 | -1) => {
    // Keyboard clicks have no press to consider.
    if (event.detail > 0 && press.current.dismisses) return;
    turn(direction);
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = book.title;
    return () => {
      document.title = previousTitle;
    };
  }, [book.title]);

  const label =
    firstPage(spread) === lastPage(spread)
      ? `${firstPage(spread)}`
      : `${firstPage(spread)}–${lastPage(spread)}`;

  return (
    <div
      ref={root}
      className={`reader ${idle ? 'is-idle' : ''}`}
      onPointerDownCapture={onPressStart}
    >
      <header className="reader-bar grid grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-3 px-3 pt-2 sm:px-5">
        <button
          type="button"
          className="icon-button h-9 justify-self-start pr-3 pl-1.5 text-sm"
          aria-label="Back to library"
          onClick={openLibrary}
        >
          <ChevronLeftIcon className="size-5" />
          <span className="hidden sm:inline">Library</span>
        </button>
        <p className="truncate text-center font-serif text-sm text-muted" title={book.title}>
          {book.title}
        </p>
        <div className="flex items-center gap-1 justify-self-end">
          {zoomed && (
            <button
              type="button"
              className="icon-button h-9 min-w-12 px-1 text-xs tabular-nums"
              aria-label={`Zoom ${Math.round(zoom * 100)}%. Reset zoom`}
              title="Reset zoom"
              onClick={zoomControls.reset}
            >
              {Math.round(zoom * 100)}%
            </button>
          )}
          <button
            type="button"
            className="icon-button size-9 max-sm:hidden"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!zoomed}
            onClick={zoomControls.zoomOut}
          >
            <ZoomOutIcon className="size-5" />
          </button>
          <button
            type="button"
            className="icon-button size-9 max-sm:hidden"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={!zoomControls.canZoomIn}
            onClick={zoomControls.zoomIn}
          >
            <ZoomInIcon className="size-5" />
          </button>
          {margin.possible && (
            <button
              type="button"
              className="icon-button size-9"
              aria-label={notesShown === 'shown' ? 'Hide notes' : 'Show notes'}
              title={notesShown === 'shown' ? 'Hide notes' : 'Show notes'}
              onClick={() => setNotesShown(notesShown === 'shown' ? 'hidden' : 'shown')}
            >
              <NoteIcon className={`size-5 ${notesShown === 'shown' ? 'text-ink' : ''}`} />
            </button>
          )}
          {canPair && (
            <button
              type="button"
              className="icon-button size-9"
              aria-label={layout === 'double' ? 'Show one page' : 'Show two pages'}
              title={layout === 'double' ? 'Show one page' : 'Show two pages'}
              onClick={() => setPreferred(layout === 'double' ? 'single' : 'double')}
            >
              {layout === 'double' ? (
                <SinglePageIcon className="size-5" />
              ) : (
                <DoublePageIcon className="size-5" />
              )}
            </button>
          )}
          {fullscreen.supported && (
            <button
              type="button"
              className="icon-button size-9"
              aria-label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
              title={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={fullscreen.toggle}
            >
              {fullscreen.active ? (
                <CollapseIcon className="size-5" />
              ) : (
                <ExpandIcon className="size-5" />
              )}
            </button>
          )}
        </div>
      </header>

      <main
        ref={mainRef}
        className={`reader-main ${hoveredId ? 'is-over-highlight' : ''}`}
        {...swipe}
        onClick={onBookClick}
        onPointerMove={onBookPointerMove}
        onDragStart={(event) => event.preventDefault()}
        onWheel={(event) => {
          // The rails beside a zoomed book scroll it too.
          if (!zoomed || event.ctrlKey || !(event.target as Element).closest('.margin-notes, .turn-zone')) return;
          scroller.current?.scrollBy({ top: event.deltaY });
        }}
      >
        <div ref={stageRef} className="reader-stage" />
        <div
          ref={scroller}
          className={`reader-scroller ${zoomed ? 'is-zoomed' : ''}`}
          style={rail > 0 ? { left: rail, right: rail } : undefined}
          {...dragHandlers}
        >
          <div
            ref={content}
            className="reader-content"
            style={{ width: zoomedBox.width * columns, height: zoomedBox.height }}
          >
            {box.width > 0 && (
              <HighlightContext value={highlightView}>
                <OpenBook
                  renderer={renderer}
                  spread={spread}
                  layout={layout}
                  box={zoomedBox}
                  pageCount={pageCount}
                  animate={position.animate && !zoomed}
                  scroller={zoomed ? scroller : null}
                />
              </HighlightContext>
            )}
          </div>
        </div>
        {/* Hidden rather than removed while zoomed: removing the element under a finger ends its gesture. */}
        <button
          type="button"
          className="turn-zone left-0"
          hidden={zoomed}
          aria-label="Previous page"
          disabled={previous === null}
          onClick={(event) => onZoneClick(event, -1)}
        >
          <ChevronLeftIcon className="turn-arrow" />
        </button>
        <button
          type="button"
          className="turn-zone right-0"
          hidden={zoomed}
          aria-label="Next page"
          disabled={next === null}
          onClick={(event) => onZoneClick(event, 1)}
        >
          <ChevronRightIcon className="turn-arrow" />
        </button>
        {notesFit && wantsRoom && (
          <MarginNotes
            key={`${spread.index} ${layout}`}
            renderer={renderer}
            spread={spread}
            layout={layout}
            box={zoomedBox}
            stage={stage}
            gutter={gutter}
            beside={
              zoomed
                ? [rail - gutter, stage.width + gutter - rail]
                : [(stage.width - box.width * columns) / 2, (stage.width + box.width * columns) / 2]
            }
            scroller={zoomed ? scroller : null}
            content={content}
            highlights={highlights}
            active={active}
            hoveredId={hoveredId}
            showAt={position.turnedAt + (layout === 'double' ? DOUBLE_TURN_MS : SINGLE_TURN_MS)}
            onActivate={(id) => setActive({ id, focus: true, clientY: 0 })}
            onHover={setHoveredId}
            onChange={edit.update}
            onRemove={removeHighlight}
            onClose={() => setActive(null)}
          />
        )}
      </main>

      {selected.selection && (
        <SelectionToolbar
          selection={selected.selection}
          onHighlight={(picked) => {
            setColor(picked);
            highlightSelection(picked);
          }}
          onNote={() => {
            const clientY = selected.selection!.first.top;
            const id = highlightSelection(color);
            if (id) setActive({ id, focus: true, clientY });
          }}
        />
      )}
      {active && activeHighlight && !notesFit && (
        <div
          className="note-sheet"
          data-annotation-ui
          data-place={active.clientY > window.innerHeight / 2 ? 'top' : 'bottom'}
        >
          <NoteEditor
            key={active.id}
            highlight={activeHighlight}
            focus={active.focus}
            quote
            onChange={(patch) => edit.update(active.id, patch)}
            onRemove={() => removeHighlight(active.id)}
            onClose={() => setActive(null)}
          />
        </div>
      )}
      {removed ? (
        <div className="reader-toast" role="status" data-annotation-ui>
          Highlight removed
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              edit.restore(removed);
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </div>
      ) : (
        resumedAt !== null && (
          <div className="reader-toast pointer-events-none" role="status">
            Continuing from page {resumedAt}
          </div>
        )
      )}

      <footer className="reader-bar px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        {edit.saveFailed && (
          <p className="pb-1 text-center text-xs text-danger" role="alert">
            Your highlights and notes could not be saved.
          </p>
        )}
        {saveFailed && (
          <p className="pb-1 text-center text-xs text-danger" role="alert">
            Your reading position could not be saved.
          </p>
        )}
        <PageControls
          page={firstPage(spread)}
          lastVisible={lastPage(spread)}
          label={label}
          pageCount={pageCount}
          canGoBack={previous !== null}
          canGoForward={next !== null}
          onTurn={turn}
          onGoTo={goTo}
        />
      </footer>
    </div>
  );
}

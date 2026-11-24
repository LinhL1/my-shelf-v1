import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../lib/LibraryProvider';
import { openLibrary } from '../lib/router';
import { useElementSize } from '../lib/useElementSize';
import { usePreference } from '../lib/usePreference';
import type { Book } from '../types';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  DoublePageIcon,
  ExpandIcon,
  SinglePageIcon,
} from '../ui/icons';
import { OpenBook } from './OpenBook';
import { PageControls } from './PageControls';
import type { PageRenderer } from './PageRenderer';
import { firstPage, lastPage, spreadForPage, turnTarget, type Layout } from './spreads';
import { useBookDocument } from './useBookDocument';
import { useFullscreen } from './useFullscreen';
import { useIdle } from './useIdle';
import { useReaderKeys } from './useReaderKeys';
import { useSwipe } from './useSwipe';

export default function ReaderView({ bookId }: { bookId: string }) {
  const source = useBookDocument(bookId);

  if (source.status === 'ready') {
    return (
      <Reader
        book={source.book}
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

interface ReaderProps {
  book: Book;
  renderer: PageRenderer;
  pageCount: number;
  aspect: number;
}

function Reader({ book, renderer, pageCount, aspect }: ReaderProps) {
  const { updateBook } = useLibrary();
  const root = useRef<HTMLDivElement>(null);
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [preferred, setPreferred] = usePreference<Layout>('layout', ['single', 'double'], 'double');
  const [position, setPosition] = useState({
    page: Math.min(Math.max(book.currentPage, 1), pageCount),
    animate: false,
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const fullscreen = useFullscreen(root);
  const idle = useIdle(fullscreen.active);

  const canPair = stage.width >= 768 && stage.height >= 420 && stage.width > stage.height * 0.95;
  const layout: Layout = canPair && preferred === 'double' ? 'double' : 'single';
  const { page } = position;
  const spread = useMemo(() => spreadForPage(page, pageCount, layout), [page, pageCount, layout]);

  const box = useMemo(() => {
    const columns = layout === 'double' ? 2 : 1;
    const width = Math.min(stage.width / columns, stage.height * aspect);
    return { width: Math.floor(width), height: Math.floor(width / aspect) };
  }, [stage, layout, aspect]);

  const goTo = useCallback(
    (target: number, animate = true) => {
      const next = Math.min(Math.max(Math.round(target), 1), pageCount);
      setPosition((current) => (current.page === next ? current : { page: next, animate }));
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
  }, [renderer, spread, box, pageCount]);

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
    toggleFullscreen: fullscreen.supported ? fullscreen.toggle : undefined,
  });
  const swipe = useSwipe((direction) => turn(direction));

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
    <div ref={root} className={`reader ${idle ? 'is-idle' : ''}`}>
      <header className="reader-bar grid grid-cols-[1fr_minmax(0,2fr)_1fr] items-center gap-3 px-3 pt-2 sm:px-5">
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
        <div className="flex gap-1 justify-self-end">
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

      <main className="reader-main" {...swipe}>
        <button
          type="button"
          className="turn-zone left-0"
          aria-label="Previous page"
          disabled={previous === null}
          onClick={() => turn(-1)}
        >
          <ChevronLeftIcon className="turn-arrow" />
        </button>
        <div ref={stageRef} className="reader-stage">
          {box.width > 0 && (
            <OpenBook
              renderer={renderer}
              spread={spread}
              layout={layout}
              box={box}
              pageCount={pageCount}
              animate={position.animate}
            />
          )}
        </div>
        <button
          type="button"
          className="turn-zone right-0"
          aria-label="Next page"
          disabled={next === null}
          onClick={() => turn(1)}
        >
          <ChevronRightIcon className="turn-arrow" />
        </button>
      </main>

      <footer className="reader-bar px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
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

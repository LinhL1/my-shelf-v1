import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { Box, PageRenderer } from './PageRenderer';

interface PageProps {
  renderer: PageRenderer;
  page: number;
  box: Box;
  /** Which edge is bound; `none` for a loose single page. */
  side: 'left' | 'right' | 'none';
}

/** A sheet of paper showing one PDF page, scaled to fit without distortion. */
export function Page({ renderer, page, box, side }: PageProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSyncExternalStore(
    useCallback((listener) => renderer.subscribe(page, listener), [renderer, page]),
    () => renderer.peek(page),
  );

  // Drawn before paint, so a cached page is never seen blank.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || image?.status !== 'ready') return;
    canvas.width = image.canvas.width;
    canvas.height = image.canvas.height;
    canvas.getContext('2d')!.drawImage(image.canvas, 0, 0);
  }, [image]);

  const fit =
    image?.status === 'ready' ? Math.min(box.width / image.width, box.height / image.height) : 1;

  return (
    <div className={`page page-${side}`} data-page={page} data-status={image?.status ?? 'loading'}>
      {image?.status === 'ready' && (
        <canvas
          ref={ref}
          role="img"
          aria-label={`Page ${page}`}
          style={{ width: image.width * fit, height: image.height * fit }}
        />
      )}
      {!image && <span className="page-loading spinner" />}
      {image?.status === 'failed' && (
        <p className="px-6 text-center text-sm text-muted">Page {page} could not be displayed.</p>
      )}
    </div>
  );
}

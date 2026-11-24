import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useDevicePixelRatio } from '../lib/useDevicePixelRatio';
import { HighlightLayer } from './HighlightLayer';
import { PageDetail } from './PageDetail';
import { placeImage } from './pageGeometry';
import type { Box, PageRenderer } from './PageRenderer';
import { TextLayer } from './TextLayer';

interface PageProps {
  renderer: PageRenderer;
  page: number;
  box: Box;
  /** Which edge is bound; `none` for a loose single page. */
  side: 'left' | 'right' | 'none';
  /** Set while zoomed in: the element the page is panned in. */
  scroller?: RefObject<HTMLElement | null> | null;
  /** Whether text can be selected; not while the page is turning. */
  interactive?: boolean;
}

/** A sheet of paper showing one PDF page, scaled to fit without distortion. */
export function Page({ renderer, page, box, side, scroller, interactive = false }: PageProps) {
  const dpr = useDevicePixelRatio();
  const image = useSyncExternalStore(
    useCallback((listener) => renderer.subscribe(page, listener), [renderer, page]),
    () => renderer.peek(page),
  );
  const status = image?.status ?? 'loading';

  let content = null;
  if (!image) {
    content = <span className="page-loading spinner" />;
  } else if (image.status === 'failed') {
    content = (
      <p className="px-6 text-center text-sm text-muted">Page {page} could not be displayed.</p>
    );
  } else {
    const { pixelWidth, pixelHeight, ...place } = placeImage(image, box, dpr);
    content = (
      <div className="page-image" style={place}>
        <PageCanvas source={image.canvas} label={`Page ${page}`} />
        {scroller && (
          <PageDetail
            key={page}
            renderer={renderer}
            page={page}
            pixelWidth={pixelWidth}
            pixelHeight={pixelHeight}
            dpr={dpr}
            scroller={scroller}
          />
        )}
        <HighlightLayer page={page} canvas={image.canvas} interactive={interactive} />
        {interactive && (
          <TextLayer
            key={`text-${page}`}
            renderer={renderer}
            page={page}
            scale={place.width / image.unitWidth}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`page page-${side}`} data-page={page} data-status={status}>
      {content}
    </div>
  );
}

function PageCanvas({ source, label }: { source: HTMLCanvasElement; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  // Drawn before paint, so a cached page is never seen blank.
  useLayoutEffect(() => {
    const canvas = ref.current!;
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d')!.drawImage(source, 0, 0);
  }, [source]);

  return <canvas ref={ref} className="page-canvas" role="img" aria-label={label} />;
}

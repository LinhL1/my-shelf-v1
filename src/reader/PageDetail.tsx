import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { MAX_PIXELS, type PageRenderer, type Region, type RegionTask } from './PageRenderer';

/** Waits for a zoom gesture to pause before rendering at the new scale. */
const SETTLE_MS = 120;
const SCROLL_INTERVAL_MS = 50;
/** How far beyond the visible area to render, as a share of it, so short pans need no new render. */
const MARGIN = 0.3;

interface PageDetailProps {
  renderer: PageRenderer;
  page: number;
  /** Full size of the zoomed page in device pixels. */
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  scroller: RefObject<HTMLElement | null>;
}

/**
 * A sharp overlay for a zoomed page. Only the part on screen is rendered, at the exact resolution
 * of the display, so text stays crisp at any zoom without ever needing an enormous canvas.
 */
export function PageDetail(props: PageDetailProps) {
  const { renderer, page, pixelWidth, pixelHeight, dpr, scroller } = props;
  const host = useRef<HTMLDivElement>(null);
  const shown = useRef<{ canvas: HTMLCanvasElement; region: Region; width: number; height: number } | null>(null);

  // Until the new scale is rendered, the previous detail stretches along with the page.
  useLayoutEffect(() => {
    const old = shown.current;
    if (!old || old.width === pixelWidth) return;
    place(old.canvas, old.region, (value, axis) => `${(value / old[axis]) * 100}%`);
  }, [pixelWidth]);

  useEffect(() => {
    const element = host.current;
    const viewport = scroller.current;
    if (!element || !viewport) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let task: RegionTask | null = null;
    let stale = false;

    const schedule = (delay: number) => {
      timer ??= setTimeout(() => {
        timer = undefined;
        void update();
      }, delay);
    };

    const update = async () => {
      if (task) {
        stale = true;
        return;
      }
      const visible = visibleRegion(element, viewport, pixelWidth, pixelHeight);
      if (!visible) return;
      const current = shown.current;
      if (current?.width === pixelWidth && contains(current.region, visible)) return;

      const region = expand(visible, pixelWidth, pixelHeight);
      task = renderer.renderRegion(page, region, pixelWidth);
      const canvas = await task.result;
      task = null;
      if (canvas) {
        place(canvas, region, (value) => `${value / dpr}px`);
        element.replaceChildren(canvas);
        shown.current = { canvas, region, width: pixelWidth, height: pixelHeight };
      }
      if (stale) {
        stale = false;
        schedule(0);
      }
    };

    const onScroll = () => schedule(SCROLL_INTERVAL_MS);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    schedule(SETTLE_MS);
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      // Keeps `update` from continuing after cleanup.
      stale = false;
      task?.cancel();
    };
  }, [renderer, page, pixelWidth, pixelHeight, dpr, scroller]);

  useEffect(() => () => renderer.releaseRegions(page), [renderer, page]);

  return <div ref={host} className="page-detail" aria-hidden="true" />;
}

function place(
  canvas: HTMLCanvasElement,
  region: Region,
  unit: (value: number, axis: 'width' | 'height') => string,
) {
  Object.assign(canvas.style, {
    position: 'absolute',
    left: unit(region.x, 'width'),
    top: unit(region.y, 'height'),
    width: unit(region.width, 'width'),
    height: unit(region.height, 'height'),
  });
}

/** The part of the page inside the scroller, in the page's device pixels. */
function visibleRegion(
  page: HTMLElement,
  viewport: HTMLElement,
  pixelWidth: number,
  pixelHeight: number,
): Region | null {
  const p = page.getBoundingClientRect();
  const v = viewport.getBoundingClientRect();
  const left = Math.max(p.left, v.left);
  const top = Math.max(p.top, v.top);
  const right = Math.min(p.right, v.right);
  const bottom = Math.min(p.bottom, v.bottom);
  if (right <= left || bottom <= top) return null;
  const sx = pixelWidth / p.width;
  const sy = pixelHeight / p.height;
  const x = Math.floor((left - p.left) * sx);
  const y = Math.floor((top - p.top) * sy);
  return {
    x,
    y,
    width: Math.min(pixelWidth, Math.ceil((right - p.left) * sx)) - x,
    height: Math.min(pixelHeight, Math.ceil((bottom - p.top) * sy)) - y,
  };
}

function expand(region: Region, pixelWidth: number, pixelHeight: number): Region {
  const grown = region.width * region.height * (1 + MARGIN * 2) ** 2;
  if (grown > MAX_PIXELS) return region;
  const dx = Math.round(region.width * MARGIN);
  const dy = Math.round(region.height * MARGIN);
  const x = Math.max(0, region.x - dx);
  const y = Math.max(0, region.y - dy);
  return {
    x,
    y,
    width: Math.min(pixelWidth, region.x + region.width + dx) - x,
    height: Math.min(pixelHeight, region.y + region.height + dy) - y,
  };
}

function contains(outer: Region, inner: Region) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

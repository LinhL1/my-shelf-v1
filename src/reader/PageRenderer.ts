import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { createTextLayer } from '../lib/pdf';

export interface Box {
  width: number;
  height: number;
}

/** A page as currently available: rendered, failed, or (undefined) not ready yet. */
export type PageImage =
  | {
      status: 'ready';
      canvas: HTMLCanvasElement;
      width: number;
      height: number;
      /** Width in the PDF's own units, which its text is positioned in. */
      unitWidth: number;
    }
  | { status: 'failed' };

/** Part of a page, in device pixels of the page at a given width. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionTask {
  /** Null when the render was cancelled or failed. */
  result: Promise<HTMLCanvasElement | null>;
  cancel: () => void;
}

export interface TextTask {
  /** False when cancelled or failed. */
  result: Promise<boolean>;
  cancel: () => void;
}

interface CacheEntry {
  key: string;
  image: PageImage;
}

interface Job {
  page: number;
  key: string;
  task?: RenderTask;
  cancelled: boolean;
}

const CACHE_SIZE = 12;
/** Keeps a single canvas below the limits of mobile browsers. */
export const MAX_PIXELS = 12_000_000;

/**
 * Renders the pages the reader asks for, most important first, and caches the results.
 * Requests that are no longer wanted are cancelled, so skimming quickly stays responsive.
 */
export class PageRenderer {
  private readonly cache = new Map<number, CacheEntry>();
  private readonly listeners = new Map<number, Set<() => void>>();
  private wanted: number[] = [];
  private box: Box = { width: 0, height: 0 };
  private active: Job | null = null;
  private destroyed = false;
  private readonly doc: PDFDocumentProxy;

  constructor(doc: PDFDocumentProxy) {
    this.doc = doc;
  }

  /** Declares which pages are needed, in priority order, and the CSS box they must fit in. */
  request(pages: number[], box: Box) {
    if (this.destroyed || box.width < 1 || box.height < 1) return;
    this.wanted = pages;
    this.box = box;
    const { active } = this;
    if (active && (active.key !== this.key() || !pages.includes(active.page))) {
      active.cancelled = true;
      active.task?.cancel();
    }
    void this.pump();
  }

  /** The best available image. After a resize this may briefly be one rendered at another scale. */
  peek(page: number): PageImage | undefined {
    return this.cache.get(page)?.image;
  }

  subscribe(page: number, listener: () => void) {
    let set = this.listeners.get(page);
    if (!set) this.listeners.set(page, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(page);
    };
  }

  /** Renders part of a page, as it looks when the whole page is `pixelWidth` device pixels wide. */
  renderRegion(pageNumber: number, region: Region, pixelWidth: number): RegionTask {
    let task: RenderTask | undefined;
    let cancelled = false;

    const run = async () => {
      const page = await this.doc.getPage(pageNumber);
      if (cancelled || this.destroyed) return null;
      const scale = pixelWidth / page.getViewport({ scale: 1 }).width;
      const canvas = document.createElement('canvas');
      canvas.width = region.width;
      canvas.height = region.height;
      task = page.render({
        canvas,
        viewport: page.getViewport({ scale, offsetX: -region.x, offsetY: -region.y }),
      });
      await task.promise;
      return cancelled ? null : canvas;
    };

    return {
      result: run().catch((error: unknown) => {
        // The page's base image stays visible, so this only costs sharpness.
        if (!cancelled && !this.destroyed) console.error(`Page ${pageNumber} detail failed`, error);
        return null;
      }),
      cancel: () => {
        cancelled = true;
        task?.cancel();
      },
    };
  }

  /** Fills `container` with the selectable text of a page. */
  renderText(pageNumber: number, container: HTMLElement): TextTask {
    let layer: ReturnType<typeof createTextLayer> | undefined;
    let cancelled = false;

    const run = async () => {
      const page = await this.doc.getPage(pageNumber);
      if (cancelled || this.destroyed) return false;
      layer = createTextLayer(page, container);
      await layer.render();
      return !cancelled;
    };

    return {
      result: run().catch((error: unknown) => {
        // The page can still be read, only not highlighted.
        if (!cancelled && !this.destroyed) console.error(`Page ${pageNumber} text failed`, error);
        return false;
      }),
      cancel: () => {
        cancelled = true;
        layer?.cancel();
      },
    };
  }

  /** Frees the parsed page that is kept between region renders to make panning fast. */
  releaseRegions(pageNumber: number) {
    if (this.destroyed) return;
    this.doc.getPage(pageNumber).then(
      (page) => page.cleanup(),
      () => {},
    );
  }

  destroy() {
    this.destroyed = true;
    if (this.active) {
      this.active.cancelled = true;
      this.active.task?.cancel();
    }
    this.cache.clear();
    this.listeners.clear();
  }

  private key() {
    return `${this.box.width}x${this.box.height}@${window.devicePixelRatio}`;
  }

  private async pump() {
    if (this.active || this.destroyed) return;
    const key = this.key();
    const page = this.wanted.find((p) => this.cache.get(p)?.key !== key);
    if (page === undefined) return;

    const job: Job = { page, key, cancelled: false };
    this.active = job;
    try {
      const image = await this.render(job);
      if (image) this.store(page, { key, image });
    } catch (error) {
      if (!job.cancelled) {
        console.error(`Page ${page} could not be rendered`, error);
        this.store(page, { key, image: { status: 'failed' } });
      }
    } finally {
      this.active = null;
    }
    void this.pump();
  }

  private async render(job: Job): Promise<PageImage | null> {
    const { width: boxWidth, height: boxHeight } = this.box;
    const page = await this.doc.getPage(job.page);
    if (job.cancelled) return null;

    const natural = page.getViewport({ scale: 1 });
    const fit = Math.min(boxWidth / natural.width, boxHeight / natural.height);
    const width = natural.width * fit;
    const height = natural.height * fit;
    const density = Math.min(
      Math.max(window.devicePixelRatio, 1),
      Math.sqrt(MAX_PIXELS / (width * height)),
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    job.task = page.render({ canvas, viewport: page.getViewport({ scale: fit * density }) });
    await job.task.promise;
    page.cleanup();
    return { status: 'ready', canvas, width, height, unitWidth: natural.width / page.userUnit };
  }

  private store(page: number, entry: CacheEntry) {
    if (this.destroyed) return;
    // Re-inserting moves the page to the most recent end of the map.
    this.cache.delete(page);
    this.cache.set(page, entry);
    for (const old of this.cache.keys()) {
      if (this.cache.size <= CACHE_SIZE) break;
      if (!this.wanted.includes(old)) this.cache.delete(old);
    }
    this.listeners.get(page)?.forEach((listener) => listener());
  }
}

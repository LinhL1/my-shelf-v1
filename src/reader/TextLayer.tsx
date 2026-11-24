import { useEffect, useRef, type CSSProperties } from 'react';
import type { PageRenderer, TextTask } from './PageRenderer';

/** Skimming past a page should not cost the work of laying out its text. */
const DELAY_MS = 80;

interface TextLayerProps {
  renderer: PageRenderer;
  page: number;
  /** CSS pixels per PDF unit. */
  scale: number;
}

/** The page's text, invisible but selectable, exactly on top of the picture of it. */
export function TextLayer({ renderer, page, scale }: TextLayerProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current!;
    let task: TextTask | undefined;
    const timer = setTimeout(async () => {
      const layer = document.createElement('div');
      layer.className = 'text-layer';
      task = renderer.renderText(page, layer);
      if (await task.result) element.replaceChildren(layer);
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      task?.cancel();
      element.replaceChildren();
    };
  }, [renderer, page]);

  return (
    <div
      ref={host}
      className="text-host"
      data-page={page}
      style={{ '--total-scale-factor': scale } as CSSProperties}
    />
  );
}

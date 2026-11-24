import { useLayoutEffect, type RefObject } from 'react';

/**
 * Nudges centred content by less than a pixel so that it starts exactly on a device pixel.
 * Without this, centring often leaves pages between pixels, where the browser blurs them slightly.
 */
export function usePixelAlignment(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  dpr: number,
) {
  // Runs after every render, because any change of size can move the content.
  useLayoutEffect(() => {
    const viewport = scroller.current;
    const element = content.current;
    if (!viewport || !element) return;

    const align = () => {
      element.style.left = '0';
      element.style.top = '0';
      const rect = element.getBoundingClientRect();
      const x = rect.left + viewport.scrollLeft;
      const y = rect.top + viewport.scrollTop;
      element.style.left = `${Math.round(x * dpr) / dpr - x}px`;
      element.style.top = `${Math.round(y * dpr) / dpr - y}px`;
    };
    align();
    // Appearing scrollbars re-centre the content without a render.
    const observer = new ResizeObserver(align);
    observer.observe(viewport);
    return () => observer.disconnect();
  });
}

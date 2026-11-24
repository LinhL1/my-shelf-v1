import { useRef, type TouchEvent } from 'react';

const MIN_DISTANCE = 45;

/** Horizontal swipe detection. Ignored while the page is pinch-zoomed, where a drag means panning. */
export function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0]!;
      const zoomed = (window.visualViewport?.scale ?? 1) > 1.05;
      start.current =
        event.touches.length === 1 && !zoomed ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const origin = start.current;
      start.current = null;
      if (!origin) return;
      const touch = event.changedTouches[0]!;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => {
      start.current = null;
    },
  };
}

import { useRef, type TouchEvent } from 'react';

const MIN_DISTANCE = 45;

/** Horizontal swipe detection. Disabled while zoomed in, where a drag means panning. */
export function useSwipe(onSwipe: (direction: 1 | -1) => void, enabled: boolean) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0]!;
      const onNote = (event.target as Element).closest('[data-annotation-ui]') !== null;
      const zoomed = (window.visualViewport?.scale ?? 1) > 1.05;
      start.current =
        enabled && event.touches.length === 1 && !zoomed && !onNote
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const origin = start.current;
      start.current = null;
      // A drag that selects text is not a swipe.
      if (!origin || document.getSelection()?.isCollapsed === false) return;
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

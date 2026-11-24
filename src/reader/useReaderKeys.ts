import { useEffect, useRef } from 'react';

interface ReaderKeys {
  turn: (direction: 1 | -1, animate: boolean) => void;
  first: () => void;
  last: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  /** Scrolls a zoomed page. Absent when there is nothing to scroll. */
  scroll?: (direction: 1 | -1) => void;
  toggleFullscreen?: () => void;
  /** Closes an open note and clears the selection. */
  dismiss: () => void;
}

const SLIDER_KEYS: Record<string, string> = { ArrowUp: 'ArrowRight', ArrowDown: 'ArrowLeft' };

export function useReaderKeys(keys: ReaderKeys) {
  const current = useRef(keys);
  useEffect(() => {
    current.current = keys;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) return;
      const actions = current.current;
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const typing =
        event.target instanceof HTMLTextAreaElement || (input !== null && input.type !== 'range');
      const command = event.ctrlKey || event.metaKey;

      // As in other PDF readers, Ctrl/Cmd zooms the page rather than the interface.
      if (command || !typing) {
        const zoom = {
          '+': actions.zoomIn,
          '=': actions.zoomIn,
          '-': actions.zoomOut,
          _: actions.zoomOut,
          '0': actions.resetZoom,
        }[event.key];
        if (zoom) {
          event.preventDefault();
          zoom();
          return;
        }
      }
      if (command || typing) return;

      // A held-down key skims without animating each turn.
      const animate = !event.repeat;
      // On the slider, up and down step through the book like left and right do.
      const key = input ? (SLIDER_KEYS[event.key] ?? event.key) : event.key;
      switch (key) {
        case 'ArrowRight':
        case 'PageDown':
          actions.turn(1, animate);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          actions.turn(-1, animate);
          break;
        case 'ArrowDown':
        case 'ArrowUp':
          if (!actions.scroll) return;
          actions.scroll(key === 'ArrowDown' ? 1 : -1);
          break;
        case 'Home':
          actions.first();
          break;
        case 'End':
          actions.last();
          break;
        case 'Escape':
          actions.dismiss();
          break;
        case 'f':
          if (!event.repeat) actions.toggleFullscreen?.();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

import { useEffect, useRef } from 'react';

interface ReaderKeys {
  turn: (direction: 1 | -1, animate: boolean) => void;
  first: () => void;
  last: () => void;
  toggleFullscreen?: () => void;
}

const SLIDER_KEYS: Record<string, string> = { ArrowUp: 'ArrowRight', ArrowDown: 'ArrowLeft' };

export function useReaderKeys(keys: ReaderKeys) {
  const current = useRef(keys);
  useEffect(() => {
    current.current = keys;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (input && input.type !== 'range') return;

      const { turn, first, last, toggleFullscreen } = current.current;
      // A held-down key skims without animating each turn.
      const animate = !event.repeat;
      // On the slider, up and down step through the book like left and right do.
      const key = input ? (SLIDER_KEYS[event.key] ?? event.key) : event.key;
      switch (key) {
        case 'ArrowRight':
        case 'PageDown':
          turn(1, animate);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          turn(-1, animate);
          break;
        case 'Home':
          first();
          break;
        case 'End':
          last();
          break;
        case 'f':
          if (!event.repeat) toggleFullscreen?.();
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

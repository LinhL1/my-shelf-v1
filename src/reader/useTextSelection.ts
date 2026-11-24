import { useCallback, useEffect, useState, type RefObject } from 'react';
import { enableMouseSelection } from './mouseSelection';
import { readSelection, type TextSelection } from './textSelection';

/**
 * The finished text selection in the book: after the mouse is released, or once touch handles
 * and the keyboard pause. `layoutKey` changes whenever the text moves on screen.
 */
export function useTextSelection(root: RefObject<HTMLElement | null>, layoutKey: string) {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  useEffect(() => (root.current ? enableMouseSelection(root.current) : undefined), [root]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pressed = false;
    // On touch screens, pressing a button can clear the selection that the button acts on.
    let onToolbar = false;

    const read = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (root.current && !pressed) setSelection(readSelection(root.current));
      }, delay);
    };
    const onSelectionChange = () => {
      if (onToolbar) return;
      if (document.getSelection()?.isCollapsed !== false) {
        clearTimeout(timer);
        setSelection(null);
      } else {
        read(200);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      onToolbar = (event.target as Element).closest('.selection-toolbar') !== null;
      pressed = event.pointerType === 'mouse' && !onToolbar;
    };
    const onPointerUp = () => {
      if (!pressed) return;
      pressed = false;
      // A click on a selection only clears it after this event.
      read(10);
    };
    const onMove = () => {
      if (document.getSelection()?.isCollapsed === false) read(80);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [root]);

  useEffect(() => {
    setSelection((current) => (current && root.current ? readSelection(root.current) : current));
  }, [root, layoutKey]);

  const clear = useCallback(() => {
    document.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clear };
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';

const MAX_ZOOM = 6;
const STEP = 1.25;
/** Wheel events closer together than this belong to the same gesture. */
const GESTURE_GAP_MS = 250;
/** Caps a single wheel event, so a mouse notch zooms about as far as a button press. */
const MAX_WHEEL_DELTA = 22;

interface Point {
  x: number;
  y: number;
}

/** A spot in the book (as fractions of its size) that should end up under a spot on screen. */
interface Anchor extends Point {
  fx: number;
  fy: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Returns to exactly 1 when close to it, so the book always settles back into its resting place. */
const limit = (zoom: number) => (zoom < 1.03 ? 1 : Math.min(zoom, MAX_ZOOM));

/**
 * Zooming and panning of the open book: trackpad pinch, Ctrl + wheel, touch pinch, and steps.
 * The book is laid out larger inside a native scroller, rather than scaled with a transform,
 * which keeps it sharp and gives momentum scrolling for free.
 */
export function useZoom(root: RefObject<HTMLElement | null>) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const anchor = useRef<Anchor | null>(null);
  const gesture = useRef<{ anchor: Anchor; time: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomed = zoom > 1;

  const anchorAt = useCallback((point: Point): Anchor => {
    const rect = content.current!.getBoundingClientRect();
    return {
      ...point,
      fx: clamp((point.x - rect.left) / rect.width, 0, 1),
      fy: clamp((point.y - rect.top) / rect.height, 0, 1),
    };
  }, []);

  // Once the book has its new size, scroll so that the anchored spot stays put.
  useLayoutEffect(() => {
    const target = anchor.current;
    anchor.current = null;
    if (!target || !scroller.current || !content.current) return;
    const rect = content.current.getBoundingClientRect();
    scroller.current.scrollLeft += rect.left + target.fx * rect.width - target.x;
    scroller.current.scrollTop += rect.top + target.fy * rect.height - target.y;
  }, [zoom]);

  const zoomBy = useCallback((factor: number, target: Anchor) => {
    anchor.current = target;
    setZoom((current) => limit(current * factor));
  }, []);

  const step = (factor: number) => {
    const rect = scroller.current!.getBoundingClientRect();
    zoomBy(factor, anchorAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
  };

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    // Browsers report a trackpad pinch as a wheel event with ctrlKey set.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (!content.current) return;
      const pixels = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 16;
      const delta = clamp(pixels, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
      const point = { x: event.clientX, y: event.clientY };

      // A spot that cannot stay put at first, while the book still fits the screen,
      // is brought back under the pointer as the same gesture continues.
      const last = gesture.current;
      const continues =
        last !== null &&
        event.timeStamp - last.time < GESTURE_GAP_MS &&
        Math.hypot(point.x - last.anchor.x, point.y - last.anchor.y) < 4;
      const target = continues ? last.anchor : anchorAt(point);
      gesture.current = { anchor: target, time: event.timeStamp };
      zoomBy(Math.exp(-delta * 0.01), target);
    };

    let pinch: { distance: number; factor: number; anchor: Anchor } | null = null;
    const middle = ([a, b]: TouchList | Touch[]) => ({
      x: (a!.clientX + b!.clientX) / 2,
      y: (a!.clientY + b!.clientY) / 2,
    });
    const distance = ([a, b]: TouchList | Touch[]) =>
      Math.hypot(a!.clientX - b!.clientX, a!.clientY - b!.clientY);
    const onTouchStart = (event: TouchEvent) => {
      pinch =
        event.touches.length === 2 && content.current
          ? {
              distance: Math.max(1, distance(event.touches)),
              factor: 1,
              anchor: anchorAt(middle(event.touches)),
            }
          : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      const factor = distance(event.touches) / pinch.distance;
      zoomBy(factor / pinch.factor, { ...pinch.anchor, ...middle(event.touches) });
      pinch.factor = factor;
    };
    const onTouchEnd = () => {
      pinch = null;
    };

    // Safari on macOS reports a trackpad pinch with its own gesture events instead.
    let trackpad: { scale: number; anchor: Anchor } | null = null;
    const onGesture = (event: Event) => {
      if (navigator.maxTouchPoints > 0) return;
      event.preventDefault();
      if (!content.current) return;
      const { scale, clientX, clientY } = event as MouseEvent & { scale: number };
      if (event.type === 'gesturestart' || !trackpad) {
        trackpad = { scale: 1, anchor: anchorAt({ x: clientX, y: clientY }) };
      } else {
        zoomBy(scale / trackpad.scale, trackpad.anchor);
        trackpad.scale = scale;
      }
    };

    const active = { passive: false };
    element.addEventListener('wheel', onWheel, active);
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, active);
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('gesturestart', onGesture, active);
    element.addEventListener('gesturechange', onGesture, active);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('gesturestart', onGesture);
      element.removeEventListener('gesturechange', onGesture);
    };
  }, [root, anchorAt, zoomBy]);

  // With a mouse, the zoomed book is moved by dragging it.
  const dragging = useRef<Point | null>(null);
  const dragHandlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const box = event.currentTarget;
      const onScrollbar = event.nativeEvent.offsetX > box.clientWidth || event.nativeEvent.offsetY > box.clientHeight;
      if (!zoomed || event.pointerType !== 'mouse' || event.button !== 0) return;
      if (event.target === box && onScrollbar) return;
      // Dragging across text selects it instead.
      if ((event.target as Element).closest('.text-layer span')) return;
      event.preventDefault();
      box.setPointerCapture(event.pointerId);
      dragging.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const from = dragging.current;
      if (!from) return;
      event.currentTarget.scrollLeft -= event.clientX - from.x;
      event.currentTarget.scrollTop -= event.clientY - from.y;
      dragging.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: () => {
      dragging.current = null;
    },
    onPointerCancel: () => {
      dragging.current = null;
    },
  };

  return {
    zoom,
    zoomed,
    scroller,
    content,
    dragHandlers,
    canZoomIn: zoom < MAX_ZOOM,
    zoomIn: () => step(STEP),
    zoomOut: () => step(1 / STEP),
    reset: () => setZoom(1),
  };
}

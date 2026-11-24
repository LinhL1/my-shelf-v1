import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Page } from './Page';
import type { Box, PageRenderer } from './PageRenderer';
import type { Layout, Spread } from './spreads';

export const DOUBLE_TURN_MS = 620;
export const SINGLE_TURN_MS = 340;
const EASING = 'cubic-bezier(0.45, 0.05, 0.35, 1)';
/** Widest the block of unread or read pages gets at the edge of the book. */
const MAX_EDGE = 7;

interface OpenBookProps {
  renderer: PageRenderer;
  spread: Spread;
  layout: Layout;
  box: Box;
  pageCount: number;
  /** Whether reaching this spread should be animated. */
  animate: boolean;
  /** Set while zoomed in: the element the book is panned in. */
  scroller: RefObject<HTMLElement | null> | null;
}

interface Turn {
  from: Spread;
  to: Spread;
}

/** The book itself. When `spread` changes, one leaf turns over from the old spread to the new one. */
export function OpenBook(props: OpenBookProps) {
  const { renderer, spread, layout, box, pageCount, animate, scroller } = props;
  const [shown, setShown] = useState({ spread, layout });
  const [turn, setTurn] = useState<Turn | null>(null);

  // Derive the turn while rendering, so there is never a frame showing the wrong pages.
  const settled = turn?.to ?? shown.spread;
  if (layout !== shown.layout) {
    setShown({ spread, layout });
    setTurn(null);
  } else if (spread.index !== settled.index) {
    setShown({ spread: settled, layout });
    if (animate && !prefersReducedMotion()) {
      setTurn({ from: settled, to: spread });
    } else {
      setShown({ spread, layout });
      setTurn(null);
    }
  }

  const finishTurn = () => {
    if (!turn) return;
    setShown({ spread: turn.to, layout });
    setTurn(null);
  };

  const leaf = turn && (
    <Leaf
      key={`${turn.from.index}-${turn.to.index}`}
      renderer={renderer}
      turn={turn}
      layout={layout}
      box={box}
      onFinish={finishTurn}
    />
  );
  const forward = turn !== null && turn.to.index > turn.from.index;

  if (layout === 'single') {
    // Turning forward lifts the old page off the new one; backward lays the new one over the old.
    const under = turn ? (forward ? turn.to : turn.from) : shown.spread;
    return (
      <div className="open-book" data-turning={turn !== null} style={box}>
        <Page
          renderer={renderer}
          page={under.right!}
          box={box}
          side="none"
          scroller={scroller}
          interactive={turn === null}
        />
        {leaf}
      </div>
    );
  }

  const left = turn ? (forward ? turn.from.left : turn.to.left) : shown.spread.left;
  const right = turn ? (forward ? turn.to.right : turn.from.right) : shown.spread.right;

  // A lone first or last page sits in the middle of the screen, like a closed book.
  const shift = spread.left === null ? -box.width / 2 : spread.right === null ? box.width / 2 : 0;
  const read = (spread.index * 2) / pageCount;
  const edge = Math.min(MAX_EDGE, 1 + pageCount / 40);

  return (
    <div
      className="open-book"
      data-turning={turn !== null}
      style={{
        width: box.width * 2,
        height: box.height,
        transform: shift === 0 ? undefined : `translateX(${shift}px)`,
        transition: turn ? `transform ${DOUBLE_TURN_MS}ms ${EASING}` : 'none',
      }}
    >
      {left !== null && (
        <div className="half half-left" style={box}>
          <span className="page-edge page-edge-left" style={{ width: Math.round(edge * read) }} />
          <Page
            renderer={renderer}
            page={left}
            box={box}
            side="left"
            scroller={scroller}
            interactive={turn === null}
          />
        </div>
      )}
      {right !== null && (
        <div className="half half-right" style={box}>
          <span
            className="page-edge page-edge-right"
            style={{ width: Math.round(edge * (1 - read)) }}
          />
          <Page
            renderer={renderer}
            page={right}
            box={box}
            side="right"
            scroller={scroller}
            interactive={turn === null}
          />
        </div>
      )}
      {leaf}
    </div>
  );
}

interface LeafProps {
  renderer: PageRenderer;
  turn: Turn;
  layout: Layout;
  box: Box;
  onFinish: () => void;
}

/** The sheet in motion: hinged at the gutter, with the outgoing page on one face and the incoming on the other. */
function Leaf({ renderer, turn, layout, box, onFinish }: LeafProps) {
  const ref = useRef<HTMLDivElement>(null);
  const finish = useRef(onFinish);
  useLayoutEffect(() => {
    finish.current = onFinish;
  });

  const forward = turn.to.index > turn.from.index;
  const double = layout === 'double';
  const front = forward ? turn.from.right : turn.to.right;
  const back = forward ? turn.to.left : turn.from.left;

  useLayoutEffect(() => {
    const leaf = ref.current!;
    const flat = 'rotateY(0deg)';
    const turned = double ? 'rotateY(-180deg)' : 'rotateY(-92deg)';
    const options: KeyframeAnimationOptions = {
      duration: double ? DOUBLE_TURN_MS : SINGLE_TURN_MS,
      easing: double ? EASING : forward ? 'ease-in' : 'ease-out',
      fill: 'both',
    };
    const motion = leaf.animate(
      { transform: forward ? [flat, turned] : [turned, flat] },
      options,
    );
    const shades = [...leaf.querySelectorAll('.leaf-shade')].map((shade) =>
      shade.animate({ opacity: double ? [0, 1, 0] : forward ? [0, 1] : [1, 0] }, options),
    );
    motion.onfinish = () => finish.current();
    return () => [motion, ...shades].forEach((animation) => animation.cancel());
  }, [forward, double]);

  return (
    <div ref={ref} className="leaf" style={{ ...box, left: double ? box.width : 0 }}>
      {front !== null && (
        <div className="leaf-face">
          <Page renderer={renderer} page={front} box={box} side={double ? 'right' : 'none'} />
          <span className="leaf-shade leaf-shade-front" />
        </div>
      )}
      {double && back !== null && (
        <div className="leaf-face leaf-back">
          <Page renderer={renderer} page={back} box={box} side="left" />
          <span className="leaf-shade leaf-shade-back" />
        </div>
      )}
    </div>
  );
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

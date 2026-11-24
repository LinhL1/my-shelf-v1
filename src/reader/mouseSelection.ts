interface Caret {
  node: Text;
  offset: number;
}

/**
 * Selects text in the book with the mouse. A text layer is made of scattered spans, where browsers
 * lose the start of a selection or let it jump across the page whenever the pointer is between
 * them. Here it always follows the character nearest to the pointer. Touch selection is native.
 */
export function enableMouseSelection(root: HTMLElement) {
  let anchor: Caret | null = null;
  let start = { x: 0, y: 0 };
  let dragging = false;
  // Taps are followed by mouse events too, but two quick taps turn two pages.
  let touched = false;

  const onPointerDown = (event: PointerEvent) => {
    touched = event.pointerType === 'touch';
  };
  const onMouseDown = (event: MouseEvent) => {
    anchor = null;
    const target = event.target as Element;
    if (touched || event.button !== 0 || !target.closest('.text-host')) return;
    // While zoomed, dragging anything but text moves the page.
    if (target.closest('.is-zoomed') && !target.closest('.text-layer span')) return;
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const selection = document.getSelection();
    const caret = caretAt(root, event.clientX, event.clientY);
    if (!selection || !caret) return;
    if (event.shiftKey && !selection.isCollapsed && selection.anchorNode instanceof Text) {
      anchor = { node: selection.anchorNode, offset: selection.anchorOffset };
      select(anchor, caret);
    } else if (event.detail === 2 && target.closest('.text-layer span')) {
      selectWord(caret);
    } else if (event.detail > 2 && target.closest('.text-layer span')) {
      select({ node: caret.node, offset: 0 }, { node: caret.node, offset: caret.node.length });
    } else {
      selection.removeAllRanges();
      anchor = caret;
    }
    start = { x: event.clientX, y: event.clientY };
    dragging = false;
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!anchor) return;
    if (event.buttons !== 1 || !anchor.node.isConnected) {
      anchor = null;
      return;
    }
    // Not yet on the slightest movement of a click.
    dragging ||= Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3;
    if (!dragging) return;
    const caret = caretAt(root, event.clientX, event.clientY);
    if (caret) select(anchor, caret);
  };

  const onMouseUp = () => {
    anchor = null;
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

function select(from: Caret, to: Caret) {
  document.getSelection()?.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
}

function selectWord({ node, offset }: Caret) {
  const inWord = (index: number) => /[\p{L}\p{N}\p{M}'\u2019-]/u.test(node.data.charAt(index));
  let from = offset;
  let to = offset;
  while (from > 0 && inWord(from - 1)) from--;
  while (to < node.length && inWord(to)) to++;
  if (from < to) select({ node, offset: from }, { node, offset: to });
}

/** The place in the text nearest to a spot on screen. */
function caretAt(root: HTMLElement, x: number, y: number): Caret | null {
  const host = nearest(root.querySelectorAll<HTMLElement>('.text-host'), x, y, 1);
  // Lines are much wider than they are high, so vertical distance counts for more.
  const span = host && nearest(host.querySelectorAll<HTMLElement>('.text-layer span'), x, y, 4);
  const node = span?.firstChild;
  return node instanceof Text ? { node, offset: offsetAt(node, x, y) } : null;
}

function nearest(elements: Iterable<HTMLElement>, x: number, y: number, verticalWeight: number) {
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const dx = Math.max(rect.left - x, x - rect.right, 0);
    const dy = Math.max(rect.top - y, y - rect.bottom, 0);
    const distance = Math.hypot(dx, dy * verticalWeight);
    if (distance >= bestDistance || rect.width === 0 || !element.textContent) continue;
    best = element;
    bestDistance = distance;
  }
  return best;
}

/** How many characters lie before a spot, in whichever direction the text runs. */
function offsetAt(node: Text, x: number, y: number) {
  const center = (index: number) => {
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const first = center(0);
  const last = center(node.length - 1);
  if (node.length === 1) return x > first.x ? 1 : 0;
  const horizontal = Math.abs(last.x - first.x) >= Math.abs(last.y - first.y);
  const along = (point: { x: number; y: number }) => (horizontal ? point.x : point.y);
  const forward = along(last) >= along(first);
  const isBefore = (index: number) => along(center(index)) < along({ x, y }) === forward;

  let low = 0;
  let high = node.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (isBefore(middle)) low = middle + 1;
    else high = middle;
  }
  return low;
}

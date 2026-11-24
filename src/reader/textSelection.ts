import type { HighlightSegment, Rect } from '../types';

export interface TextSelection {
  segments: HighlightSegment[];
  text: string;
  /** First and last line, in client coordinates. */
  first: DOMRect;
  last: DOMRect;
}

/** The part of the current selection that is text in the book, or null. */
export function readSelection(root: HTMLElement): TextSelection | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);

  const segments: HighlightSegment[] = [];
  const lines: DOMRect[] = [];
  let text = '';
  for (const host of root.querySelectorAll<HTMLElement>('.text-host')) {
    if (!range.intersectsNode(host)) continue;
    const found = selectedText(host, range);
    const frame = host.getBoundingClientRect();
    if (found.lines.length === 0 || frame.width === 0) continue;
    text += `${found.text} `;
    lines.push(...found.lines);
    segments.push({
      page: Number(host.dataset.page),
      rects: found.lines.map((line) => toFractions(line, frame)),
    });
  }
  if (segments.length === 0) return null;
  return {
    segments,
    // Ligatures become plain letters.
    text: text.normalize('NFKC').replace(/\s+/g, ' ').trim(),
    first: lines[0]!,
    last: lines.at(-1)!,
  };
}

function selectedText(host: HTMLElement, range: Range) {
  let text = '';
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    if (node.nodeName === 'BR') text += '\n';
    if (!(node instanceof Text)) continue;
    const part = document.createRange();
    part.setStart(node, node === range.startContainer ? range.startOffset : 0);
    part.setEnd(node, node === range.endContainer ? range.endOffset : node.length);
    const content = part.toString();
    text += content;
    if (content.trim()) rects.push(...part.getClientRects());
  }
  return { text, lines: mergeIntoLines(rects) };
}

/** Joins neighbouring pieces of text into one rectangle per line. */
function mergeIntoLines(rects: DOMRect[]) {
  const lines: DOMRect[] = [];
  for (const rect of rects) {
    if (rect.width < 0.5 || rect.height < 0.5) continue;
    const last = lines.at(-1);
    if (last && sameLine(last, rect)) {
      const x = Math.min(last.left, rect.left);
      const y = Math.min(last.top, rect.top);
      lines[lines.length - 1] = new DOMRect(
        x,
        y,
        Math.max(last.right, rect.right) - x,
        Math.max(last.bottom, rect.bottom) - y,
      );
    } else {
      lines.push(rect);
    }
  }
  return lines;
}

function sameLine(a: DOMRect, b: DOMRect) {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const gap = Math.max(b.left - a.right, a.left - b.right);
  // A wide gap is the space between two columns.
  return overlap > Math.min(a.height, b.height) / 2 && gap < Math.max(a.height, b.height) * 1.5;
}

function toFractions(rect: DOMRect, frame: DOMRect): Rect {
  const fraction = (value: number) => Math.round(Math.min(Math.max(value, 0), 1) * 1e5) / 1e5;
  const x = fraction((rect.left - frame.left) / frame.width);
  const y = fraction((rect.top - frame.top) / frame.height);
  return {
    x,
    y,
    width: fraction((rect.right - frame.left) / frame.width) - x,
    height: fraction((rect.bottom - frame.top) / frame.height) - y,
  };
}

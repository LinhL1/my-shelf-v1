/** Everything about a book except its binary data, which is stored separately. */
export interface Book {
  id: string;
  title: string;
  author: string;
  pageCount: number;
  /** Cover proportions (width / height) and physical height in PDF points, used to size the book object. */
  coverAspect: number;
  coverHeightPt: number;
  spineColor: string;
  dateAdded: number;
  lastOpened: number | null;
  /** 1-based page the reader was on. */
  currentPage: number;
  /** 0–1. */
  progress: number;
  fileName: string;
  fileSize: number;
  /** PDF document fingerprint, used to detect duplicate imports. */
  fingerprint: string;
  /** Free-form labels such as “TBR” or “Fiction”, in the order they were added. */
  tags: string[];
  /** 1–5 stars, or null when the book has not been rated. */
  rating: number | null;
}

export type BookPatch = Partial<Omit<Book, 'id'>>;

export interface NewBook {
  book: Book;
  cover: Blob;
  file: Blob;
}

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** Part of a page, as fractions (0–1) of its size, so it holds at any zoom or layout. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightSegment {
  page: number;
  /** One per line of text, in reading order. */
  rects: Rect[];
}

/** Marked text, with an optional note. */
export interface Highlight {
  id: string;
  bookId: string;
  /** Usually one; a highlight that runs across facing pages has one for each. */
  segments: HighlightSegment[];
  text: string;
  color: HighlightColor;
  /** Empty when there is no note. */
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type HighlightPatch = Partial<Pick<Highlight, 'color' | 'note'>>;

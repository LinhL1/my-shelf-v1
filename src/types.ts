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
}

export type BookPatch = Partial<Omit<Book, 'id'>>;

export interface NewBook {
  book: Book;
  cover: Blob;
  file: Blob;
}

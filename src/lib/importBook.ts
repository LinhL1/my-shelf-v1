import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Book, NewBook } from '../types';
import { clothColor, isBlank, spineColorFrom } from './color';
import { classifyPdfError, openPdf, renderPageToCanvas } from './pdf';

const COVER_WIDTH = 520;
/** How many leading pages to try when the first ones are blank. */
const COVER_CANDIDATES = 3;

/** An import failure whose message is safe to show to the user. */
class ImportError extends Error {
  override name = 'ImportError';
}

/** Validates a PDF, reads its metadata, builds its cover and returns a ready-to-store book. */
export async function prepareBook(file: File, existing: Book[]): Promise<NewBook> {
  await assertLooksLikePdf(file);

  const task = openPdf(file);
  try {
    const doc = await task.promise;
    if (doc.numPages < 1) throw new ImportError('This PDF has no pages.');

    const fingerprint = doc.fingerprints[0] ?? '';
    const duplicate = existing.find(
      (b) =>
        b.fingerprint === fingerprint && b.fileSize === file.size && b.pageCount === doc.numPages,
    );
    if (duplicate) throw new ImportError(`Already on your shelf as “${duplicate.title}”.`);

    const { title, author } = await readMetadata(doc, file.name);
    const cover = await buildCover(doc, title, author);

    const book: Book = {
      id: createId(),
      title,
      author,
      pageCount: doc.numPages,
      coverAspect: cover.canvas.width / cover.canvas.height,
      coverHeightPt: cover.heightPt,
      spineColor: cover.spineColor,
      dateAdded: Date.now(),
      lastOpened: null,
      currentPage: 1,
      progress: 0,
      fileName: file.name,
      fileSize: file.size,
      fingerprint,
    };
    return { book, cover: await toJpeg(cover.canvas), file };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    switch (classifyPdfError(error)) {
      case 'password':
        throw new ImportError('This PDF is password-protected. Remove the password and try again.');
      case 'invalid':
        throw new ImportError('This file is damaged or is not a valid PDF.');
      default:
        console.error(error);
        throw new ImportError('This PDF could not be read.');
    }
  } finally {
    void task.destroy();
  }
}

async function assertLooksLikePdf(file: File) {
  if (file.size === 0) throw new ImportError('This file is empty.');
  let header: string;
  try {
    // Some generators put bytes before the header; viewers accept it within the first 1 KB.
    header = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
  } catch {
    throw new ImportError('This file could not be opened.');
  }
  if (!header.includes('%PDF-')) throw new ImportError('This is not a PDF file.');
}

async function readMetadata(doc: PDFDocumentProxy, fileName: string) {
  let title = '';
  let author = '';
  try {
    const { info, metadata } = await doc.getMetadata();
    const fields = info as { Title?: unknown; Author?: unknown };
    title = cleanTitle(asText(fields.Title) || asText(metadata?.get('dc:title')));
    author = asText(fields.Author) || asText(metadata?.get('dc:creator'));
  } catch {
    // Broken metadata should never block an import.
  }
  return { title: title || titleFromFileName(fileName), author };
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  return typeof value === 'string' ? value.replace(/[\s\0]+/g, ' ').trim() : '';
}

/** Drops the junk that authoring tools leave in the title field. */
function cleanTitle(raw: string) {
  const title = raw
    .replace(/^Microsoft (Word|PowerPoint|Excel) - /i, '')
    .replace(/\.(pdf|docx?|pptx?|xlsx?|indd|tex|dvi|rtf|odt|qxd)$/i, '')
    .trim();
  const meaningless = /^(untitled.*|document\d*|title|none|null|[^\p{L}\p{N}]*)$/iu;
  return meaningless.test(title) ? '' : title;
}

function titleFromFileName(fileName: string) {
  const name = fileName.replace(/\.pdf$/i, '').trim();
  // Slugs such as "the-old_house" become words; names that already have spaces keep their hyphens.
  const separators = name.includes(' ') ? /[_\s]+/g : /[-_]+/g;
  const words = name.replace(separators, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Untitled';
}

interface Cover {
  canvas: HTMLCanvasElement;
  heightPt: number;
  spineColor: string;
}

/** Uses the first page with visible content; falls back to a plain typographic cover. */
async function buildCover(doc: PDFDocumentProxy, title: string, author: string): Promise<Cover> {
  let aspect = 2 / 3;
  let heightPt = 648;
  for (let n = 1; n <= Math.min(COVER_CANDIDATES, doc.numPages); n++) {
    try {
      const page = await renderPageToCanvas(doc, n, COVER_WIDTH);
      if (n === 1) {
        aspect = page.widthPt / page.heightPt;
        heightPt = page.heightPt;
      }
      if (!isBlank(page.canvas)) {
        return {
          canvas: page.canvas,
          heightPt: page.heightPt,
          spineColor: spineColorFrom(page.canvas),
        };
      }
    } catch (error) {
      console.warn(`Could not render page ${n} as a cover`, error);
    }
  }
  return typographicCover(title, author, aspect, heightPt);
}

async function typographicCover(
  title: string,
  author: string,
  aspect: number,
  heightPt: number,
): Promise<Cover> {
  const family = '"Source Serif 4 Variable", Georgia, serif';
  await document.fonts.load(`600 46px ${family}`).catch(() => []);

  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = Math.round(COVER_WIDTH / aspect);
  const spineColor = clothColor(title);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = spineColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = 60;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.textBaseline = 'top';
  ctx.font = `600 46px ${family}`;
  let y = canvas.height * 0.16;
  for (const line of wrap(ctx, title, canvas.width - margin * 2).slice(0, 6)) {
    ctx.fillText(line, margin, y, canvas.width - margin * 2);
    y += 56;
  }
  ctx.font = `400 24px ${family}`;
  ctx.fillText(author, margin, canvas.height - margin - 24, canvas.width - margin * 2);
  return { canvas, heightPt, spineColor };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return line ? [...lines, line] : lines;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Cover encoding failed'))),
      'image/jpeg',
      0.88,
    ),
  );
}

function createId() {
  // randomUUID only exists in secure contexts, so not over plain http on a local network.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// The legacy build ships the polyfills the modern one omits, so older Safari works too.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (dir: string) =>
  new URL(`${import.meta.env.BASE_URL}pdfjs/${dir}/`, document.baseURI).href;

/** Feeds PDF.js byte ranges from a Blob, so large files are never fully held in memory. */
class BlobTransport extends pdfjs.PDFDataRangeTransport {
  onReadError: (error: unknown) => void = () => {};
  private readonly blob: Blob;
  private aborted = false;

  constructor(blob: Blob) {
    super(blob.size, null);
    this.blob = blob;
  }

  override requestDataRange(begin: number, end: number) {
    this.blob
      .slice(begin, end)
      .arrayBuffer()
      .then((buffer) => {
        if (!this.aborted) this.onDataRange(begin, new Uint8Array(buffer));
      })
      .catch((error: unknown) => this.onReadError(error));
  }

  override abort() {
    this.aborted = true;
  }
}

/** Opens a PDF. The caller owns the returned task and must destroy it. */
export function openPdf(blob: Blob): PDFDocumentLoadingTask {
  const range = new BlobTransport(blob);
  const task = pdfjs.getDocument({
    range,
    disableAutoFetch: true,
    disableStream: true,
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  range.onReadError = (error) => {
    console.error('Could not read PDF data', error);
    void task.destroy();
  };
  return task;
}

export function classifyPdfError(error: unknown): 'password' | 'invalid' | 'unknown' {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return 'password';
  if (name === 'InvalidPDFException' || name === 'FormatError') return 'invalid';
  return 'unknown';
}

/** Renders a whole page to a new canvas of the given pixel width. */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  width: number,
) {
  const page = await doc.getPage(pageNumber);
  const { width: widthPt, height: heightPt } = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / widthPt });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return { canvas, widthPt, heightPt };
}

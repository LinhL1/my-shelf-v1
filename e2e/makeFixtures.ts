import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Page colour that encodes the page number, so tests can tell which page is really on screen. */
export function markerColor(page: number): [number, number, number] {
  return [(page * 37) % 256, (page * 91) % 256, (page * 53) % 256];
}

type Doc = InstanceType<typeof PDFDocument>;

interface Spec {
  size: [number, number];
  pages: number;
  title?: string;
  author?: string;
  cover?: (doc: Doc, w: number, h: number) => void;
  pageSize?: (page: number) => [number, number];
  blank?: (page: number) => boolean;
  password?: string;
}

const LOREM =
  'The harbour lay quiet in the hour before the boats came in, and the lamps along the wall burned low. ' +
  'Nobody had thought to put them out. She counted the steps down to the water, as she always did, and stopped one short of the last. ';

function make(name: string, spec: Spec) {
  return new Promise<void>((resolve, reject) => {
    const info: Record<string, string> = {};
    if (spec.title) info.Title = spec.title;
    if (spec.author) info.Author = spec.author;
    const doc = new PDFDocument({
      autoFirstPage: false,
      info,
      ...(spec.password ? { userPassword: spec.password } : {}),
    });
    const out = createWriteStream(FIXTURES + name);
    out.on('finish', resolve).on('error', reject);
    doc.pipe(out);
    for (let n = 1; n <= spec.pages; n++) {
      const [w, h] = spec.pageSize?.(n) ?? spec.size;
      doc.addPage({ size: [w, h], margin: 0 });
      if (spec.blank?.(n)) continue;
      if (n === 1 && spec.cover) {
        spec.cover(doc, w, h);
        continue;
      }
      doc.rect(0, 0, w, h * 0.06).fill(markerColor(n));
      doc.fillColor('#222').font('Times-Roman').fontSize(Math.min(w, h) * 0.028);
      const m = w * 0.12;
      doc.text(LOREM.repeat(6), m, h * 0.14, { width: w - m * 2, height: h * 0.68, lineGap: 4 });
      doc.fontSize(Math.min(w, h) * 0.03).text(String(n), 0, h * 0.93, { width: w, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

function solidCover(title: string, author: string, bg: string, fg: string) {
  return (doc: Doc, w: number, h: number) => {
    doc.rect(0, 0, w, h).fill(bg);
    doc.rect(w * 0.1, h * 0.56, w * 0.8, h * 0.004).fill(fg);
    doc.fillColor(fg).font('Times-Bold').fontSize(w * 0.1).text(title, w * 0.1, h * 0.16, { width: w * 0.8 });
    doc.font('Helvetica').fontSize(w * 0.045).text(author, w * 0.1, h * 0.6, { width: w * 0.8 });
  };
}

export default async function makeFixtures() {
  mkdirSync(FIXTURES, { recursive: true });
  const trade: [number, number] = [396, 612];
  const a4: [number, number] = [595, 842];
  await Promise.all([
    make('novel.pdf', {
      size: trade,
      pages: 320,
      title: 'The Lighthouse Keeper',
      author: 'Ada Marsh',
      cover: solidCover('The Lighthouse Keeper', 'Ada Marsh', '#1f3d4d', '#f0e6d2'),
    }),
    make('thick.pdf', {
      size: [432, 648],
      pages: 820,
      title: 'A Complete History of Small Harbours and the People Who Kept Them',
      author: 'Élodie Vance',
      cover: solidCover('A Complete History of Small Harbours', 'Élodie Vance', '#7c2f2a', '#f7e9d7'),
    }),
    make('the-quiet_harbour.pdf', { size: a4, pages: 90 }),
    make('slides.pdf', {
      size: [960, 540],
      pages: 25,
      title: 'Quarterly Review',
      author: 'Jo Lind',
      cover: solidCover('Quarterly Review', 'Jo Lind', '#e9e2d0', '#333333'),
    }),
    make('mixed.pdf', {
      size: a4,
      pages: 9,
      title: 'Mixed Page Sizes',
      author: 'Bo Chen',
      pageSize: (n) => (n === 4 ? [842, 595] : n === 7 ? [300, 300] : a4),
    }),
    make('blank-cover.pdf', {
      size: trade,
      pages: 140,
      title: 'Second Page Cover',
      author: 'Mira Holt',
      blank: (n) => n === 1,
    }),
    make('all-blank.pdf', { size: trade, pages: 180, title: 'Notebook', author: 'Nobody', blank: () => true }),
    make('one-page.pdf', { size: a4, pages: 1, title: 'Leaflet', author: 'Zed Young' }),
    make('two-pages.pdf', { size: a4, pages: 2, title: 'Microsoft Word - Handout.docx', author: 'Zed Young' }),
    make('locked.pdf', { size: a4, pages: 3, title: 'Secret', password: 'hunter2' }),
  ]);
  writeFileSync(FIXTURES + 'corrupt.pdf', '%PDF-1.7\nthis is not really a document\n');
  writeFileSync(FIXTURES + 'renamed-image.pdf', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  writeFileSync(FIXTURES + 'empty.pdf', '');
}

# My Shelf: how it was built

This explains how the app works inside: the stack, how a PDF becomes a book, how the visuals are drawn,
and what to know when changing it. For how to use it, see the [README](README.md).

**Contents**

1. [The short version](#1-the-short-version)
2. [The stack, and why](#2-the-stack-and-why)
3. [How the code is organised](#3-how-the-code-is-organised)
4. [From PDF to book](#4-from-pdf-to-book)
5. [Storage](#5-storage)
6. [The bookshelf visuals](#6-the-bookshelf-visuals)
7. [The reader visuals](#7-the-reader-visuals)
8. [Keeping text sharp](#8-keeping-text-sharp)
9. [Zoom](#9-zoom)
10. [Highlights and notes](#10-highlights-and-notes)
11. [Development](#11-development)
12. [Limits](#12-limits)
13. [Where to change things](#13-where-to-change-things)

---

## 1. The short version

My Shelf is a web page with no server behind it. Everything happens in your browser.

**The PDF is never converted.** It is stored exactly as you imported it. What looks like a book is made of
three things:

- **Facts read from the PDF once, at import:** title, author, page count, a cover picture and a spine colour.
- **A 3D box drawn with CSS**, whose size and colours come from those facts. That is the book on the shelf.
- **Pictures of pages**, drawn from the original PDF while you read. The page turn is an animation of those
  pictures.

```
 your PDF
    │
    ▼
 IMPORT (once)                             IndexedDB (in the browser)
 check it is a PDF ──► read title/author   ┌──────────────────────────┐
 draw the cover    ──► pick spine colour ─►│ books       facts        │
                                           │ covers      JPEG         │
                                           │ files       original PDF │
                                           │ highlights  marks, notes │
                                           └─────┬──────────────┬─────┘
                                                 │              │
                              facts + cover      ▼              ▼   original PDF
                                              SHELF          READER
                                          CSS 3D books    PDF.js draws pages
                                                          onto canvases
```

It was built in steps, visible in the git history:

| Step            | What it added                                                                           |
| --------------- | --------------------------------------------------------------------------------------- |
| `mvp v1`        | Import, bookshelf, reader with page turning, saved position, tests                      |
| `annotation v1` | Text selection, highlights, notes, zoom, pixel-exact rendering                          |
| After that      | Shelf boards redrawn as wood seen in perspective, and books with visible tops of pages  |

## 2. The stack, and why

| Tool                           | Version | What it does here                                               |
| ------------------------------ | ------- | --------------------------------------------------------------- |
| React                          | 19      | Draws the interface and keeps it in step with the data          |
| TypeScript                     | 7       | Catches mistakes before the code runs; set to strict            |
| Vite                           | 8       | Development server and production build                         |
| PDF.js (`pdfjs-dist`)          | 6       | Reads PDFs, draws pages, extracts text                          |
| IndexedDB, through `idb`       | 8       | Stores the library in the browser                               |
| Tailwind CSS                   | 4       | Utility classes for layout; handwritten CSS for the 3D parts    |
| Inter, Source Serif 4          |         | Interface and title fonts, bundled with the app                 |
| Playwright + pdfkit            | 1.65    | Tests in a real Chrome; pdfkit makes the test PDFs              |

The reasons below marked **(code)** are stated in comments in the source. The others are what the design
implies; nobody wrote them down at the time.

- **No server.** Books and notes stay private, there is nothing to host, and no account is needed. The cost is
  that the library lives in one browser (see [Limits](#12-limits)).
- **PDF.js.** It is the PDF engine inside Firefox, so it handles real-world files, and it exposes what this app
  needs: pages as canvases, text with positions, metadata, and reading a file in pieces. It does the parsing in
  a background thread (a web worker), so the interface stays responsive.
- **The *legacy* build of PDF.js (code).** It includes the polyfills that older Safari needs.
- **IndexedDB, not localStorage.** PDFs are large binary files. localStorage holds only a few megabytes of text.
  `idb` is a thin wrapper that gives IndexedDB promises and types.
- **CSS 3D, not WebGL or Three.js.** A closed book is a box and a page turn is one hinged rectangle. The browser
  can do both, and books stay ordinary buttons that work with the keyboard and screen readers.
- **No state library.** One React context holds the library. Everything else is local to the screen that uses it.
- **No router library (code).** [router.ts](src/lib/router.ts) reads the address hash (`#/read/<id>`), so refresh
  and the back button work with no server setup.
- **No UI kit.** Dialogs use the native `<dialog>` element, which traps focus and handles Escape by itself.
- **End-to-end tests, not unit tests.** Most risk is in what the browser does: drawing, selection, storage,
  gestures. Those only show up in a real browser.

## 3. How the code is organised

```
src/
  main.tsx, App.tsx   start the app; choose shelf or reader from the address
  types.ts            Book, Highlight: the shapes of all stored data
  styles.css          theme colours, all 3D, all reader styling
  lib/                storage, PDF.js setup, import, shared hooks
  library/            the bookshelf screen
  reader/             the reading screen
  ui/                 icons and the dialog
e2e/                  tests, and the script that makes test PDFs
scripts/              copies PDF.js support files before dev and build
```

```
main.tsx
 └─ LibraryProvider          all books in memory; import queue
     └─ App                  route
         ├─ LibraryView      shelf: search, sort, import, dialogs
         │   └─ Shelf ─► Book3D
         └─ ReaderView       loaded only when a book is opened
             ├─ OpenBook     the spread and the turning leaf
             │   └─ Page     canvas, zoom detail, highlights, text
             ├─ MarginNotes
             └─ PageControls
```

**Code loads in pieces.** PDF.js is about 500 kB plus a 1.3 MB worker, so it stays out of the first load. The
reader (`lazy(...)` in [App.tsx](src/App.tsx)) and the importer (`import('./importBook')` in
[LibraryProvider.tsx](src/lib/LibraryProvider.tsx)) bring it in when first needed.

## 4. From PDF to book

### 4.1 Import

Code: [importBook.ts](src/lib/importBook.ts), with the queue in [LibraryProvider.tsx](src/lib/LibraryProvider.tsx).

Files are handled one at a time. Drawing covers is heavy work, and this keeps memory flat for large batches. For
each file:

1. **Check it looks like a PDF.** The first 1 KB must contain `%PDF-`. This rejects empty files and renamed images
   before PDF.js is involved.
2. **Open it with PDF.js.** Password-protected and damaged files are turned into readable messages.
3. **Check for a duplicate.** PDFs carry a fingerprint. Same fingerprint, file size and page count means the book
   is already on the shelf.
4. **Read title and author** from the PDF's metadata, then clean up. "Microsoft Word - Handout.docx" becomes
   "Handout", and meaningless titles such as "Untitled" are dropped. With no usable title, the file name is used:
   `the-quiet_harbour.pdf` becomes "The quiet harbour".
5. **Make the cover.** The first of pages 1–3 that is not blank is drawn 520 pixels wide. A page counts as blank
   when its brightness hardly varies. If all three are blank, a plain cover with title and author is drawn on one
   of six muted cloth colours.
6. **Pick the spine colour:** the average colour of the leftmost 5% of the cover, so the spine looks like the
   cover wrapping around ([color.ts](src/lib/color.ts)).
7. **Save** facts, cover (JPEG, quality 0.88) and the original PDF in one transaction. All three are stored or
   none is.

The browser is also asked not to delete the library when disk space runs low (`navigator.storage.persist()`).

### 4.2 Opening a book

Code: [useBookDocument.ts](src/reader/useBookDocument.ts), [pdf.ts](src/lib/pdf.ts).

The facts, the file and the highlights are loaded together. Then PDF.js opens the file *in pieces*.
`BlobTransport` in pdf.ts answers PDF.js whenever it asks for bytes X to Y, so a large book is never read into
memory whole.

Next the shape of the open book is chosen. Covers and fold-outs often differ from the body, so up to six pages
are sampled (near the start, a third in, the middle, near the end) and the most common proportions win. Pages of
another shape are centred on that paper and never stretched.

### 4.3 Which pages sit together

Code: [spreads.ts](src/reader/spreads.ts). The order follows a printed book:

```
two pages:   [ – | 1 ]  [ 2 | 3 ]  [ 4 | 5 ]  ...
one page:    [ 1 ]  [ 2 ]  [ 3 ]  ...
```

Two pages are shown when the space is at least 768 × 420 pixels and not too tall for its width, unless you chose
single pages.

### 4.4 Drawing the pages

Code: [PageRenderer.ts](src/reader/PageRenderer.ts). This class is the heart of the reader.

- The reader says which pages it wants, most important first: the visible ones, then the next two, then the
  previous two. That is why turning a page is usually instant.
- One page is drawn at a time. If you skim ahead, a drawing that is no longer wanted is cancelled.
- Finished pages are kept as canvases. The cache aims for 12; beyond that, the oldest ones not currently wanted
  are dropped.
- A canvas never exceeds 12 million pixels, to stay below the limits of mobile browsers.
- React components subscribe per page (`subscribe` and `peek` with `useSyncExternalStore`), so only the page that
  changed is redrawn.
- A page that cannot be drawn shows a message. The rest of the book still works.

PDF.js parses in its worker and draws onto the canvas on the main thread.

### 4.5 What a page is made of

Code: [Page.tsx](src/reader/Page.tsx). From bottom to top:

```
 5  shadow at the binding   a gradient: paper curving into the spine
 4  text layer              invisible real text, for selecting
 3  highlights              coloured rectangles
 2  detail canvas           sharp overlay, only while zoomed
 1  canvas                  the picture of the page
 0  white paper             a div with a shadow
```

The picture of a page has no text a browser can select. PDF.js therefore lays transparent text over it, each piece
placed and stretched to match ([TextLayer.tsx](src/reader/TextLayer.tsx)). Scanned pages have no text in the PDF,
so there is nothing to select.

## 5. Storage

Code: [db.ts](src/lib/db.ts). The IndexedDB database is `my-shelf`, version 2.

| Store        | Contains                                                       | Key             |
| ------------ | -------------------------------------------------------------- | --------------- |
| `books`      | Title, author, sizes, spine colour, current page, progress …   | book id         |
| `covers`     | Cover JPEG                                                     | book id         |
| `files`      | The original PDF                                               | book id         |
| `highlights` | Marked text, colour, note; indexed by book                     | highlight id    |

- **Facts and binary data are separate**, so saving your place on every page turn never rewrites a PDF.
- **Removing a book** deletes from all four stores in one transaction.
- **Version upgrades:** version 2 only added `highlights`, so older libraries open unchanged. If another tab runs
  an older version and blocks the upgrade, the app says so.
- **Closing the tab right after a page turn:** the database write may not finish in time. The position is also
  written to localStorage, which is immediate, and picked up the next time the database opens
  ([lastPosition.ts](src/lib/lastPosition.ts)).
- **Preferences** (sorting, view, layout, notes shown, last highlight colour) are in localStorage.

Progress is the last visible page divided by the page count. Merely opening a book on page 1 counts as 0%.

## 6. The bookshelf visuals

### 6.1 Size of a book

Code: `bookSize` in [bookGeometry.ts](src/library/bookGeometry.ts). Proportions are real, sizes are softened so
the shelf stays even:

- **Height:** 206 pixels plus a little for larger formats, up to 251 for A4.
- **Width:** from the cover's proportions, at most 230. Wide covers shrink to fit.
- **Thickness:** `11 + pages × 0.075`, between 12 and 64.

| Example                    | Width × height | Thickness |
| -------------------------- | -------------- | --------- |
| Paperback, 320 pages       | 139 × 214      | 35        |
| A4, 90 pages               | 177 × 251      | 18        |
| Slides 16:9, 25 pages      | 230 × 129      | 13        |
| Thick book, 820 pages      | 147 × 220      | 64        |

`packShelves` fills boards from left to right and starts a new one when the next book does not fit. It uses each
book's *footprint*, the width it takes up once turned: `width × cos 34° + thickness × sin 34°`. On phones
everything shrinks so that two books fit side by side.

### 6.2 The book

Code: [Book3D.tsx](src/library/Book3D.tsx) and `.book…` in [styles.css](src/styles.css).

A book is three flat rectangles folded into a box with CSS 3D, then turned by 34°:

```
        ┌────────────────┐  top     pages, rotateX(90deg)
       ╱                ╱│
      ┌────────────────┐ │
      │                │ │
      │     cover      │     cover   pushed forward by half the thickness
      │                │     spine   left side, rotateY(-90deg)
      └────────────────┘
```

Only the sides you can see exist. Realism comes from gradients, not images:

- **Cover:** a dark and light line near the spine (the hinge groove) and a faint falloff to the right.
- **Spine:** darker at both edges, so it looks rounded. The title is vertical, in white or dark text depending on
  the spine's brightness, and left out below 17 pixels.
- **Shadow:** a flat rectangle lying on the board with two box-shadows, one tight and one soft.
- **Hover:** the book lifts 4 pixels and turns 7° towards you.

### 6.3 The board

Code: `shelfPerspective` in bookGeometry.ts, and `.shelf-board…` in styles.css.

Books and boards must look as if seen from one viewpoint: eye level 340 above the board, 1400 away. Books get this
directly as CSS `perspective`. The board is flat, so its edges are calculated with the usual perspective formula:

```
offset(z) = 340 × (1400 / (1400 − z) − 1)

front edge, z = +96  →  25 px below the line the books stand on
back edge,  z = −96  →  22 px above it
```

The top is a rectangle cut into a trapezoid with `clip-path`. The wood is a plain colour, a lighting gradient and
[wood-grain.svg](src/library/wood-grain.svg), a tiny file that *generates* grain with noise stretched along the
board.

One deliberate cheat: every book has its own vanishing point, so full perspective on the board would leave the
outer books hanging over its ends. The ends taper only gently.

### 6.4 Colours and type

Defined once, in `@theme` at the top of styles.css:

| Name   | Colour    | Used for                    |
| ------ | --------- | --------------------------- |
| paper  | `#f7f6f2` | Shelf background            |
| desk   | `#eeece6` | Reader background           |
| ink    | `#252525` | Text, primary button        |
| muted  | `#777777` | Secondary text              |
| line   | `#e7e5e0` | Borders                     |
| wood   | `#a98258` | Progress bar, focus outline |
| danger | `#a23b32` | Errors, remove              |

Inter is used for the interface, Source Serif 4 for titles, Times New Roman for sticky notes.

## 7. The reader visuals

Code: [OpenBook.tsx](src/reader/OpenBook.tsx).

**The page turn.** During a turn, two still pages lie underneath and one *leaf* moves on top, hinged at the middle.
The leaf has the old page on its front and the new one on its back:

```
 turning from [2|3] to [4|5]

 still:   [ 2 |   5 ]      5 is already in place, hidden by the leaf
 leaf:    front = 3, back = 4, rotates 0° → −180° around the middle
 after:   [ 4 | 5 ]        the leaf is removed
```

- Two pages take 620 ms. A single page takes 340 ms and swings away to −92°, where it is edge-on and disappears.
- Shading on the leaf peaks halfway through the turn.
- The animation uses the Web Animations API, not React state, so React does not re-render on every frame.
- The turn is worked out *while rendering*, not afterwards, so no frame ever shows the wrong pages.
- Turning again mid-turn starts the next turn from where the first was heading. A held-down key skips the
  animation, and so does the system's "reduce motion" setting.

**Other details**

- **Page edges:** thin striped strips outside the book show the remaining stack, at most 7 pixels wide, split
  between left and right by how far you have read.
- **Cover and last page:** a lone page is moved to the middle, like a closed book.
- **Binding:** a gradient darkens each page towards the middle.
- **Loading:** a spinner only appears after 350 ms, because most pages are ready sooner.
- **Fullscreen:** the bars fade after 2.5 seconds without movement.

**Clicks have three possible meanings.** A click on a highlight opens it. A click elsewhere turns the page, by
which half of the screen it is in. A click on text waits 240 ms first, in case it is a double click to select a
word. This logic is `onBookClick` in [ReaderView.tsx](src/reader/ReaderView.tsx).

## 8. Keeping text sharp

Text in a canvas turns soft if the canvas is even a fraction of a pixel off. Three steps prevent it:

1. **Whole sizes.** `snapBox` in ReaderView rounds page sizes to whole device pixels (and an even width, so half of
   it is whole too).
2. **Whole positions inside the paper.** `placeImage` in [pageGeometry.ts](src/reader/pageGeometry.ts).
3. **Whole positions on screen.** Centring often lands between two pixels, so
   [usePixelAlignment.ts](src/reader/usePixelAlignment.ts) shifts the book by less than a pixel.

Together these put one canvas pixel on exactly one screen pixel. A test compares a screenshot with the canvas and
requires a difference of zero, on normal and high-density screens.

3D is also only switched on while a page turns, because 3D layers can soften text.

## 9. Zoom

Code: [useZoom.ts](src/reader/useZoom.ts), [PageDetail.tsx](src/reader/PageDetail.tsx).

- **The book is laid out larger, not scaled with a transform.** It sits in a normal scrolling area, which keeps it
  sharp and gives smooth scrolling for free.
- **The spot under the pointer stays put.** It is remembered as a fraction of the book, and the area is scrolled
  after resizing so that spot is back in place.
- **Only the visible part is redrawn.** At 6× a full page would be an enormous canvas. The existing picture
  stretches at once; 120 ms after you pause, the visible region plus a 30% margin is drawn sharply over it.
- **Every input is covered:** Ctrl + wheel (also how browsers report a trackpad pinch), touch pinch, Safari's own
  gesture events, keys and buttons. The range is 1× to 6×.

## 10. Highlights and notes

**Positions are fractions of the page** (0 to 1), one rectangle per line of text. A highlight is therefore right at
any zoom, window size or layout without conversion. One that runs across two facing pages has a segment for each.

1. **Selecting.** The text layer is hundreds of scattered pieces, and browsers select badly between them. With a
   mouse, [mouseSelection.ts](src/reader/mouseSelection.ts) takes over and always follows the character nearest to
   the pointer. Touch selection is the browser's own.
2. **Reading the selection.** [textSelection.ts](src/reader/textSelection.ts) collects the rectangles, joins them
   into one per line (a wide gap means a new column) and turns them into fractions.
3. **Saving.** [useHighlights.ts](src/reader/useHighlights.ts) shows changes at once and writes every one straight
   to storage, so there is no Save button. Marking the same text again only recolours it.
4. **Drawing.** [HighlightLayer.tsx](src/reader/HighlightLayer.tsx) multiplies the colour with the page, like a real
   marker. That would not show on a dark page, so the brightness behind each highlight is sampled and dark areas
   get a translucent colour instead.
5. **Notes.** [marginLayout.ts](src/reader/marginLayout.ts) places sticky notes level with their text without
   overlap. Too many for the space, and they overlap evenly like a stack of cards. If there is little room, the
   book shrinks, to no less than 55% of its size. Where even that is not enough (phones), a sheet opens instead.

## 11. Development

```sh
npm install
npm run dev          # http://localhost:5280, updates as you edit
npm run build        # type check, then optimised build into dist/
npm run preview      # serves dist/ on 5280
npm run typecheck
npm run test:e2e     # needs Google Chrome; runs on port 5281
```

**Things worth knowing**

- **Port 5280 is fixed.** The browser ties the library to the exact address, so another port means an empty shelf.
  If the port is taken, the server refuses to start instead of moving (`strictPort`).
- **`public/pdfjs` is generated.** [copy-pdfjs-assets.mjs](scripts/copy-pdfjs-assets.mjs) copies character maps,
  fallback fonts, image decoders and colour profiles out of `node_modules` before `dev` and `build`. Nothing is
  fetched from the internet. Do not edit that folder.
- **Changing stored data:** raise the version in `openDB(...)` and add an `if (oldVersion < 3)` block. Never edit
  the earlier blocks, because existing libraries have already run them.
- **TypeScript is strict**, including `noUncheckedIndexedAccess`: reading from an array may give `undefined`. The
  `!` in the code marks places where that cannot happen.
- **Handlers kept in refs** (`handler.current = onFiles`) let a listener be added once and still call the latest
  function.

**Tests.** There are 40, in four files: library, reader, zoom, annotations. They use the production build in real
Chrome. [makeFixtures.ts](e2e/makeFixtures.ts) creates the test PDFs, among them an 820-page book, mixed page
sizes, blank pages, a password-protected file and a corrupt one.

Each test page has a coloured strip that encodes its page number, so a test can read pixels from the canvas and
know which page is *really* on screen.

If a server is already running on 5281, the tests reuse it instead of building. Stop it first, or you may test old
code.

## 12. Limits

- **One browser, one address.** No sync, no backup, no export of notes. Clearing site data deletes everything, so
  keep the original PDFs.
- **It must be served.** Everything runs locally, but there is no service worker, so the page cannot be opened
  unless `dev` or `preview` is running (or `dist/` is hosted).
- **Fixed pages.** Text does not reflow and its size cannot be changed. Zoom instead.
- **No OCR.** Scanned pages cannot be selected or highlighted.
- **No passwords.** Protected PDFs must be unlocked before import.
- **Highlights stay in the app.** They are not written into the PDF; the downloaded file is the original.

## 13. Where to change things

| To change                              | Look at                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| Colours, fonts                         | `@theme` in [styles.css](src/styles.css)                             |
| Book size, thickness, angle, spacing   | [bookGeometry.ts](src/library/bookGeometry.ts)                       |
| Shading of books, look of the wood     | "Bookshelf" in styles.css, [wood-grain.svg](src/library/wood-grain.svg) |
| Title clean-up, cover choice           | [importBook.ts](src/lib/importBook.ts)                               |
| Spine colour, cloth colours            | [color.ts](src/lib/color.ts)                                         |
| Sorting, search, views                 | [selectBooks.ts](src/library/selectBooks.ts)                         |
| Page-turn speed and shape              | top of [OpenBook.tsx](src/reader/OpenBook.tsx), and `Leaf` in it     |
| How many pages are prepared or kept    | `renderer.request` in ReaderView; `CACHE_SIZE` in [PageRenderer.ts](src/reader/PageRenderer.ts) |
| Zoom range and step                    | top of [useZoom.ts](src/reader/useZoom.ts)                           |
| Highlight colours                      | `HIGHLIGHT_COLORS` in [types.ts](src/types.ts), and `[data-color=…]` in styles.css |
| Note size and placement                | [marginLayout.ts](src/reader/marginLayout.ts)                        |
| Keyboard shortcuts                     | [useReaderKeys.ts](src/reader/useReaderKeys.ts)                      |
| Stored data                            | [types.ts](src/types.ts), [db.ts](src/lib/db.ts)                     |

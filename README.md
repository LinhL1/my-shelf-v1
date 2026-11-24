# My Shelf

A personal digital library. Import PDF books, keep them on a bookshelf, and read them as an open book.
Everything runs in the browser: PDFs, covers, reading positions, highlights and notes are stored locally
and never leave the device.

## Run

```sh
npm install
npm run dev        # http://localhost:5280
```

For the optimised build: `npm run build`, then `npm run preview` (same address).

The library belongs to one browser and one address. Port 5280 is fixed on purpose, because opening
the app on another port, host name or browser shows a different, empty library. Clearing site data
deletes the library, notes included, so keep your original PDFs.

## Reading

| Action           | How                                                          |
| ---------------- | ------------------------------------------------------------ |
| Turn the page    | Arrow keys, Page Up/Down, click a page, swipe, or the arrows |
| Jump to a page   | Click the page number and type, or drag the slider           |
| First, last page | Home, End                                                    |
| Zoom             | Pinch, Ctrl + wheel, + and -, or the buttons; 0 resets       |
| Move when zoomed | Drag beside the text, scroll, or the up and down arrows      |
| Highlight        | Select text, then pick a colour or Add note                  |
| Edit a highlight | Click it, or its note                                        |
| Fullscreen       | F, or the button                                             |

Two pages are shown side by side on wide screens, one on phones. The button next to fullscreen
switches to a single page, which suits landscape documents such as slides.

A book reopens on the page where you stopped.

Notes are sticky notes in the blank space beside the book, level with their highlight and in its colour.
Where there is little blank space the book gets smaller to make room; the note button in the header hides
the notes. On phones, a dot marks highlights that have a note, and selecting one opens it. Scanned pages
without a text layer cannot be highlighted.

## Structure

```
src/
  lib/       storage (IndexedDB), PDF.js setup, import pipeline, library state
  library/   bookshelf, 3D book objects, search and sort, dialogs
  reader/    open book, page turning, page rendering queue, highlights and notes, controls
  ui/        shared icons and dialog
e2e/         Playwright tests; PDF fixtures are generated on first run
```

## Test

```sh
npm run typecheck
npm run test:e2e   # uses the installed Google Chrome, on port 5281
```

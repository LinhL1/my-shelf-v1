import { expect, test, type Page } from '@playwright/test';
import { book, importBooks, visiblePages } from './helpers';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

async function goTo(page: Page, number: number) {
  const field = page.getByLabel('Go to page');
  await field.fill(String(number));
  await field.press('Enter');
  await visiblePages(page);
}

async function open(page: Page, file: string, title: string, number: number) {
  await page.goto('/');
  await importBooks(page, file);
  await book(page, title).click();
  await visiblePages(page);
  if (number > 1) await goTo(page, number);
  await expect(line(page, number, 0)).toBeAttached();
}

const line = (page: Page, number: number, index: number) =>
  page.locator(`.page[data-page="${number}"] .text-layer span`).nth(index);

/** Selects with the mouse, from a share of one line to a share of another. */
async function drag(page: Page, number: number, from: [line: number, at: number], to: [line: number, at: number]) {
  const point = async ([index, at]: [number, number]) => {
    const box = (await line(page, number, index).boundingBox())!;
    return [box.x + box.width * at, box.y + box.height / 2] as const;
  };
  const [start, end] = [await point(from), await point(to)];
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(...end, { steps: 8 });
  await page.mouse.up();
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Highlight selected text' });
const marks = (page: Page, number: number) => page.locator(`.page[data-page="${number}"] .highlight`);
const center = async (page: Page, number: number, index = 0) => {
  const box = (await marks(page, number).nth(index).locator('span').first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

async function addNote(page: Page, number: number, from: [number, number], to: [number, number], text: string) {
  await drag(page, number, from, to);
  await toolbar(page).getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByLabel('Note', { exact: true })).toBeFocused();
  await page.keyboard.type(text);
  await page.getByRole('button', { name: 'Done' }).click();
}

test('highlights in four colours, and keeps them', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  const colors = ['yellow', 'green', 'blue', 'pink'];
  for (const [i, color] of colors.entries()) {
    await drag(page, 20, [i * 3, 0.1], [i * 3 + 1, 0.6]);
    await expect(toolbar(page).getByRole('button', { name: /^Highlight in/ })).toHaveCount(4);
    await toolbar(page).getByRole('button', { name: `Highlight in ${color}` }).click();
    await expect(toolbar(page)).toBeHidden();
  }
  await expect(marks(page, 20)).toHaveCount(4);

  // One rectangle per line, exactly over the selected words.
  const spans = marks(page, 20).first().locator('span');
  await expect(spans).toHaveCount(2);
  const [mark, text] = [(await spans.first().boundingBox())!, (await line(page, 20, 0).boundingBox())!];
  expect(Math.abs(mark.y - text.y)).toBeLessThan(2);
  expect(Math.abs(mark.x - (text.x + text.width * 0.1))).toBeLessThan(8);
  expect(Math.abs(mark.x + mark.width - (text.x + text.width))).toBeLessThan(8);

  const painted = () =>
    marks(page, 20).evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n.firstElementChild!).backgroundColor));
  await page.mouse.move(720, 880);
  await page.waitForTimeout(300);
  const before = await painted();
  expect(new Set(before).size).toBe(4);
  // Pastel: light, and not grey.
  for (const value of before) {
    const rgb = value.match(/\d+/g)!.map(Number);
    expect(Math.max(...rgb)).toBeGreaterThan(230);
    expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(25);
  }

  await page.keyboard.press('ArrowRight');
  await visiblePages(page);
  await expect(page.locator('.highlight')).toHaveCount(0);
  await page.reload();
  await visiblePages(page);
  await page.keyboard.press('ArrowLeft');
  await visiblePages(page);
  expect(await painted()).toEqual(before);
});

test('a note sits in the blank space, in the colour of its highlight', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  await addNote(page, 20, [2, 0], [3, 0.5], 'The steps again');
  await addNote(page, 21, [8, 0.2], [8, 0.8], 'Compare chapter one');

  const left = page.getByRole('button', { name: /^Note: The steps again/ });
  const right = page.getByRole('button', { name: /^Note: Compare/ });
  const pages = {
    left: (await page.locator('.page[data-page="20"]').boundingBox())!,
    right: (await page.locator('.page[data-page="21"]').boundingBox())!,
  };
  const [a, b] = [(await left.boundingBox())!, (await right.boundingBox())!];
  expect(a.x).toBeGreaterThanOrEqual(0);
  expect(a.x + a.width).toBeLessThan(pages.left.x);
  expect(b.x).toBeGreaterThan(pages.right.x + pages.right.width);
  expect(b.x + b.width).toBeLessThanOrEqual(1440);

  // Level with the highlight, in exactly its colour, and with nothing drawn in between.
  const mark = (await marks(page, 20).locator('span').first().boundingBox())!;
  expect(Math.abs(a.y - mark.y)).toBeLessThan(14);
  for (const color of ['green', 'blue', 'pink', 'yellow']) {
    await left.click();
    await page.getByRole('button', { name: `Change highlight to ${color}` }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    const background = (locator: ReturnType<typeof marks>) =>
      locator.evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.mouse.move(720, 880);
    await page.waitForTimeout(350);
    const paper = await background(left);
    await expect.poll(() => background(marks(page, 20).locator('span').first())).toBe(paper);
  }
  await expect(page.locator('.margin-notes svg')).toHaveCount(0);

  // Pointing at either the note or its highlight slightly deepens both, and nothing else.
  const look = (locator: ReturnType<typeof marks>) =>
    locator.evaluate((node) => {
      const { backgroundColor, boxShadow, transform, filter, opacity } = getComputedStyle(node);
      return [backgroundColor, boxShadow, transform, filter, opacity].join(' ');
    });
  const [noteBefore, markBefore] = [await look(left), await look(marks(page, 20).locator('span').first())];
  const otherBefore = await look(marks(page, 21).locator('span').first());
  const otherNoteBefore = await look(right);
  await left.hover();
  await page.waitForTimeout(400);
  expect(await look(left)).not.toBe(noteBefore);
  expect(await look(right)).toBe(otherNoteBefore);
  expect(await look(marks(page, 20).locator('span').first())).not.toBe(markBefore);
  expect(await look(marks(page, 21).locator('span').first())).toBe(otherBefore);
  await expect(marks(page, 20)).toHaveAttribute('data-emphasized', 'true');
  await expect(marks(page, 21)).toHaveAttribute('data-emphasized', 'false');
  const target = await center(page, 21);
  await page.mouse.move(target.x, target.y);
  await expect(marks(page, 21)).toHaveAttribute('data-emphasized', 'true');
  await expect.poll(() => look(right)).not.toBe(otherNoteBefore);
  await expect.poll(() => look(left)).toBe(noteBefore);

  // Both the note and the field it is written in.
  const font = (locator: ReturnType<typeof marks>) =>
    locator.evaluate((node) => getComputedStyle(node).fontFamily);
  expect(await font(left)).toMatch(/^"Times New Roman"/);

  // Clicking the highlight opens its note; clicking away only closes it.
  await page.mouse.click(target.x, target.y);
  const input = page.getByLabel('Note', { exact: true });
  await expect(input).toHaveValue('Compare chapter one');
  expect(await font(input)).toMatch(/^"Times New Roman"/);
  await input.press('End');
  await page.keyboard.type(' 0 + f');
  await page.mouse.click(1000, 120);
  await expect(input).toBeHidden();
  await page.waitForTimeout(400);
  expect(await visiblePages(page)).toEqual([20, 21]);
  await expect(page.getByRole('button', { name: /^Note: Compare chapter one 0 \+ f/ })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await visiblePages(page);
  await expect(page.locator('.margin-note')).toHaveCount(0);
  await page.reload();
  await visiblePages(page);
  await page.keyboard.press('ArrowLeft');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
});

test('recolours, removes and restores', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  await addNote(page, 20, [2, 0], [2, 0.5], 'Keep me');
  const { x, y } = await center(page, 20);
  await page.mouse.click(x, y);
  await page.getByRole('button', { name: 'Change highlight to pink' }).click();
  await expect(marks(page, 20)).toHaveAttribute('data-color', 'pink');
  await page.getByRole('button', { name: 'Remove highlight' }).click();
  await expect(marks(page, 20)).toHaveCount(0);
  await expect(page.locator('.margin-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(marks(page, 20)).toHaveAttribute('data-color', 'pink');
  await expect(page.getByRole('button', { name: /^Note: Keep me/ })).toBeVisible();
  await page.reload();
  await visiblePages(page);
  await expect(page.getByRole('button', { name: /^Note: Keep me/ })).toBeVisible();

  // The same words again: a new colour rather than a second highlight.
  await drag(page, 20, [2, 0], [2, 0.5]);
  await toolbar(page).getByRole('button', { name: 'Highlight in blue' }).click();
  await expect(marks(page, 20)).toHaveCount(1);
  await expect(marks(page, 20)).toHaveAttribute('data-color', 'blue');
});

test('many notes neither overlap nor leave the screen', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  for (let i = 0; i < 6; i++) {
    await addNote(page, 20, [i, 0], [i, 0.4], `Note ${i}: ${'a longer thought about this line '.repeat(3)}`);
  }
  const boxes = await page.locator('.margin-note').evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })),
  );
  expect(boxes).toHaveLength(6);
  boxes.forEach((box, i) => {
    if (i > 0) expect(box.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(900);
  });
});

test('clicking still turns the page; selecting does not', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  const text = (await line(page, 21, 5).boundingBox())!;
  const spot = [text.x + text.width / 2, text.y + text.height / 2] as const;

  await page.mouse.dblclick(...spot);
  await expect(toolbar(page)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await visiblePages(page)).toEqual([20, 21]);
  // The first click only lets go of the selection.
  await page.mouse.click(...spot);
  await expect(toolbar(page)).toBeHidden();
  await page.waitForTimeout(400);
  expect(await visiblePages(page)).toEqual([20, 21]);

  await page.mouse.click(...spot);
  await expect(page.getByLabel('Go to page')).toHaveValue('22–23');
  await visiblePages(page);
  // The paper beside the text, and the desk beside the book.
  const sheet = (await page.locator('.page[data-page="22"]').boundingBox())!;
  await page.mouse.click(sheet.x + 10, sheet.y + sheet.height / 2);
  await expect(page.getByLabel('Go to page')).toHaveValue('20–21');
  await visiblePages(page);
  await page.mouse.click(1400, 300);
  await expect(page.getByLabel('Go to page')).toHaveValue('22–23');
});

test('a selection ends where the pointer is, also between and beside lines', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  const [first, last] = [(await line(page, 20, 2).boundingBox())!, (await line(page, 20, 4).boundingBox())!];
  const sheet = (await page.locator('.page[data-page="20"]').boundingBox())!;
  await page.mouse.move(first.x + 30, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(sheet.x + sheet.width - 8, last.y + last.height + 1, { steps: 12 });
  await page.mouse.up();
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Highlight in green' }).click();
  expect(await marks(page, 20).locator('span').count()).toBeLessThanOrEqual(4);
  await expect(marks(page, 21)).toHaveCount(0);
});

test('a highlight can run across facing pages', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  await expect(line(page, 21, 3)).toBeAttached();
  const count = await page.locator('.page[data-page="20"] .text-layer span').count();
  const from = (await line(page, 20, count - 3).boundingBox())!;
  const to = (await line(page, 21, 1).boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await toolbar(page).getByRole('button', { name: 'Highlight in blue' }).click();
  await expect(marks(page, 20)).toHaveCount(1);
  await expect(marks(page, 21)).toHaveCount(1);
  await page.getByRole('button', { name: 'Show one page' }).click();
  expect(await visiblePages(page)).toEqual([20]);
  await expect(marks(page, 20)).toHaveCount(1);
});

test('highlights stay on their words when zoomed, with their notes still at the sides', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  await addNote(page, 20, [2, 0], [2, 0.6], 'Seen up close');
  const offset = async () => {
    const [mark, text] = [(await center(page, 20)).box, (await line(page, 20, 2).boundingBox())!];
    return [(mark.x - text.x) / text.width, (mark.y - text.y) / text.height, mark.width / text.width];
  };
  const before = await offset();
  for (let i = 0; i < 3; i++) await page.keyboard.press('+');
  const after = await offset();
  after.forEach((value, i) => expect(Math.abs(value - before[i]!)).toBeLessThan(0.05));

  const note = page.getByRole('button', { name: /^Note: Seen up close/ });
  const apart = async () => {
    const [card, view] = [(await note.boundingBox())!, (await page.locator('.reader-scroller').boundingBox())!];
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(view.x);
    return card;
  };
  await apart();
  // The note moves along with its highlight.
  const scroll = (top: number) => page.locator('.reader-scroller').evaluate((n, t) => n.scrollTo(0, t), top);
  await scroll(0);
  await page.waitForTimeout(200);
  const atTop = await apart();
  await scroll(60);
  await expect.poll(async () => Math.abs(atTop.y - (await apart()).y - 60)).toBeLessThan(3);
  await scroll(0);
  // Scrolling over the side scrolls the book.
  await page.mouse.move(atTop.x + 20, atTop.y + 20);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.locator('.reader-scroller').evaluate((n) => n.scrollTop)).toBeGreaterThan(100);
  await scroll(0);
  await note.click();
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Seen up close');
  await expect(page.locator('.note-sheet')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Text can be selected while zoomed too.
  await drag(page, 20, [6, 0.1], [6, 0.5]);
  await toolbar(page).getByRole('button', { name: 'Highlight in pink' }).click();
  await expect(marks(page, 20)).toHaveCount(2);
});

test('a wide book makes room for its notes, unless they are hidden', async ({ page }) => {
  await open(page, 'slides.pdf', 'Quarterly', 2);
  const width = async () => (await page.locator('.page[data-page="2"]').boundingBox())!.width;
  const full = await width();
  await drag(page, 2, [0, 0], [0, 0.5]);
  await toolbar(page).getByRole('button', { name: 'Add note' }).click();
  await expect(page.locator('.note-sheet')).toHaveCount(0);
  await expect(page.locator('.margin-note .note-editor')).toBeVisible();
  await page.keyboard.type('Ask about this');
  await page.getByRole('button', { name: 'Done' }).click();
  const note = page.getByRole('button', { name: /^Note: Ask about this/ });
  await expect(note).toBeVisible();
  expect(await width()).toBeLessThan(full);
  expect(await page.locator('.margin-notes').evaluate((n) => getComputedStyle(n).animationDelay)).toBe('0s');
  expect((await note.boundingBox())!.x).toBeGreaterThanOrEqual(0);

  await page.getByRole('button', { name: 'Hide notes' }).click();
  await expect(note).toBeHidden();
  expect(await width()).toBe(full);
  await page.reload();
  await visiblePages(page);
  await expect(note).toBeHidden();
  await page.getByRole('button', { name: 'Show notes' }).click();
  await expect(note).toBeVisible();
});

for (const [width, height] of [[1366, 650], [1000, 1000], [820, 1180], [700, 900]] as const) {
  test(`notes are at the sides in a ${width} by ${height} window`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, 'the-quiet_harbour.pdf', 'The quiet', 4);
    await addNote(page, 4, [2, 0], [2, 0.5], 'In plain sight');
    const note = (await page.getByRole('button', { name: /^Note: In plain sight/ }).boundingBox())!;
    const sheet = (await page.locator('.page[data-page="4"]').boundingBox())!;
    expect(note.x).toBeGreaterThanOrEqual(0);
    expect(note.x + note.width).toBeLessThanOrEqual(width);
    expect(note.x + note.width <= sheet.x || note.x >= sheet.x + sheet.width).toBe(true);
  });
}

test('shows on dark pages, and works from the keyboard', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 1);
  await drag(page, 1, [0, 0], [0, 0.9]);
  await toolbar(page).getByRole('button', { name: 'Highlight in yellow' }).click();
  await expect(marks(page, 1)).toHaveAttribute('data-dark', 'true');
  await marks(page, 1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Note', { exact: true })).toBeFocused();
  await page.keyboard.type('Title');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('button', { name: /^Note: Title/ })).toBeVisible();
});

test('removing a book removes its highlights', async ({ page }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 20);
  await addNote(page, 20, [2, 0], [2, 0.5], 'Gone soon');
  const stored = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const request = indexedDB.open('my-shelf');
          request.onsuccess = () => {
            const count = request.result.transaction('highlights').objectStore('highlights').count();
            count.onsuccess = () => {
              request.result.close();
              resolve(count.result);
            };
          };
        }),
    );
  await expect.poll(stored).toBe(1);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'Options for The Lighthouse' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Your shelf is empty')).toBeVisible();
  expect(await stored()).toBe(0);
});

test('a library from before highlights opens unchanged', async ({ page }) => {
  await page.goto('/');
  await importBooks(page, 'novel.pdf');
  // Rebuild the database the way version 1 left it.
  await page.goto('/icon.svg');
  await page.evaluate(async () => {
    const done = <T,>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const current = await done(indexedDB.open('my-shelf'));
    const copy: [string, IDBValidKey, unknown][] = [];
    for (const name of ['books', 'covers', 'files']) {
      const store = current.transaction(name).objectStore(name);
      const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
      keys.forEach((key, i) => copy.push([name, key, values[i]]));
    }
    current.close();
    await done(indexedDB.deleteDatabase('my-shelf'));
    const open = indexedDB.open('my-shelf', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('books', { keyPath: 'id' });
      open.result.createObjectStore('covers');
      open.result.createObjectStore('files');
    };
    const old = await done(open);
    const tx = old.transaction(['books', 'covers', 'files'], 'readwrite');
    for (const [name, key, value] of copy) {
      tx.objectStore(name).put(value, ...(name === 'books' ? [] : [key]));
    }
    await new Promise((resolve) => (tx.oncomplete = resolve));
    old.close();
  });
  await page.goto('/');
  await book(page, 'The Lighthouse').click();
  await visiblePages(page);
  await goTo(page, 20);
  await addNote(page, 20, [2, 0], [2, 0.5], 'New here');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Note: New here/ })).toBeVisible();
});

test('reopens where reading stopped, even when closed right after a turn', async ({ page, context }) => {
  await open(page, 'novel.pdf', 'The Lighthouse', 40);
  await page.keyboard.press('ArrowRight');
  await page.close();

  const again = await context.newPage();
  await again.goto('/');
  await expect(again.getByText(/Page 42 · 13%/)).toBeVisible();
  await book(again, 'The Lighthouse').click();
  await expect(again.getByText('Continuing from page 42')).toBeVisible();
  expect(await visiblePages(again)).toEqual([42, 43]);
  await expect(again.getByText('Continuing from page 42')).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('selected text can be highlighted and annotated', async ({ page }) => {
    await open(page, 'novel.pdf', 'The Lighthouse', 5);
    const select = (index: number) =>
      page.evaluate((i) => {
        const span = document.querySelectorAll('.page[data-page="5"] .text-layer span')[i]!;
        const range = document.createRange();
        range.selectNodeContents(span);
        const selection = document.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      }, index);
    await select(2);
    await expect(toolbar(page)).toBeVisible();
    const bounds = (await toolbar(page).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await toolbar(page).getByRole('button', { name: 'Add note' }).tap();
    await page.getByLabel('Note', { exact: true }).fill('On the train');
    await page.getByRole('button', { name: 'Done' }).tap();
    await expect(page.locator('.margin-note')).toHaveCount(0);
    await expect(marks(page, 5)).toHaveClass(/has-note/);

    // Tapping a highlight opens it; tapping away closes it without turning the page.
    const { x, y } = await center(page, 5);
    await page.touchscreen.tap(x, y);
    await expect(page.locator('.note-sheet')).toContainText('She counted the steps');
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('On the train');
    await page.touchscreen.tap(300, y + 200);
    await expect(page.locator('.note-sheet')).toBeHidden();
    expect(await visiblePages(page)).toEqual([5]);
    await page.touchscreen.tap(300, y + 200);
    expect(await visiblePages(page)).toEqual([6]);
  });
});

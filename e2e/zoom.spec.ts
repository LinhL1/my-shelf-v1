import { expect, test, type Page } from '@playwright/test';
import { book, importBooks, visiblePages } from './helpers';
import { markerColor } from './makeFixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
});

async function openAt(page: Page, number: number) {
  await importBooks(page, 'novel.pdf');
  await book(page, 'The Lighthouse').click();
  await visiblePages(page);
  if (number === 1) return;
  const field = page.getByLabel('Go to page');
  await field.fill(String(number));
  await field.press('Enter');
  await visiblePages(page);
}

const width = async (page: Page, number: number) =>
  (await page.locator(`.page[data-page="${number}"]`).boundingBox())!.width;

/** Waits until every visible part of a page is covered by a canvas at full display resolution. */
async function expectSharp(page: Page, number: number) {
  await expect
    .poll(() =>
      page.locator(`.page[data-page="${number}"]`).evaluate((node) => {
        const canvas = node.querySelector<HTMLCanvasElement>('.page-detail canvas');
        const image = node.querySelector('.page-image')!.getBoundingClientRect();
        const view = document.querySelector('.reader-scroller')!.getBoundingClientRect();
        if (!canvas) return 'no detail';
        const c = canvas.getBoundingClientRect();
        const density = canvas.width / c.width;
        if (Math.abs(density - devicePixelRatio) > 0.01) return `density ${density}`;
        const covered =
          c.left <= Math.max(image.left, view.left) + 1 &&
          c.top <= Math.max(image.top, view.top) + 1 &&
          c.right >= Math.min(image.right, view.right) - 1 &&
          c.bottom >= Math.min(image.bottom, view.bottom) - 1;
        return covered ? 'sharp' : 'not covered';
      }),
    )
    .toBe('sharp');
}

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`at ${deviceScaleFactor}x`, () => {
    test.use({ deviceScaleFactor });

    test('on-screen pixels are exactly the rendered pixels, at rest and zoomed', async ({ page }) => {
      await openAt(page, 2);
      const difference = async () => {
        await page.addStyleTag({ content: '.page::after { display: none !important }' });
        const shot = (await page.screenshot({ scale: 'device' })).toString('base64');
        return page.evaluate(async (data) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
          const screen = document.createElement('canvas');
          screen.width = bitmap.width;
          screen.height = bitmap.height;
          screen.getContext('2d')!.drawImage(bitmap, 0, 0);
          const node = document.querySelector('.page[data-page="2"]')!;
          const canvas = node.querySelector<HTMLCanvasElement>('.page-detail canvas') ?? node.querySelector('canvas')!;
          const rect = canvas.getBoundingClientRect();
          const dpr = devicePixelRatio;
          const [x, y, w, h] = [Math.max(rect.left, 0) + 120, Math.max(rect.top, 60) + 110, 260, 220];
          const px = (value: number) => Math.round(value * dpr);
          const a = screen.getContext('2d')!.getImageData(px(x), px(y), px(w), px(h)).data;
          if (!a.some((value) => value < 128)) throw new Error('compared a blank area');

          // Where the page sits may be rounded by a pixel; its content must match exactly.
          let best = Infinity;
          for (const dx of [-1, 0, 1]) {
            for (const dy of [-1, 0, 1]) {
              const b = canvas
                .getContext('2d')!
                .getImageData(px(x) - px(rect.left) + dx, px(y) - px(rect.top) + dy, px(w), px(h)).data;
              best = Math.min(best, a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0) / a.length);
            }
          }
          return best;
        }, shot);
      };
      expect(await difference()).toBe(0);
      for (let i = 0; i < 3; i++) await page.keyboard.press('+');
      await expectSharp(page, 2);
      expect(await difference()).toBe(0);
    });
  });
}

test('buttons and keys zoom in and out', async ({ page }) => {
  await openAt(page, 20);
  const base = await width(page, 20);
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect((await width(page, 20)) / base).toBeCloseTo(1.25, 1);
  await expectSharp(page, 20);
  await expectSharp(page, 21);

  await page.keyboard.press('Control+=');
  expect((await width(page, 20)) / base).toBeCloseTo(1.56, 1);
  for (let i = 0; i < 12; i++) await page.keyboard.press('+');
  expect((await width(page, 20)) / base).toBeCloseTo(6, 1);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

  await page.getByRole('button', { name: /Reset zoom/ }).click();
  expect(await width(page, 20)).toBe(base);
  await expect(page.locator('.page-detail')).toHaveCount(0);
});

test('Ctrl + wheel keeps the point under the pointer in place', async ({ page }) => {
  await openAt(page, 20);
  const at = { x: 900, y: 420 };
  const fraction = () =>
    page.locator('.page[data-page="21"]').evaluate((node, p) => {
      const r = node.getBoundingClientRect();
      return [(p.x - r.left) / r.width, (p.y - r.top) / r.height];
    }, at);
  const before = await fraction();
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expectSharp(page, 21);
  const after = await fraction();
  expect(after[0]!).toBeCloseTo(before[0]!, 2);
  expect(after[1]!).toBeCloseTo(before[1]!, 2);
  // The browser itself must not have zoomed.
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
});

test('panning by drag, wheel and keys re-renders what comes into view', async ({ page }) => {
  await openAt(page, 20);
  for (let i = 0; i < 6; i++) await page.keyboard.press('+');
  await expectSharp(page, 20);
  const scroll = () => page.locator('.reader-scroller').evaluate((n) => [n.scrollLeft, n.scrollTop] as const);

  const start = await scroll();
  // Between the two pages, where there is no text to select instead.
  await page.mouse.move(720, 400);
  await page.mouse.down();
  await page.mouse.move(1220, 700, { steps: 8 });
  await page.mouse.up();
  const dragged = await scroll();
  expect(dragged[0]).toBeCloseTo(start[0] - 500, -1);
  expect(dragged[1]).toBeCloseTo(start[1] - 300, -1);
  await expectSharp(page, 20);

  await page.mouse.wheel(0, 1500);
  await expect.poll(async () => (await scroll())[1]).toBeGreaterThan(dragged[1] + 1000);
  await expectSharp(page, 20);
  const wheeled = await scroll();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await scroll())[1]).toBeLessThan(wheeled[1] - 50);
  await expect(page.getByLabel('Go to page')).toHaveValue('20–21');
});

test('pages turn while zoomed and stay sharp', async ({ page }) => {
  await openAt(page, 20);
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, 600);
  // Let the browser's smooth scrolling come to rest.
  await expect.poll(() => page.locator('.reader-scroller').evaluate((n) => n.scrollTop)).toBeGreaterThan(600);
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowRight');
  expect(await visiblePages(page)).toEqual([22, 23]);
  expect(await page.locator('.reader-scroller').evaluate((n) => n.scrollTop)).toBe(0);
  await expectSharp(page, 22);
  const pixel = await page.locator('.page[data-page="22"] .page-detail canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return [...canvas.getContext('2d')!.getImageData(60, 10, 1, 1).data].slice(0, 3);
  });
  markerColor(22).forEach((value, i) => expect(Math.abs(pixel[i]! - value)).toBeLessThanOrEqual(3));
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  expect(await visiblePages(page)).toEqual([20, 21]);
  await expectSharp(page, 20);
});

test('a lone cover zooms without empty space beside it', async ({ page }) => {
  await openAt(page, 1);
  for (let i = 0; i < 5; i++) await page.keyboard.press('+');
  await expectSharp(page, 1);
  const { scrollWidth, page: pageWidth } = await page.locator('.reader-scroller').evaluate((n) => ({
    scrollWidth: n.scrollWidth,
    page: n.querySelector('.page')!.getBoundingClientRect().width,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(Math.max(1440, pageWidth + 40));
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('pinching zooms sharply, dragging pans instead of turning', async ({ page }) => {
    await openAt(page, 5);
    const base = await width(page, 5);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, ...xs: number[]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart',
        touchPoints: xs.map((x, id) => ({ x, y: 400, id })),
      });
    await touch('touchStart', 170, 220);
    for (let d = 25; d <= 75; d += 10) await touch('touchMove', 195 - d, 195 + d);
    await touch('touchEnd');
    await expect.poll(async () => (await width(page, 5)) / base).toBeGreaterThan(2);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await expectSharp(page, 5);

    await touch('touchStart', 300);
    for (let x = 280; x >= 80; x -= 40) await touch('touchMove', x);
    await touch('touchEnd');
    expect(await visiblePages(page)).toEqual([5]);
    await expectSharp(page, 5);

    // A tap while the page is still coasting only stops it, as in any scrolling view.
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Reset zoom/ }).tap();
    expect(await width(page, 5)).toBe(base);
  });
});

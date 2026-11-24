import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { book, expectPageContent, importBooks, visiblePages } from './helpers';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('the complete workflow survives closing the browser', async ({ baseURL }) => {
  const profile = mkdtempSync(join(tmpdir(), 'my-shelf-'));
  const launch = () =>
    chromium.launchPersistentContext(profile, { channel: 'chrome', baseURL, viewport: { width: 1440, height: 900 } });
  try {
    let context = await launch();
    let page = await context.newPage();
    await page.goto('/');
    await importBooks(page, 'novel.pdf');
    await book(page, 'The Lighthouse Keeper').click();
    expect(await visiblePages(page)).toEqual([1]);

    await page.getByRole('button', { name: 'Next page' }).click({ position: { x: 300, y: 300 } });
    expect(await visiblePages(page)).toEqual([2, 3]);
    await expectPageContent(page, 2);
    await expectPageContent(page, 3);
    await page.keyboard.press('ArrowRight');
    expect(await visiblePages(page)).toEqual([4, 5]);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    expect(await visiblePages(page)).toEqual([2, 3]);

    const field = page.getByLabel('Go to page');
    await field.fill('161');
    await field.press('Enter');
    expect(await visiblePages(page)).toEqual([160, 161]);
    await expectPageContent(page, 160);
    await expectPageContent(page, 161);

    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await book(page, 'The Lighthouse Keeper').click();
    expect(await visiblePages(page)).toEqual([160, 161]);
    await page.keyboard.press('ArrowRight');
    expect(await visiblePages(page)).toEqual([162, 163]);
    await page.reload();
    expect(await visiblePages(page)).toEqual([162, 163]);
    await context.close();

    context = await launch();
    page = await context.newPage();
    await page.goto('/');
    await book(page, 'The Lighthouse Keeper').click();
    expect(await visiblePages(page)).toEqual([162, 163]);
    await expectPageContent(page, 163);
    await context.close();
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('stops at both ends and marks the book finished', async ({ page }) => {
  await page.goto('/');
  await importBooks(page, 'mixed.pdf');
  await book(page, 'Mixed').click();
  expect(await visiblePages(page)).toEqual([1]);
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  expect(await visiblePages(page)).toEqual([1]);
  await page.keyboard.press('End');
  expect(await visiblePages(page)).toEqual([8, 9]);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  expect(await visiblePages(page)).toEqual([8, 9]);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

test('never distorts pages, whatever their size', async ({ page }) => {
  await page.goto('/');
  await importBooks(page, 'mixed.pdf', 'slides.pdf');
  const ratio = (n: number) =>
    page.locator(`.page[data-page="${n}"] canvas`).evaluate((c) => c.clientWidth / c.clientHeight);

  await book(page, 'Mixed').click();
  await visiblePages(page);
  const field = page.getByLabel('Go to page');
  for (const [target, expected] of [[4, 842 / 595], [5, 595 / 842], [7, 1]] as const) {
    await field.fill(String(target));
    await field.press('Enter');
    await visiblePages(page);
    expect(await ratio(target)).toBeCloseTo(expected, 1);
    await expectPageContent(page, target);
  }

  await page.getByRole('button', { name: 'Back to library' }).click();
  await book(page, 'Quarterly').click();
  await visiblePages(page);
  await page.keyboard.press('ArrowRight');
  expect(await visiblePages(page)).toEqual([2, 3]);
  expect(await ratio(2)).toBeCloseTo(960 / 540, 1);
});

test('handles rapid turning and a held key', async ({ page }) => {
  await page.goto('/');
  await importBooks(page, 'novel.pdf');
  await book(page, 'The Lighthouse').click();
  await visiblePages(page);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  expect(await visiblePages(page)).toEqual([20, 21]);
  await expectPageContent(page, 20);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  expect(await visiblePages(page)).toEqual([12, 13]);
  await expectPageContent(page, 13);

  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 20; i++) await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  expect(await visiblePages(page)).toEqual([54, 55]);
  await expectPageContent(page, 54);
});

test('slider, layout toggle and fullscreen', async ({ page }) => {
  await page.goto('/');
  await importBooks(page, 'novel.pdf');
  await book(page, 'The Lighthouse').click();
  await visiblePages(page);

  const slider = page.getByLabel('Position in book');
  const bounds = (await slider.boundingBox())!;
  await page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 5 });
  await page.mouse.up();
  const pages = await visiblePages(page);
  expect(Math.abs(pages[0]! - 160)).toBeLessThan(6);

  // Arrow keys on the focused slider turn whole spreads.
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  expect(await visiblePages(page)).toEqual(pages.map((p) => p + 2));
  await page.keyboard.press('ArrowDown');
  expect(await visiblePages(page)).toEqual(pages);

  await page.getByRole('button', { name: 'Show one page' }).click();
  expect(await visiblePages(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Show two pages' }).click();
  expect(await visiblePages(page)).toEqual(pages);

  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  expect(await visiblePages(page)).toEqual(pages);
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
});

test('a missing book leads back to the library', async ({ page }) => {
  await page.goto('/#/read/does-not-exist');
  await expect(page.getByText('no longer on your shelf')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByText('Your shelf is empty')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('shows one page at a time, with swipe and no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await importBooks(page, 'novel.pdf', 'slides.pdf', 'one-page.pdf');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await book(page, 'The Lighthouse').tap();
    expect(await visiblePages(page)).toEqual([1]);
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    expect(await visiblePages(page)).toEqual([2]);
    await expectPageContent(page, 2);

    const cdp = await page.context().newCDPSession(page);
    const swipe = async (from: number, to: number) => {
      const at = (x: number) => [{ x, y: 400 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at((from + to) / 2) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(to) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(320, 80);
    expect(await visiblePages(page)).toEqual([3]);
    await swipe(80, 320);
    expect(await visiblePages(page)).toEqual([2]);
  });
});

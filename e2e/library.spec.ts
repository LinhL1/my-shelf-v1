import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { book, fixture, importBooks, visiblePages } from './helpers';

const titles = (page: import('@playwright/test').Page) =>
  page
    .getByRole('button', { name: /^Open / })
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')!.replace(/^Open /, '').replace(/ by .*$/, '')));

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
});

test('starts empty', async ({ page }) => {
  await expect(page.getByText('Your shelf is empty')).toBeVisible();
});

test('imports several PDFs with metadata, covers and persistence', async ({ page }) => {
  await importBooks(page, 'novel.pdf', 'the-quiet_harbour.pdf', 'two-pages.pdf', 'all-blank.pdf', 'blank-cover.pdf');
  await expect(book(page, 'The Lighthouse Keeper by Ada Marsh')).toBeVisible();
  // No metadata: the title comes from the file name.
  await expect(book(page, 'The quiet harbour')).toBeVisible();
  // Authoring-tool junk is removed.
  await expect(book(page, 'Handout by Zed Young')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(5);
  await expect
    .poll(() =>
      page.locator('.book-cover img').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length),
    )
    .toBe(5);
});

test('thickness follows page count', async ({ page }) => {
  await importBooks(page, 'thick.pdf', 'novel.pdf', 'one-page.pdf');
  const spine = (title: string) =>
    book(page, title).locator('.book-spine').evaluate((n) => (n as HTMLElement).offsetWidth);
  const [thick, novel, leaflet] = [await spine('A Complete'), await spine('The Lighthouse'), await spine('Leaflet')];
  expect(thick).toBeGreaterThan(novel);
  expect(novel).toBeGreaterThan(leaflet);
  await expect(book(page, 'The Lighthouse').locator('.book-spine-title')).toHaveText('The Lighthouse Keeper');
});

test('rejects files it cannot read, and says why', async ({ page }) => {
  await importBooks(page, 'locked.pdf', 'corrupt.pdf', 'renamed-image.pdf', 'empty.pdf', 'one-page.pdf');
  await expect(page.getByText('password-protected')).toBeVisible();
  await expect(page.getByText('damaged or is not a valid PDF')).toBeVisible();
  await expect(page.getByText('This is not a PDF file.')).toBeVisible();
  await expect(page.getByText('This file is empty.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(1);

  await importBooks(page, 'one-page.pdf');
  await expect(page.getByText('Already on your shelf')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(1);
});

test('accepts drag and drop', async ({ page }) => {
  const base64 = readFileSync(fixture('mixed.pdf')).toString('base64');
  const transfer = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'mixed.pdf', { type: 'application/pdf' }));
    return dt;
  }, base64);
  await page.dispatchEvent('body', 'dragover', { dataTransfer: transfer });
  await expect(page.getByText('Drop PDFs to add them')).toBeVisible();
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
  await expect(book(page, 'Mixed Page Sizes')).toBeVisible();
  await expect(page.getByText('Drop PDFs to add them')).toBeHidden();
});

test('searches, sorts and filters', async ({ page }) => {
  await importBooks(page, 'novel.pdf', 'thick.pdf', 'mixed.pdf', 'one-page.pdf');
  expect(await titles(page)).toEqual(['Leaflet', 'Mixed Page Sizes', expect.stringContaining('A Complete'), 'The Lighthouse Keeper']);

  await page.getByLabel('Sort by').selectOption('title');
  expect(await titles(page)).toEqual([expect.stringContaining('A Complete'), 'Leaflet', 'Mixed Page Sizes', 'The Lighthouse Keeper']);
  await page.getByLabel('Sort by').selectOption('author');
  expect(await titles(page)).toEqual(['The Lighthouse Keeper', 'Mixed Page Sizes', expect.stringContaining('A Complete'), 'Leaflet']);

  const search = page.getByRole('searchbox');
  await search.fill('elodie');
  expect(await titles(page)).toEqual([expect.stringContaining('A Complete')]);
  await search.fill('zzz');
  await expect(page.getByText('No matching books')).toBeVisible();
  await search.fill('');

  await page.getByRole('button', { name: 'Recently read' }).click();
  await expect(page.getByText('Nothing here yet')).toBeVisible();
  await page.getByRole('button', { name: 'Recently added' }).click();
  expect((await titles(page))[0]).toBe('Leaflet');

  await book(page, 'Mixed Page Sizes').click();
  await visiblePages(page);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'Recently read' }).click();
  expect(await titles(page)).toEqual(['Mixed Page Sizes']);
});

test('edits, downloads and removes a book', async ({ page }) => {
  await importBooks(page, 'the-quiet_harbour.pdf');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Author' }).fill('Ida Wren');
  await page.getByRole('textbox', { name: 'Title' }).fill('Quiet Harbour');
  await page.getByRole('button', { name: 'Save' }).click();
  // The dialog closes once the change is committed.
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(book(page, 'Quiet Harbour by Ida Wren')).toBeVisible();

  await page.getByRole('button', { name: 'Options for Quiet Harbour' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  const saved = await (await download).path();
  expect(readFileSync(saved).equals(readFileSync(fixture('the-quiet_harbour.pdf')))).toBe(true);

  await page.getByRole('button', { name: 'Options for Quiet Harbour' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Your shelf is empty')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your shelf is empty')).toBeVisible();
});

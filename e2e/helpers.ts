import { expect, type Page } from '@playwright/test';
import { FIXTURES, markerColor } from './makeFixtures';

export const fixture = (name: string) => FIXTURES + name;

export async function importBooks(page: Page, ...names: string[]) {
  await page.locator('input[type=file]').setInputFiles(names.map(fixture));
  await expect(page.getByText('Import finished')).toBeVisible({ timeout: 45_000 });
}

export const book = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(`^Open ${title}`) });

/** Resolves once no page is turning and every visible page is drawn; returns their numbers left to right. */
export async function visiblePages(page: Page): Promise<number[]> {
  await expect(page.locator('.open-book[data-turning=false]')).toBeVisible();
  await expect(page.locator('.page:not([data-status=ready])')).toHaveCount(0);
  return page.locator('.page').evaluateAll((nodes) => nodes.map((n) => Number((n as HTMLElement).dataset.page)));
}

/** Asserts that a canvas really shows the PDF page it claims to, using the fixture's colour marker. */
export async function expectPageContent(page: Page, number: number) {
  const pixel = await page.locator(`.page[data-page="${number}"] canvas`).evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    return [...ctx.getImageData(canvas.width / 2, Math.round(canvas.height * 0.03), 1, 1).data].slice(0, 3);
  });
  markerColor(number).forEach((value, i) => expect(Math.abs(pixel[i]! - value)).toBeLessThanOrEqual(3));
}

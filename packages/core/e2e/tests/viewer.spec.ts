import { expect, test } from '@playwright/test';
import { openDoc, pages, viewer } from './helpers.ts';

test.describe('document viewer', () => {
  test('renders one sheet per fixed page', async ({ page }) => {
    await openDoc(page, 'alpha');
    await expect(pages(page)).toHaveCount(3);
    await expect(viewer(page).getByText('Alpha page one')).toBeVisible();
    await expect(viewer(page).getByText('Alpha page three')).toBeVisible();
  });

  test('the header shows the title and the page counter', async ({ page }) => {
    await openDoc(page, 'alpha');
    await expect(page.getByRole('heading', { name: 'Alpha Report' })).toBeVisible();
    await expect(page.locator('header').getByText(/^\d+ \/ 3$/)).toBeVisible();
  });

  test('the title sits at the centre of the header, not of the leftover space', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openDoc(page, 'alpha');

    const header = await page.locator('header').boundingBox();
    const title = await page.locator('header h1').boundingBox();
    if (!header || !title) throw new Error('header or title not rendered');

    expect(Math.abs(title.x + title.width / 2 - (header.x + header.width / 2))).toBeLessThan(2);
  });

  test('a sheet is a real A4 box at 96dpi', async ({ page }) => {
    await openDoc(page, 'alpha');
    const box = await pages(page).first().boundingBox();
    if (!box) throw new Error('page frame has no bounding box');
    // Scaled to fit the viewport, so compare the aspect ratio rather than px.
    expect(box.width / box.height).toBeCloseTo(794 / 1123, 2);
  });

  test('zoom controls change the rendered scale', async ({ page }) => {
    await openDoc(page, 'alpha');
    const readout = page.getByRole('button', { name: /%$/ });
    const before = await pages(page).first().boundingBox();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect
      .poll(async () => (await pages(page).first().boundingBox())?.width ?? 0)
      .toBeGreaterThan(before?.width ?? 0);

    await readout.click(); // actual size — 100%
    await expect(readout).toHaveText('100%');
    const actual = await pages(page).first().boundingBox();
    expect(actual?.width).toBeCloseTo(794, 0);
  });

  test('the thumbnail rail jumps to a page', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.locator('[data-thumb-page="3"]').click();
    await expect(page.locator('header').getByText('3 / 3')).toBeVisible();
  });

  test('the outline lists headings with their page numbers', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.getByRole('button', { name: 'outline', exact: true }).click();
    const outline = page.getByRole('navigation');
    await expect(outline.getByText('Alpha page one')).toBeVisible();
    await expect(outline.getByText('Alpha page two')).toBeVisible();

    await outline.getByText('Alpha page three').click();
    await expect(page.locator('header').getByText('3 / 3')).toBeVisible();
  });

  test('the back link returns to the browser', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.getByRole('link', { name: 'Back to documents' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

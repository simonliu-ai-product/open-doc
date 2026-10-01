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
    /* The counter is a field you can type a page into, so it is read by its
       accessible name and its value rather than as loose text. */
    await expect(page.getByLabel('Page number, 3 pages')).toBeVisible();
  });

  test('the view controls sit at the centre of the header, not of the leftover space', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openDoc(page, 'alpha');

    const header = await page.locator('header').boundingBox();
    const first = await page.getByLabel('Page number, 3 pages').boundingBox();
    const last = await page.getByRole('button', { name: /Fullscreen/ }).boundingBox();
    if (!header || !first || !last) throw new Error('header controls not rendered');

    const centre = (first.x + last.x + last.width) / 2;
    expect(Math.abs(centre - (header.x + header.width / 2))).toBeLessThan(2);
    // The title leads the bar, beside the way back.
    const title = await page.locator('header h1').boundingBox();
    expect(title?.x ?? 0).toBeLessThan(first.x);
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
    const level = page.getByRole('textbox', { name: /Zoom level/ });
    const before = await pages(page).first().boundingBox();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect
      .poll(async () => (await pages(page).first().boundingBox())?.width ?? 0)
      .toBeGreaterThan(before?.width ?? 0);

    await page.getByRole('button', { name: 'Zoom options' }).click();
    await page.getByRole('menuitem', { name: 'Actual size (100%)' }).click();
    await expect(level).toHaveValue('100%');
    const actual = await pages(page).first().boundingBox();
    expect(actual?.width).toBeCloseTo(794, 0);
  });

  test('a zoom level typed into the field is the one drawn', async ({ page }) => {
    await openDoc(page, 'alpha');
    const level = page.getByRole('textbox', { name: /Zoom level/ });
    await level.click();
    await level.fill('150');
    await level.press('Enter');
    await expect(level).toHaveValue('150%');
    await expect
      .poll(async () => (await pages(page).first().boundingBox())?.width ?? 0)
      .toBeCloseTo(794 * 1.5, 0);

    // Out of range clamps rather than being refused.
    await level.click();
    await level.fill('900');
    await level.press('Enter');
    await expect(level).toHaveValue('200%');
  });

  test('a page number typed into the field scrolls there', async ({ page }) => {
    await openDoc(page, 'alpha');
    const field = page.getByLabel('Page number, 3 pages');
    await field.click();
    await field.fill('3');
    await field.press('Enter');
    await expect(field).toHaveValue('3');
    await expect(pages(page).nth(2)).toBeInViewport();
  });

  test('the thumbnail rail jumps to a page', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.locator('[data-thumb-page="3"]').click();
    await expect(page.getByLabel('Page number, 3 pages')).toHaveValue('3');
  });

  test('the outline lists headings with their page numbers', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.getByRole('button', { name: 'outline', exact: true }).click();
    const outline = page.getByRole('navigation');
    await expect(outline.getByText('Alpha page one')).toBeVisible();
    await expect(outline.getByText('Alpha page two')).toBeVisible();

    await outline.getByText('Alpha page three').click();
    await expect(page.getByLabel('Page number, 3 pages')).toHaveValue('3');
  });

  test('the back link returns to the browser', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.getByRole('link', { name: 'Back to documents' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

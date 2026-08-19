import { expect, type Page, test } from '@playwright/test';
import { openDoc, pages } from './helpers.ts';

/** Every sheet, as {marker numbers, footnote numbers} — the invariant a footnote must hold. */
async function footnotesByPage(page: Page) {
  return page.evaluate(() => {
    const frames = Array.from(
      document.querySelectorAll('[data-od-viewer] [data-od-page]'),
    ) as HTMLElement[];
    return frames.map((frame) => ({
      markers: Array.from(frame.querySelectorAll('sup[data-od-label="footnote"]')).map((el) =>
        (el.textContent ?? '').trim(),
      ),
      printed: Array.from(frame.querySelectorAll('[data-od-footnotes] [data-od-footnote-row]')).map(
        (el) => (el.firstElementChild?.textContent ?? '').trim(),
      ),
    }));
  });
}

test.describe('long-form document layer', () => {
  test('a footnote prints on the sheet its marker landed on', async ({ page }) => {
    await openDoc(page, 'long-form');
    await expect(pages(page).first()).toBeVisible();
    // The numbers arrive with the scan, one pass after the pages render. Waiting
    // for a marker to *exist* is not enough — until the scan lands it carries a
    // placeholder, and every assertion below is about the numbers themselves.
    await expect
      .poll(async () => {
        const sheets = await footnotesByPage(page);
        const markers = sheets.flatMap((sheet) => sheet.markers);
        return markers.length > 0 && markers.every((marker) => /^\d+$/.test(marker));
      })
      .toBe(true);

    const sheets = await footnotesByPage(page);
    for (const sheet of sheets) {
      // No orphaned notes, and no marker whose note printed somewhere else.
      expect(sheet.printed.sort()).toEqual(sheet.markers.sort());
    }

    const allMarkers = sheets.flatMap((sheet) => sheet.markers);
    expect(allMarkers.length).toBeGreaterThanOrEqual(2);
    // Numbering runs across the whole document, fixed pages included.
    expect(allMarkers).toEqual(allMarkers.map((_, index) => String(index + 1)));
  });

  test('figures and tables number themselves and the lists pick them up', async ({ page }) => {
    await openDoc(page, 'long-form');
    const viewer = page.locator('[data-od-viewer]');

    await expect(viewer.getByText('Table 1', { exact: false }).first()).toBeVisible();
    await expect(viewer.getByText('Figure 1', { exact: false }).first()).toBeVisible();

    const tables = viewer.locator('[data-od-list-of="table"]');
    await expect(tables).toContainText('Fixture rows');
    const figures = viewer.locator('[data-od-list-of="figure"]');
    await expect(figures).toContainText('A drawn box');
  });

  test('a cross-reference resolves, and names the page only when it is elsewhere', async ({
    page,
  }) => {
    await openDoc(page, 'long-form');
    const refs = page.locator('[data-od-viewer] [data-od-ref="rows-table"]');
    await expect(refs.first()).toContainText('Table 1');
    // Nothing may be left unresolved once the scan has run.
    await expect(page.locator('[data-od-viewer] [data-od-ref-unresolved]')).toHaveCount(0);

    const sameSheet = await refs.first().evaluate((el) => el.textContent ?? '');
    expect(sameSheet.trim()).toBe('Table 1');
  });

  test('a csv import becomes real rows, empty cells included', async ({ page }) => {
    await openDoc(page, 'long-form');
    const table = page.locator('[data-od-viewer] table').first();
    await expect(table).toContainText('alpha-api');
    await expect(table).toContainText('gamma-api');
    // A quoted value keeps its comma and stays text; a blank cell prints as a dash.
    await expect(table).toContainText('3,400');
    await expect(table).toContainText('—');
  });
});

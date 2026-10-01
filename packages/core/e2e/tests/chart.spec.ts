import { expect, test } from '@playwright/test';
import { deleteDoc, duplicateDoc, openDoc, refreshDocsModule, writeDocSource } from './helpers.ts';

const SOURCE = `import { Chart, type DocEntry, type DocMeta, flow } from '@open-document/core';

export const meta: DocMeta = { title: 'Charts', createdAt: '2026-01-03T00:00:00.000Z' };

const rows = [
  { month: 'Jan', cost: 120, budget: 100 },
  { month: 'Feb', cost: 80, budget: 100 },
  { month: 'Mar', cost: 150, budget: 120 },
];

export default [
  flow(
    <>
      <h1>Charts</h1>
      <Chart id="f-cost" data={rows} x="month" y={['cost', 'budget']} caption="Cost against budget" />
      <Chart type="pie" data={rows} x="month" y="cost" values caption="Share of cost" />
    </>,
  ),
] satisfies DocEntry[];
`;

test.describe('charts', () => {
  test.beforeEach(async ({ request }) => {
    await duplicateDoc(request, 'alpha', 'charts');
    await writeDocSource('charts', SOURCE);
    await refreshDocsModule('charts');
  });

  test.afterEach(async ({ page, request }) => {
    const reloaded = page.waitForEvent('load', { timeout: 15_000 }).catch(() => {});
    await deleteDoc(request, 'charts');
    await reloaded;
  });

  test('draw from data, numbered as figures, in the document’s accent', async ({ page }) => {
    await openDoc(page, 'charts');
    const sheet = page.locator('[data-od-viewer] [data-od-page]').first();
    const bars = sheet.locator('figure').first().locator('svg[role="img"] rect[style*="fill"]');
    // Three months, two series, plus the two legend swatches.
    await expect(bars).toHaveCount(8);
    await expect(sheet.locator('figure').first().locator('figcaption')).toContainText('Figure 1');
    await expect(sheet.locator('figure').nth(1).locator('figcaption')).toContainText('Figure 2');
    await expect(sheet.locator('figure').nth(1).locator('path')).toHaveCount(3);
    const fill = await bars.first().evaluate((el) => getComputedStyle(el).fill);
    // The first series is the accent: the default design's blue.
    expect(fill).toBe('rgb(37, 99, 235)');
  });
});

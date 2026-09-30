import { expect, type Page, test } from '@playwright/test';
import { openDoc, pages, readDocSource, viewer, writeDocSource } from './helpers.ts';

async function boxes(page: Page) {
  const frames = pages(page);
  const out = [];
  for (let at = 0; at < (await frames.count()); at++) {
    // The sheet's scaled wrapper is the page frame's parent.
    const box = await frames.nth(at).locator('xpath=..').boundingBox();
    if (!box) throw new Error(`page ${at + 1} has no box`);
    out.push(box);
  }
  return out;
}

function mode(page: Page, name: 'Continuous' | 'Two-up' | 'Grid') {
  return page.getByRole('button', { name, exact: true });
}

test.describe('view modes', () => {
  test.beforeEach(async ({ page }) => {
    await openDoc(page, 'alpha');
  });

  test('continuous is the default, one sheet under another', async ({ page }) => {
    await expect(mode(page, 'Continuous')).toHaveAttribute('aria-pressed', 'true');
    const [one, two] = await boxes(page);
    expect(two?.y).toBeGreaterThan((one?.y ?? 0) + (one?.height ?? 0) - 1);
    expect(two?.x).toBeCloseTo(one?.x ?? 0, 0);
  });

  test('two-up faces pages as a bound document: 1 alone on the right, then 2–3', async ({
    page,
  }) => {
    await mode(page, 'Two-up').click();
    await expect(viewer(page).locator('[data-od-view="spread"]')).toHaveCount(1);
    const [one, two, three] = await boxes(page);
    expect(two?.y).toBeCloseTo(three?.y ?? 0, 0);
    expect(two?.x).toBeLessThan(three?.x ?? 0);
    expect(one?.x).toBeCloseTo(three?.x ?? 0, 0);
    expect(two?.y).toBeGreaterThan(one?.y ?? 0);
  });

  test('fit width in two-up fits the spread, not one sheet', async ({ page }) => {
    await mode(page, 'Two-up').click();
    await page.getByRole('button', { name: 'Fit width' }).click();
    const pane = await viewer(page).boundingBox();
    const [, two, three] = await boxes(page);
    expect(two?.x).toBeGreaterThanOrEqual(pane?.x ?? 0);
    expect((three?.x ?? 0) + (three?.width ?? 0)).toBeLessThanOrEqual(
      (pane?.x ?? 0) + (pane?.width ?? 0),
    );
  });

  test('grid lays a row of sheets side by side at a readable zoom', async ({ page }) => {
    await mode(page, 'Grid').click();
    const [one, two, three] = await boxes(page);
    expect(one?.y).toBeCloseTo(two?.y ?? 0, 0);
    expect(two?.y).toBeCloseTo(three?.y ?? 0, 0);
    expect(one?.x).toBeLessThan(two?.x ?? 0);
  });

  test('a grid row that is not full starts under the first column', async ({ page }) => {
    // flow-report packs into four pages: a full row of three, then one.
    await openDoc(page, 'flow-report');
    await expect(pages(page)).toHaveCount(4);
    await mode(page, 'Grid').click();
    const all = await boxes(page);
    const fourth = all[3];
    expect(fourth?.y).toBeGreaterThan(all[0]?.y ?? 0);
    expect(fourth?.x).toBeCloseTo(all[0]?.x ?? 0, 0);
  });

  test('a page jump lands on and reports the page asked for', async ({ page }) => {
    await mode(page, 'Two-up').click();
    const counter = page.getByRole('textbox', { name: /Page number/ });
    await counter.fill('3');
    await counter.press('Enter');
    await expect(counter).toHaveValue('3');
    await expect(pages(page).nth(2)).toBeInViewport();
  });

  test('the mode is remembered per document', async ({ page }) => {
    await mode(page, 'Grid').click();
    await page.reload();
    await expect(pages(page).first()).toBeVisible();
    await expect(mode(page, 'Grid')).toHaveAttribute('aria-pressed', 'true');

    await openDoc(page, 'edit-target');
    await expect(mode(page, 'Continuous')).toHaveAttribute('aria-pressed', 'true');
  });

  test('text is still edited on the page in two-up', async ({ page }) => {
    const original = await readDocSource('alpha');
    try {
      await mode(page, 'Two-up').click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await viewer(page).getByText('Alpha page three').dblclick();
      await expect(viewer(page).locator('[data-od-editing]:focus')).toHaveCount(1);
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('Alpha page three, edited in two-up');
      await page.keyboard.press('Enter');
      await page
        .getByRole('toolbar', { name: 'Unsaved changes' })
        .getByRole('button', { name: 'Save' })
        .click();
      await expect
        .poll(async () => await readDocSource('alpha'), { timeout: 10_000 })
        .toContain('Alpha page three, edited in two-up');
    } finally {
      await writeDocSource('alpha', original);
    }
  });
});

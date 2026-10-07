import { expect, test } from '@playwright/test';
import { devScratchDir, runCli } from './helpers.ts';

// Deleting a document folder reloads open pages once the watcher sees it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

test.describe('document cards', () => {
  test.beforeAll(async () => {
    // A landscape sheet among portrait ones — the case that used to make a short card.
    const made = await runCli(['new', 'wide-card', '--template', 'certificate'], devScratchDir);
    expect(made.code, made.stderr).toBe(0);
  });

  test.afterAll(async ({ request }) => {
    await request.delete('/__docs/wide-card');
    await settle();
  });

  test('every card previews in the same box, whatever the paper', async ({ page }) => {
    await page.goto('/');
    const frames = page.locator('[data-od-card-frame]');
    await expect.poll(async () => await frames.count()).toBeGreaterThan(2);

    const boxes = await frames.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      }),
    );
    const heights = new Set(boxes.map((box) => box.height));
    expect(heights.size, JSON.stringify(boxes)).toBe(1);

    // The landscape sheet is whole inside its box, centred, not cropped.
    const wide = page
      .locator('[data-od-card-frame]')
      .filter({ has: page.locator('[data-od-page]') })
      .nth(0);
    await expect(wide).toBeVisible();
  });
});

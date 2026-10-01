import { expect, test } from '@playwright/test';
import { TINY_PNG } from './helpers.ts';

const FILE = 'e2e-panel-pixel.png';

test.describe('assets', () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`/__assets/@global/${FILE}`);
  });

  test('an uploaded asset shows up in the assets page as unused', async ({ page, request }) => {
    const uploaded = await request.post(`/__assets/@global/${FILE}?overwrite=1`, {
      data: TINY_PNG,
      headers: { 'content-type': 'image/png' },
    });
    expect(uploaded.ok()).toBe(true);

    await page.goto('/assets');
    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();
    await expect(page.getByText(FILE)).toBeVisible();
    // Nothing imports it, which is exactly what the badge is for.
    await expect(page.getByText('unused').first()).toBeVisible();
  });

  test('the scope switcher lists each document alongside Project', async ({ page }) => {
    await page.goto('/assets');
    await expect(page.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'alpha', exact: true })).toBeVisible();
  });
});

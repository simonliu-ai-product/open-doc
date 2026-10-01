import { expect, test } from '@playwright/test';
import { openDoc } from './helpers.ts';

test.describe('command palette', () => {
  test('⌘K finds a document by title and opens it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Search/ })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    const field = page.getByRole('combobox');
    await expect(field).toBeFocused();
    await field.fill('alpha');
    await expect(page.getByRole('option', { name: /Alpha Report/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/d\/alpha$/);
  });

  test('the sidebar search opens it, and Escape closes it back to where focus was', async ({
    page,
  }) => {
    await page.goto('/');
    const search = page.getByRole('button', { name: /^Search/ });
    await search.click();
    await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeHidden();
    await expect(search).toBeFocused();
  });

  test('in a document, a number jumps to that page ahead of matching sections', async ({
    page,
  }) => {
    await openDoc(page, 'alpha');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('3');
    await expect(page.getByRole('option').first()).toHaveText(/Go to page 3/);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Page number, 3 pages')).toHaveValue('3');
  });
});

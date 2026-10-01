import { expect, test } from '@playwright/test';

test.describe('language', () => {
  test('switches the chrome to Traditional Chinese, keeps it on reload, and switches back', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.locator('aside').first();
    await expect(nav.getByText('Documents')).toBeVisible();

    await page.getByRole('button', { name: 'Language' }).first().click();
    await page.getByRole('menuitem', { name: '繁體中文' }).click();
    await expect(nav.getByText('文件', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');

    await page.reload();
    await expect(nav.getByText('文件', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '語言' }).first().click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(nav.getByText('Documents')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

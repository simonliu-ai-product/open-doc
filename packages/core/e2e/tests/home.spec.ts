import { expect, test } from '@playwright/test';

test.describe('document browser', () => {
  test('lists every fixture document with its display title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Alpha Report', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit Target', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Flow Report', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hot Swap', exact: true })).toBeVisible();
  });

  test('a card links to the viewer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Alpha Report', exact: true }).click();
    await expect(page).toHaveURL(/\/d\/alpha$/);
    // The thumbnail rail draws page one too, a moment later; the sheet is the viewer's.
    await expect(page.locator('[data-od-viewer]').getByText('Alpha page one')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('the theme badge links to the theme page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Plain', exact: true }).click();
    await expect(page).toHaveURL(/\/themes\/plain$/);
    await expect(page.getByText('Plain').first()).toBeVisible();
  });

  test('the sidebar counts documents, themes, and assets', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('aside').first();
    await expect(nav.getByText('Documents')).toBeVisible();
    await expect(nav.getByText('Themes')).toBeVisible();
    await expect(nav.getByText('Assets')).toBeVisible();
    await expect(nav.getByText('Unfiled')).toBeVisible();
  });

  test('theme toggle switches to dark mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('unknown routes render the not-found page', async ({ page }) => {
    await page.goto('/definitely-not-a-route');
    await expect(page.getByText('Nothing here')).toBeVisible();
  });

  test('folders can be created and deleted from the sidebar', async ({ page, request }) => {
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'New folder' }).click();
      const input = page.getByPlaceholder('Folder name');
      await input.fill('Sidebar Folder');
      await expect(input).toHaveValue('Sidebar Folder');
      const created = page.waitForResponse(
        (res) => res.url().includes('/__folders') && res.request().method() === 'POST',
      );
      await input.press('Enter');
      expect((await created).status()).toBe(200);

      // "Sidebar Folder options" only exists on a real folder row, so its
      // presence proves the folder rendered in the sidebar.
      const actions = page.getByRole('button', { name: 'Sidebar Folder options' });
      await expect(actions).toBeVisible();
      await actions.click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(actions).toHaveCount(0);
    } finally {
      const { folders } = (await (await request.get('/__folders')).json()) as {
        folders: { id: string }[];
      };
      for (const folder of folders) await request.delete(`/__folders/${folder.id}`);
    }
  });
});

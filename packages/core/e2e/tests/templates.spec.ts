import { expect, test } from '@playwright/test';
import { openDoc, readDocSource, viewer } from './helpers.ts';

test.describe('new document from a template', () => {
  test.afterEach(async ({ request }) => {
    await request.delete('/__docs/quarterly-review');
  });

  test('the gallery names each template and the document opens titled', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New document' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'New document' });
    await expect(dialog).toBeVisible();
    // The name the CLI and an agent use is on the card.
    await expect(dialog.getByText('meeting-notes', { exact: true })).toBeVisible();

    await dialog.getByText('Report', { exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Title' }).fill('Quarterly review');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/d\/quarterly-review$/);
    // The document is new to the dev server too; openDoc waits for its sheets.
    await openDoc(page, 'quarterly-review');
    await expect(
      viewer(page).getByRole('heading', { name: 'Quarterly review' }).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    const source = await readDocSource('quarterly-review');
    expect(source).toContain(`title: 'Quarterly review'`);
    expect(source).not.toContain('Annual report');
  });
});

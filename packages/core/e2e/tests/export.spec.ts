import { type Download, expect, type Page, test } from '@playwright/test';
import { openDoc } from './helpers.ts';

/**
 * Downloads the open document as HTML. Other specs write to the shared
 * fixture — diagnostics deletes its document as it finishes — and the docs
 * module that change regenerates reloads whatever page is open, taking an
 * export in flight with it. A reload is therefore a reason to ask again, not a
 * failure.
 */
async function downloadHtml(page: Page, docId: string): Promise<Download> {
  for (let attempt = 0; ; attempt++) {
    const reloaded = page
      .waitForEvent('framenavigated', { timeout: 20_000 })
      .then(() => null)
      .catch(() => null);
    const download = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Download' }).click();
    await page.getByRole('menuitem', { name: 'HTML' }).click();
    const file = await Promise.race([download, reloaded]);
    if (file) return file;
    download.catch(() => {});
    if (attempt >= 2) throw new Error('the page kept reloading during the export');
    await openDoc(page, docId);
  }
}

test.describe('export', () => {
  test('the page range reads back what it will download, and refuses pages that do not exist', async ({
    page,
  }) => {
    await openDoc(page, 'alpha');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.getByText('All 3 pages')).toBeVisible();

    await page.getByRole('button', { name: /Range/ }).click();
    const range = page.getByLabel('Page range');
    await expect(range).toBeFocused();
    await range.fill('1, 3');
    await expect(page.getByText('Pages 1, 3 · 2 pages')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /PDF/ })).toBeEnabled();

    await range.fill('9');
    await expect(page.getByText('No such pages — this document has 3')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /PDF/ })).toBeDisabled();
  });

  test('HTML export downloads a self-contained document', async ({ page }) => {
    test.setTimeout(90_000);
    await openDoc(page, 'alpha');
    const file = await downloadHtml(page, 'alpha');
    expect(file.suggestedFilename()).toBe('alpha.html');

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const html = Buffer.concat(chunks).toString('utf8');

    // Every sheet is serialized, and nothing points back at the dev server.
    expect(html).toContain('Alpha page one');
    expect(html).toContain('Alpha page three');
    expect(html).not.toContain('/@vite/client');
    // The document's language, not the viewer's.
    expect(html).toContain('<html lang="en-GB">');
  });

  test('a flow document exports every packed page', async ({ page }) => {
    test.setTimeout(90_000);
    await openDoc(page, 'flow-report');
    const stream = await (await downloadHtml(page, 'flow-report')).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const html = Buffer.concat(chunks).toString('utf8');

    expect(html).toContain('Flow paragraph 1.');
    expect(html).toContain('Flow paragraph 40.');
    // The running footer is resolved at export time, not left as a placeholder.
    expect(html).toMatch(/Flow Report — page \d+ of \d+/);
  });
});

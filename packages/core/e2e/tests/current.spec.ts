import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { devScratchDir, openDoc, viewer } from './helpers.ts';

const CURRENT = path.join(devScratchDir, 'node_modules', '.open-doc', 'current.json');

type Current = {
  docId: string;
  pageIndex: number;
  pageNumber: number;
  totalPages: number;
  docTitle: string;
  pagePath: string;
  selection: { line: number; column: number; tagName: string; text: string } | null;
  updatedAt: string;
};

async function readCurrent(): Promise<Current | null> {
  try {
    return JSON.parse(await fs.readFile(CURRENT, 'utf8')) as Current;
  } catch {
    return null;
  }
}

test.describe('current.json cursor', () => {
  test('opening a document publishes where the reader is', async ({ page }) => {
    await openDoc(page, 'alpha');
    await expect.poll(async () => (await readCurrent())?.docId, { timeout: 15_000 }).toBe('alpha');

    const current = await readCurrent();
    expect(current?.docTitle).toBe('Alpha Report');
    expect(current?.pagePath).toBe('docs/alpha/index.tsx');
    expect(current?.totalPages).toBe(3);
    expect(current?.pageNumber).toBe(1);
  });

  test('navigating to another page moves the cursor', async ({ page }) => {
    await openDoc(page, 'alpha');
    await page.locator('[data-thumb-page="3"]').click();
    await expect.poll(async () => (await readCurrent())?.pageNumber, { timeout: 15_000 }).toBe(3);
    expect((await readCurrent())?.pageIndex).toBe(2);
  });

  test('a flow document reports its packed page count', async ({ page }) => {
    await openDoc(page, 'flow-report');
    await expect
      .poll(async () => (await readCurrent())?.docId, { timeout: 15_000 })
      .toBe('flow-report');
    const current = await readCurrent();
    const rendered = await viewer(page).locator('[data-od-page]').count();
    expect(current?.totalPages).toBe(rendered);
  });

  test('picking an element in the inspector publishes the selection', async ({ page }) => {
    await openDoc(page, 'edit-target');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await viewer(page).getByText('Editable heading').click();

    await expect
      .poll(async () => (await readCurrent())?.selection?.text, { timeout: 15_000 })
      .toBe('Editable heading');

    const selection = (await readCurrent())?.selection;
    expect(selection?.tagName).toBe('h1');
    expect(selection?.line).toBeGreaterThan(0);

    // The line it reports has to be the one an agent would open.
    const source = await fs.readFile(
      path.join(devScratchDir, 'docs/edit-target/index.tsx'),
      'utf8',
    );
    expect(source.split('\n')[(selection?.line ?? 1) - 1]).toContain('Editable heading');
  });

  test('moving to another document clears a stale selection', async ({ page }) => {
    await openDoc(page, 'edit-target');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await viewer(page).getByText('Editable heading').click();
    await expect
      .poll(async () => (await readCurrent())?.selection?.text, { timeout: 15_000 })
      .toBe('Editable heading');

    await openDoc(page, 'alpha');
    await expect.poll(async () => (await readCurrent())?.docId, { timeout: 15_000 }).toBe('alpha');
    expect((await readCurrent())?.selection).toBeNull();
  });
});

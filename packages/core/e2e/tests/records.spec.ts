import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { devScratchDir, openDoc, runCli, viewer } from './helpers.ts';

// Two rows of very different length: the pages have to be counted again for
// each, or the long row is cut to the short one's single page.
const FLOW_DOC = `import { type DocEntry, type DocMeta, flow, useRecord } from '@open-document/core';
import rows from './rows.csv';

export const records = rows;
export const meta: DocMeta = { title: 'Merge flow', createdAt: '2026-01-01T00:00:00.000Z' };

// The blocks are fixed when the module loads; what changes per row is what
// each one prints — a slot past the row's count prints nothing.
const Slot = ({ n }: { n: number }) => {
  const row = useRecord<{ name: string; paragraphs: number }>();
  if (!row || n > Number(row.paragraphs)) return null;
  return (
    <p style={{ fontSize: 14, margin: '0 0 12px' }}>
      {row.name} paragraph {n}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
      eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
    </p>
  );
};

export default [
  flow(
    <>
      {Array.from({ length: 60 }, (_, i) => (
        <Slot key={i} n={i + 1} />
      ))}
    </>,
  ),
] satisfies DocEntry[];
`;

/**
 * Removing a document folder reloads every open page once the watcher sees it;
 * waiting it out keeps that reload from landing in the next spec's page.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

test.describe('a document printed once per record', () => {
  test.beforeAll(async () => {
    const made = await runCli(['new', 'awards', '--template', 'certificate'], devScratchDir);
    expect(made.code, made.stderr).toBe(0);
  });

  test.afterAll(async ({ request }) => {
    await request.delete('/__docs/awards');
    await settle();
  });

  test('the picker steps through the rows and the page follows', async ({ page }) => {
    await openDoc(page, 'awards');
    const picker = page.getByRole('group', { name: 'Record' });
    await expect(picker).toContainText('1/3');
    await expect(picker).toContainText('Lin Mei');
    await expect(viewer(page).getByText('Lin Mei')).toBeVisible();

    await picker.getByRole('button', { name: 'Next record' }).click();
    await expect(picker).toContainText('2/3');
    await expect(viewer(page).getByText('Chen Wei')).toBeVisible();
    await expect(viewer(page).getByText('Lin Mei')).toHaveCount(0);

    await picker.getByRole('combobox', { name: 'Record' }).selectOption('2');
    await expect(viewer(page).getByText('Writing reports with an agent')).toBeVisible();
  });

  test('a flow section is paginated again for each row', async ({ page, request }) => {
    const dir = path.join(devScratchDir, 'docs', 'merge-flow');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'rows.csv'), 'name,paragraphs\nShort,1\nLong,60\n');
    await fs.writeFile(path.join(dir, 'index.tsx'), FLOW_DOC);
    try {
      // Rows are chosen by URL: a new document folder makes the dev server
      // reload open pages a moment later, and a row picked by click would not
      // survive that.
      const sheets = viewer(page).locator('[data-od-page]');
      await openDoc(page, 'merge-flow', '?record=1');
      await expect(sheets).toHaveCount(1);
      await openDoc(page, 'merge-flow', '?record=2');
      await expect.poll(async () => await sheets.count(), { timeout: 15_000 }).toBeGreaterThan(3);
      await expect(viewer(page).getByText('Long paragraph 60.', { exact: false })).toHaveCount(1);
    } finally {
      await request.delete('/__docs/merge-flow');
      await settle();
    }
  });

  test('?record= opens on a given row', async ({ page }) => {
    await openDoc(page, 'awards', '?record=3');
    await expect(viewer(page).getByText('Alex Wang')).toBeVisible();
  });
});

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { devScratchDir, openDoc, readDocSource, viewer, writeDocSource } from './helpers.ts';

// The scratch project sits inside this repository, ignored by it; a repository
// of its own makes the document's history what the panel compares against.
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: devScratchDir,
    stdio: 'pipe',
  });

test.describe('changes since the last commit', () => {
  let original: string;

  test.beforeAll(async () => {
    await fs.writeFile(path.join(devScratchDir, '.gitignore'), 'node_modules\nout\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'base');
  });

  test.afterAll(async () => {
    await fs.rm(path.join(devScratchDir, '.git'), { recursive: true, force: true });
    await fs.rm(path.join(devScratchDir, '.gitignore'), { force: true });
  });

  test.beforeEach(async () => {
    original = await readDocSource('edit-target');
  });

  test.afterEach(async () => {
    await writeDocSource('edit-target', original);
  });

  test('an edit made outside the viewer is marked on the page and listed', async ({ page }) => {
    await writeDocSource(
      'edit-target',
      original
        .replace('<p>Editable paragraph</p>', '<p>Rewritten paragraph</p>')
        .replace(
          '<p>Second paragraph stays put</p>',
          '<p>Second paragraph stays put</p>\n    <p>Brand new paragraph</p>',
        ),
    );
    await openDoc(page, 'edit-target');

    const toggle = page.getByRole('button', { name: 'Changes (2)' });
    await expect(toggle).toBeVisible();
    await toggle.click();

    const panel = page.getByRole('complementary', { name: 'Changes' });
    await expect(panel.getByRole('listitem')).toHaveCount(2);
    await expect(panel).toContainText('Editable paragraph');
    await expect(panel).toContainText('Brand new paragraph');
    await expect(page.getByRole('button', { name: 'Page 1, changed' })).toBeVisible();

    await panel.getByRole('button', { name: /Brand new paragraph/ }).click();
    await expect(viewer(page).getByText('Brand new paragraph')).toBeInViewport();
  });

  test('one change is reverted in source and the rest stay', async ({ page }) => {
    await writeDocSource(
      'edit-target',
      original
        .replace('<p>Editable paragraph</p>', '<p>Rewritten paragraph</p>')
        .replace(
          '<p>Second paragraph stays put</p>',
          '<p>Second paragraph stays put</p>\n    <p>Brand new paragraph</p>',
        ),
    );
    await openDoc(page, 'edit-target');
    await page.getByRole('button', { name: 'Changes (2)' }).click();

    const panel = page.getByRole('complementary', { name: 'Changes' });
    await panel
      .getByRole('listitem')
      .filter({ hasText: 'Brand new paragraph' })
      .getByRole('button', { name: 'Revert this change' })
      .click();

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .not.toContain('Brand new paragraph');
    expect(await readDocSource('edit-target')).toContain('<p>Rewritten paragraph</p>');
    await expect(panel.getByRole('listitem')).toHaveCount(1);
  });

  test('nothing changed reads as no changes', async ({ page }) => {
    await openDoc(page, 'edit-target');
    await page.getByRole('button', { name: 'Changes', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Changes' })).toContainText('No changes');
  });
});

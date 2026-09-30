import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  prepareScratchProject,
  runCli,
  startCliServer,
  stopServer,
  waitForHttpOk,
} from './helpers.ts';

test.describe('static build and preview', () => {
  const port = 43219;
  const baseUrl = `http://127.0.0.1:${port}`;
  let projectDir: string;
  let preview: ChildProcess | undefined;

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    projectDir = prepareScratchProject('build');
    const res = await runCli(['build'], projectDir);
    expect(res.code, res.stderr).toBe(0);
    preview = startCliServer(
      ['preview', '--host', '127.0.0.1', '--port', String(port)],
      projectDir,
    );
    await waitForHttpOk(`${baseUrl}/`);
  });

  test.afterAll(async () => {
    if (preview) await stopServer(preview);
  });

  test('emits a single-page bundle with per-document chunks', async () => {
    const dist = path.join(projectDir, 'dist');
    const entries = await fs.readdir(dist);
    expect(entries.filter((name) => name.endsWith('.html'))).toEqual(['index.html']);

    const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    expect(html).toContain('<div id="root"></div>');

    // Each document is lazily imported, so the build code-splits into at least
    // one chunk per document plus the entry chunk. Chunk filenames are the
    // bundler's business — assert the split happened, not the naming.
    const docCount = 4;
    const assets = await fs.readdir(path.join(dist, 'assets'));
    expect(assets.filter((name) => name.endsWith('.js')).length).toBeGreaterThanOrEqual(
      docCount + 1,
    );
  });

  test('the preview server serves the document browser', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await expect(page.getByRole('link', { name: 'Alpha Report', exact: true })).toBeVisible();
  });

  test('a built document renders its sheets', async ({ page }) => {
    await page.goto(`${baseUrl}/d/alpha`);
    await expect(page.locator('[data-od-viewer] [data-od-page]')).toHaveCount(3, {
      timeout: 30_000,
    });
    await expect(page.locator('[data-od-viewer]').getByText('Alpha page one')).toBeVisible();
  });

  test('a built flow document is paginated the same way as in dev', async ({ page }) => {
    await page.goto(`${baseUrl}/d/flow-report`);
    const sheets = page.locator('[data-od-viewer] [data-od-page]');
    await expect.poll(async () => await sheets.count(), { timeout: 30_000 }).toBeGreaterThan(2);
    await expect(
      page.locator('[data-od-viewer]').getByText('Flow paragraph 40.', { exact: false }),
    ).toHaveCount(1);
  });

  test('the dev-only endpoints are gone from the static build', async ({ request }) => {
    // A static host answers an unknown path with the SPA shell, so the tell is
    // the content type: HTML back means no API is mounted there.
    for (const route of ['/__folders', '/__design?docId=alpha', '/__assets/@global']) {
      const res = await request.get(`${baseUrl}${route}`);
      expect(res.headers()['content-type'] ?? '', route).toContain('text/html');
    }

    const mutation = await request.delete(`${baseUrl}/__docs/alpha`);
    expect(mutation.headers()['content-type'] ?? '').not.toContain('application/json');
  });

  test('edit mode and the design panel are not shipped', async ({ page }) => {
    await page.goto(`${baseUrl}/d/alpha`);
    await expect(page.locator('[data-od-viewer]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Design' })).toHaveCount(0);
  });
});

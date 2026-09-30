import { expect, test } from '@playwright/test';
import { deleteDoc, duplicateDoc, openDoc, refreshDocsModule, writeDocSource } from './helpers.ts';

const SOURCE = `import type { DocMeta, DocPage } from '@open-document/core';

export const meta: DocMeta = { title: 'Paper styles', createdAt: '2026-01-03T00:00:00.000Z' };

const sheet = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box' as const,
  padding: 76,
  background: '#ffffff',
  color: '#16181d',
  fontSize: 14,
};

const Only: DocPage = () => (
  <div style={sheet}>
    <ul data-probe="bullets">
      <li>
        First
        <ul data-probe="nested">
          <li>Nested</li>
        </ul>
      </li>
    </ul>
    <ol data-probe="numbers">
      <li>One</li>
    </ol>
    <ul data-probe="plain" style={{ listStyle: 'none', paddingLeft: 0 }}>
      <li>Plain</li>
    </ul>
    <svg width="120" height="40" role="img" aria-label="band">
      <defs>
        <linearGradient id="fade">
          <stop offset="0" stopColor="#ff0000" />
          <stop offset="1" stopColor="#0000ff" />
        </linearGradient>
      </defs>
      <rect data-probe="band" width="120" height="40" fill="url(#fade)" />
    </svg>
  </div>
);

export default [Only] satisfies DocPage[];
`;

const READY = 'globalThis.__openDoc ? globalThis.__openDoc.status().ready : false';

test.describe('the sheet as paper', () => {
  test.beforeEach(async ({ request }) => {
    await duplicateDoc(request, 'alpha', 'paper-styles');
    await writeDocSource('paper-styles', SOURCE);
    await refreshDocsModule('paper-styles');
  });

  test.afterEach(async ({ page, request }) => {
    const reloaded = page.waitForEvent('load', { timeout: 15_000 }).catch(() => {});
    await deleteDoc(request, 'paper-styles');
    await reloaded;
  });

  test('a plain list keeps its markers and indent, and a styled one keeps its own', async ({
    page,
  }) => {
    await openDoc(page, 'paper-styles');
    const sheet = page.locator('[data-od-viewer] [data-od-page]').first();
    const style = (probe: string) =>
      sheet.locator(`[data-probe="${probe}"]`).evaluate((el) => {
        const computed = getComputedStyle(el);
        return { list: computed.listStyleType, indent: computed.paddingInlineStart };
      });

    expect(await style('bullets')).toEqual({ list: 'disc', indent: '21px' });
    expect((await style('nested')).list).toBe('circle');
    expect((await style('numbers')).list).toBe('decimal');
    expect(await style('plain')).toEqual({ list: 'none', indent: '0px' });
  });

  test('the print copy draws its gradients from its own defs, not the hidden viewer’s', async ({
    page,
  }) => {
    await openDoc(page, 'paper-styles');
    await page.waitForFunction(READY, undefined, { timeout: 15_000 });
    await page.evaluate('globalThis.__openDoc.preparePrint()');
    try {
      const resolved = await page.evaluate(() => {
        const band = document.querySelector('#od-print-root [data-probe="band"]');
        const id = /url\(#([^)]+)\)/.exec(band?.getAttribute('fill') ?? '')?.[1] ?? '';
        const target = document.getElementById(id);
        return {
          renamed: id !== 'fade',
          sameCopy:
            Boolean(target) &&
            target?.closest('[data-od-page]') === band?.closest('[data-od-page]'),
        };
      });
      expect(resolved).toEqual({ renamed: true, sameCopy: true });
    } finally {
      await page.evaluate('globalThis.__openDoc.releasePrint()');
    }
  });
});

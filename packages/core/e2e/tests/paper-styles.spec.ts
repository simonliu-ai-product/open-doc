import { expect, test } from '@playwright/test';
import { deleteDoc, duplicateDoc, openDoc, refreshDocsModule, writeDocSource } from './helpers.ts';

const SOURCE = `import { type DesignSystem, type DocMeta, type DocPage, defaultDesign } from '@open-document/core';

export const meta: DocMeta = { title: 'Paper styles', createdAt: '2026-01-03T00:00:00.000Z' };

export const design: DesignSystem = {
  ...defaultDesign,
  palette: { ...defaultDesign.palette, accent: '#c2410c', rule: '#d1d5db' },
  fonts: { ...defaultDesign.fonts, mono: '"Courier New", monospace' },
  typeScale: { ...defaultDesign.typeScale, h2: 22 },
};

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
    <h2 data-probe="heading">A bare heading</h2>
    <p data-probe="para">
      A <a data-probe="link" href="https://example.com">link</a> and <code data-probe="code">code</code>.
    </p>
    <blockquote data-probe="quote">A quote.</blockquote>
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

  test('bare elements take the document’s design instead of printing as body text', async ({
    page,
  }) => {
    await openDoc(page, 'paper-styles');
    const sheet = page.locator('[data-od-viewer] [data-od-page]').first();
    const read = (probe: string, props: string[]) =>
      sheet.locator(`[data-probe="${probe}"]`).evaluate((el, names) => {
        const computed = getComputedStyle(el);
        return Object.fromEntries(names.map((name) => [name, computed.getPropertyValue(name)]));
      }, props);

    expect(await read('heading', ['font-size', 'font-weight', 'margin-bottom'])).toEqual({
      'font-size': '22px',
      'font-weight': '700',
      'margin-bottom': '11px',
    });
    expect(await read('para', ['margin-bottom'])).toEqual({ 'margin-bottom': '10.5px' });
    expect(await read('link', ['color', 'text-decoration-line'])).toEqual({
      color: 'rgb(194, 65, 12)',
      'text-decoration-line': 'underline',
    });
    expect((await read('code', ['font-family']))['font-family']).toMatch(/^"Courier New"/);
    expect(await read('quote', ['border-left-color', 'border-left-width'])).toEqual({
      'border-left-color': 'rgb(209, 213, 219)',
      'border-left-width': '3px',
    });
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

import { expect, test } from '@playwright/test';
import { deleteDoc, duplicateDoc, openDoc, refreshDocsModule, writeDocSource } from './helpers.ts';

type Finding = { page: number; rule: string; severity: string; loc?: string };
type Report = { pageCount: number; findings: Finding[] };

const FAULTY = `import { type DocMeta, type DocPage, Ref } from '@open-document/core';

export const meta: DocMeta = { title: 'Layout faults', createdAt: '2026-01-03T00:00:00.000Z' };

const sheet = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box' as const,
  padding: 76,
  background: '#ffffff',
  color: '#16181d',
  fontSize: 14,
};

const Overflowing: DocPage = () => (
  <div style={sheet}>
    {Array.from({ length: 70 }, (_, i) => (
      <p key={i}>Line {i + 1} of a page nobody measured.</p>
    ))}
  </div>
);

const Blank: DocPage = () => <div style={sheet} />;

const Small: DocPage = () => (
  <div style={sheet}>
    <p style={{ fontSize: 5 }}>Unreadable in print.</p>
    <p>
      See <Ref to="nothing-declares-this" />.
    </p>
  </div>
);

export default [Overflowing, Blank, Small] satisfies DocPage[];
`;

const READY = 'globalThis.__openDoc ? globalThis.__openDoc.status().ready : false';

/**
 * The bridge the headless exporter and `check_layout` drive. Other specs write
 * to the shared fixture, and the reload that broadcasts tears down the context
 * mid-call — so wait for the bridge to come back and ask again.
 */
async function diagnose(page: import('@playwright/test').Page): Promise<Report> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(READY, undefined, { timeout: 15_000 });
      return (await page.evaluate('globalThis.__openDoc.diagnose()')) as Report;
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

test.describe('layout diagnostics', () => {
  test('a well-formed document reports nothing', async ({ page }) => {
    await openDoc(page, 'alpha');
    const report = await diagnose(page);
    expect(report.pageCount).toBe(3);
    expect(report.findings).toEqual([]);
  });

  test('the bridge only reports ready once the flow packer has run', async ({ page }) => {
    await openDoc(page, 'flow-report');
    await page.waitForFunction(READY, undefined, { timeout: 15_000 });
    const status = await page.evaluate('globalThis.__openDoc.status()');
    // A flow section that had not been measured would come back as one page.
    expect((status as { ready: boolean; pageCount: number }).ready).toBe(true);
    expect((status as { pageCount: number }).pageCount).toBeGreaterThan(1);
  });

  test('clipped content, a blank sheet, and unreadable type are all caught', async ({
    page,
    request,
  }) => {
    await duplicateDoc(request, 'alpha', 'layout-faults');
    await writeDocSource('layout-faults', FAULTY);
    await refreshDocsModule('layout-faults');

    try {
      await openDoc(page, 'layout-faults');
      const report = await diagnose(page);
      const rules = report.findings.map((finding) => finding.rule);

      expect(rules).toContain('page-overflow');
      expect(rules).toContain('blank-page');
      expect(rules).toContain('tiny-text');
      expect(rules).toContain('unresolved-ref');

      const overflow = report.findings.find((finding) => finding.rule === 'page-overflow');
      expect(overflow?.page).toBe(1);
      expect(overflow?.severity).toBe('error');
      // The inspector's source tag is what makes a finding actionable.
      expect(overflow?.loc).toMatch(/^\d+:\d+$/);
    } finally {
      await deleteDoc(request, 'layout-faults');
    }
  });
});

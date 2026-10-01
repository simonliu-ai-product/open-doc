import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractMeta, generateDocsModule } from './open-doc-plugin.ts';

const DOCS_ROOT = path.resolve('/tmp/open-doc-fixture/docs');

function entry(id: string): string {
  return path.join(DOCS_ROOT, id, 'index.tsx');
}

describe('extractMeta', () => {
  it('reads the literals out of the meta export', () => {
    const src = `export const meta: DocMeta = {
  title: 'Q3 report',
  theme: 'corporate-neutral',
  createdAt: '2026-08-15T13:44:40.268Z',
};`;
    expect(extractMeta(src)).toEqual({
      theme: 'corporate-neutral',
      createdAt: '2026-08-15T13:44:40.268Z',
      title: 'Q3 report',
    });
  });

  it('reads a title with quotes and CJK, and skips the subtitle', () => {
    const src = `export const meta = {
  subtitle: 'Not this one',
  title: "It's 平台 \\"Q3\\"",
};`;
    expect(extractMeta(src).title).toBe('It\'s 平台 "Q3"');
  });

  it('returns nulls when there is no meta export', () => {
    expect(extractMeta('export default [];')).toEqual({
      theme: null,
      createdAt: null,
      title: null,
    });
  });

  it('ignores fields that live outside the meta braces', () => {
    const src = `const other = { createdAt: '2020-01-01T00:00:00Z', theme: 'nope' };
export const meta = { title: 'No date' };`;
    expect(extractMeta(src)).toEqual({ theme: null, createdAt: null, title: 'No date' });
  });
});

describe('generateDocsModule', () => {
  it('lists valid ids and drops folders with an unusable id', async () => {
    const { code, ignored } = await generateDocsModule(
      [entry('q3-report'), entry('spaced name'), entry('_leading')],
      DOCS_ROOT,
      false,
    );
    expect(code).toContain('export const docIds = ["q3-report"]');
    expect(ignored).toEqual(['spaced name', '_leading']);
  });

  it('emits a cache-busting import token per doc in dev', async () => {
    const { code } = await generateDocsModule([entry('q3-report')], DOCS_ROOT, true);
    expect(code).toContain('docImportTokens');
    expect(code).toContain('open-doc:doc-changed');
  });

  it('emits plain static imports for the production build', async () => {
    const { code } = await generateDocsModule([entry('q3-report')], DOCS_ROOT, false);
    expect(code).not.toContain('docImportTokens');
    expect(code).toContain(`case "q3-report": return import(`);
  });
});

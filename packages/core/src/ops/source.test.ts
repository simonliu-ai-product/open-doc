import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeContext } from '../vite/routes/context.ts';
import { createDocument, OpsError, readDocument } from './documents.ts';
import { editDocument, outlineDocument, readDocumentLines, searchDocument } from './source.ts';

const DOC = `import type { DocPage } from '@open-document/core';

export const design = { palette: { bg: '#fff', text: '#111' } };

const Cover: DocPage = () => (
  <section style={{ background: '#fff' }}>
    <h1 style={{ margin: 0 }}>
      Quarterly
      <br />
      review
    </h1>
  </section>
);

const Body: DocPage = () => (
  <section>
    <h2>1. 摘要</h2>
    <p>Ship the beta in May.</p>
  </section>
);

export default [Cover, Body];
export const meta = { title: 'Q4' };
`;

let dir: string;
let ctx: ReturnType<typeof makeContext>;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-source-'));
  await fs.mkdir(path.join(dir, 'docs'));
  ctx = makeContext({ userCwd: dir, docsDir: 'docs', coreVersion: '0.0.0' });
  await createDocument(ctx, 'q4', DOC);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('outlineDocument', () => {
  it('lists blocks with line ranges and headings as a reader sees them', async () => {
    const o = await outlineDocument(ctx, 'q4');
    expect(o.totalLines).toBe(DOC.split('\n').length);
    expect(o.blocks.map((b) => [b.name, b.lines])).toEqual([
      ['design', [3, 3]],
      ['Cover', [5, 13]],
      ['Body', [15, 20]],
      ['default', [22, 22]],
      ['meta', [23, 23]],
    ]);
    expect(o.headings).toEqual([
      { level: 1, text: 'Quarterly review', line: 7 },
      { level: 2, text: '1. 摘要', line: 17 },
    ]);
    expect(o.hash).toBe((await readDocument(ctx, 'q4')).hash);
  });
});

describe('readDocumentLines', () => {
  it('returns exactly the lines asked for', async () => {
    const r = await readDocumentLines(ctx, 'q4', 15, 20);
    expect(r.lines).toEqual([15, 20]);
    expect(r.text).toBe(DOC.split('\n').slice(14, 20).join('\n'));
  });
  it('refuses a range outside the document', async () => {
    await expect(readDocumentLines(ctx, 'q4', 100, 120)).rejects.toBeInstanceOf(OpsError);
  });
});

describe('searchDocument', () => {
  it('finds every line with the text', async () => {
    const r = await searchDocument(ctx, 'q4', "'#fff'");
    expect(r.total).toBe(2);
    expect(r.matches.map((m) => m.line)).toEqual([3, 6]);
  });
});

describe('editDocument', () => {
  it('replaces text that occurs once', async () => {
    const r = await editDocument(ctx, 'q4', 'Ship the beta in May.', '五月推出測試版。');
    expect(r.replaced).toBe(1);
    expect((await readDocument(ctx, 'q4')).source).toContain('五月推出測試版。');
  });
  it('refuses ambiguous text unless all is set', async () => {
    await expect(editDocument(ctx, 'q4', "'#fff'", "'#111'")).rejects.toMatchObject({
      status: 409,
    });
    const r = await editDocument(ctx, 'q4', "'#fff'", "'#111'", { all: true });
    expect(r.replaced).toBe(2);
    expect((await readDocument(ctx, 'q4')).source).not.toContain("'#fff'");
  });
  it('refuses text that is not there, and a stale hash', async () => {
    await expect(editDocument(ctx, 'q4', 'nope', 'x')).rejects.toMatchObject({ status: 404 });
    await expect(
      editDocument(ctx, 'q4', 'Q4', 'Q1', { expectedHash: '0000000000000000' }),
    ).rejects.toBeInstanceOf(OpsError);
  });
});

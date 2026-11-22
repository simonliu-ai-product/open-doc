import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeContext } from '../vite/routes/context.ts';
import { OpsError } from './documents.ts';
import { markTranslated, translationStatus } from './translations.ts';

let root: string;
const ctx = () => makeContext({ userCwd: root, coreVersion: '0.0.0' });
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const doc = (meta: string, body = 'Hello') =>
  `export const meta = { ${meta} };\nexport default [() => <p>${body}</p>];\n`;

async function write(id: string, source: string): Promise<void> {
  await fs.mkdir(path.join(root, 'docs', id), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', id, 'index.tsx'), source);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-translations-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  await write('report', doc("title: 'Report', lang: 'en'"));
  await write(
    'report-zh',
    doc("title: '報告', lang: 'zh-Hant-TW', translationOf: 'report'", '你好'),
  );
  await write('other', doc("title: 'Other'"));
  git('add', '.');
  git('commit', '-qm', 'first');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('translationStatus', () => {
  it('lists only documents that declare translationOf, unsynced until marked', async () => {
    const list = await translationStatus(ctx());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'report-zh',
      of: 'report',
      lang: 'zh-Hant-TW',
      sourceLang: 'en',
      state: 'unsynced',
    });
  });

  it('is current after marking, and stale with the commits and files once the source moves', async () => {
    const marked = await markTranslated(ctx(), 'report-zh');
    expect(marked.translatedAt).toBe(git('rev-parse', 'HEAD').trim());
    git('commit', '-qam', 'mark');
    expect((await translationStatus(ctx()))[0].state).toBe('current');

    await write('report', doc("title: 'Report', lang: 'en'", 'Hello again'));
    git('commit', '-qam', 'Reword the greeting');
    await fs.writeFile(path.join(root, 'docs', 'report', 'notes.md'), 'new\n');

    const [status] = await translationStatus(ctx(), { docId: 'report-zh', diff: true });
    expect(status.state).toBe('stale');
    expect(status.changedFiles).toEqual(['docs/report/index.tsx', 'docs/report/notes.md']);
    expect(status.commits.map((c) => c.subject)).toEqual(['Reword the greeting']);
    expect(status.diff).toContain('+export default [() => <p>Hello again</p>];');
    expect(status.diff).toContain('+++ b/docs/report/notes.md');
  });

  it('ignores changes to the translation itself', async () => {
    await markTranslated(ctx(), 'report-zh');
    git('commit', '-qam', 'mark');
    const file = path.join(root, 'docs', 'report-zh', 'index.tsx');
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('你好', '改了'));
    expect((await translationStatus(ctx()))[0].state).toBe('current');
  });

  it('reports a source that does not exist and a revision git does not know', async () => {
    await write('lost-zh', doc("translationOf: 'lost'"));
    await write('odd-zh', doc("translationOf: 'report', translatedAt: 'deadbeef'"));
    const byId = Object.fromEntries((await translationStatus(ctx())).map((t) => [t.id, t.state]));
    expect(byId).toMatchObject({ 'lost-zh': 'missing-source', 'odd-zh': 'unknown-revision' });
  });
});

describe('markTranslated', () => {
  it('refuses while the source has uncommitted changes', async () => {
    await write('report', doc("title: 'Report'", 'Unsaved'));
    await expect(markTranslated(ctx(), 'report-zh')).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a document that is not a translation', async () => {
    await expect(markTranslated(ctx(), 'other')).rejects.toBeInstanceOf(OpsError);
  });
});

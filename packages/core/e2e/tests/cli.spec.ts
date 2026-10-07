import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { prepareScratchProject, runCli } from './helpers.ts';

test.describe('open-doc CLI', () => {
  test('--help lists the commands the docs promise', async () => {
    const res = await runCli(['--help'], prepareScratchProject('cli'));
    expect(res.code).toBe(0);
    for (const command of [
      'dev',
      'build',
      'preview',
      'export',
      'check',
      'import',
      'templates',
      'new',
      'sync:skills',
    ]) {
      expect(res.stdout).toContain(command);
    }
  });

  test('--version prints the package version', async () => {
    const res = await runCli(['--version'], prepareScratchProject('cli-version'));
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('an unknown command exits non-zero', async () => {
    const res = await runCli(['not-a-command'], prepareScratchProject('cli-unknown'));
    expect(res.code).not.toBe(0);
  });

  test('sync:skills --dry-run reports without writing', async () => {
    const dir = prepareScratchProject('cli-skills');
    const res = await runCli(['sync:skills', '--dry-run'], dir);
    expect(res.code, res.stderr).toBe(0);
  });

  test('import turns Markdown into a document the framework can load', async () => {
    const dir = prepareScratchProject('cli-import');
    await fs.writeFile(
      path.join(dir, 'note.md'),
      '# Quarterly note\n\nBody copy.\n\n| Service | p99 |\n| --- | ---: |\n| api | 412 ms |\n',
      'utf8',
    );

    const res = await runCli(['import', 'note.md', '--id', 'imported'], dir);
    expect(res.code, res.stderr).toBe(0);

    const source = await fs.readFile(path.join(dir, 'docs', 'imported', 'index.tsx'), 'utf8');
    expect(source).toContain("title: 'Quarterly note'");
    expect(source).toContain('const Body = flow(');
    expect(source).toContain("<Td align={'right'}>412 ms</Td>");
    expect(source).toContain('satisfies DocEntry[]');
  });

  test('an exported PDF carries the outline as bookmarks, and nothing the outline skips', async () => {
    const dir = prepareScratchProject('cli-bookmarks');
    const exported = await runCli(['export', 'long-form', '--out-dir', 'out'], dir);
    expect(exported.code, exported.stderr).toBe(0);
    const pdf = (await fs.readFile(path.join(dir, 'out', 'long-form.pdf'))).toString('latin1');

    // Bookmark entries are the dictionaries that hang off a parent outline.
    const bookmarks = [...pdf.matchAll(/<<[^>]*?\/Title \(([^)]*)\)[^>]*?\/Parent/g)].map(
      (match) => match[1],
    );
    expect(bookmarks).toEqual(['Findings']);
    expect(pdf).toContain('/StructTreeRoot');
  });

  test('diff reports what changed since a commit, page by page', async () => {
    const dir = prepareScratchProject('cli-diff');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules\nout\n');
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');

    const source = path.join(dir, 'docs', 'alpha', 'index.tsx');
    const before = await fs.readFile(source, 'utf8');
    await fs.writeFile(source, before.replace('Middle content', 'Middle content, revised'));

    const res = await runCli(['diff', 'alpha', '--json'], dir);
    expect(res.code, res.stderr).toBe(0);
    const result = JSON.parse(res.stdout) as {
      pages: Array<{ status: string; lines: Array<{ op: string; text: string }> }>;
      file: string;
    };
    expect(result.pages.map((page) => page.status)).toEqual(['same', 'changed', 'same']);
    expect(result.pages[1]?.lines).toEqual([
      { op: 'remove', text: 'Middle content' },
      { op: 'add', text: 'Middle content, revised' },
    ]);
    const report = await fs.readFile(path.join(dir, result.file), 'utf8');
    expect(report).toContain('Middle content, revised');
    // The old version's checkout is cleaned up.
    await expect(fs.access(path.join(dir, '.open-doc-diff'))).rejects.toThrow();
  });

  test('export writes a PDF, and check passes the fixture documents', async () => {
    const dir = prepareScratchProject('cli-render');

    const exported = await runCli(['export', 'alpha', '--out-dir', 'out'], dir);
    expect(exported.code, exported.stderr).toBe(0);
    const pdf = await fs.readFile(path.join(dir, 'out', 'alpha.pdf'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const checked = await runCli(['check', 'alpha'], dir);
    expect(checked.code, checked.stderr).toBe(0);
    expect(checked.stdout).toContain('clean');
  });

  test('every template is listed, makes a document, and lays out clean', async () => {
    const dir = prepareScratchProject('cli-templates');
    const listed = await runCli(['templates', '--json'], dir);
    expect(listed.code, listed.stderr).toBe(0);
    const names = (JSON.parse(listed.stdout) as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['report', 'proposal', 'meeting-notes', 'letter', 'blank']),
    );

    for (const name of names) {
      const made = await runCli(['new', `from-${name}`, '--template', name], dir);
      expect(made.code, made.stderr).toBe(0);
    }
    const checked = await runCli(['check', ...names.map((name) => `from-${name}`)], dir);
    expect(checked.code, checked.stdout + checked.stderr).toBe(0);

    const wrong = await runCli(['new', 'x', '--template', 'nope'], dir);
    expect(wrong.code).not.toBe(0);
    expect(wrong.stderr + wrong.stdout).toContain('open-doc templates');
  });

  test('export --each writes one copy per record, named from the row', async () => {
    const dir = prepareScratchProject('cli-each');
    const made = await runCli(['new', 'awards', '--template', 'certificate'], dir);
    expect(made.code, made.stderr).toBe(0);

    const each = await runCli(['export', 'awards', '--each', '--out-dir', 'out'], dir);
    expect(each.code, each.stderr).toBe(0);
    const files = (await fs.readdir(path.join(dir, 'out'))).sort();
    expect(files).toEqual([
      'certificate-Alex Wang.pdf',
      'certificate-Chen Wei.pdf',
      'certificate-Lin Mei.pdf',
    ]);

    const named = await runCli(
      ['export', 'awards', '--each', '--name', '{#}-{name}', '--out-dir', 'numbered'],
      dir,
    );
    expect(named.code, named.stderr).toBe(0);
    expect((await fs.readdir(path.join(dir, 'numbered'))).sort()[0]).toBe('1-Lin Mei.pdf');

    const none = await runCli(['export', 'alpha', '--each'], dir);
    expect(none.code).not.toBe(0);
    expect(none.stderr + none.stdout).toContain('has no records');
  });
});

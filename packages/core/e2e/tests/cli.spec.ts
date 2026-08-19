import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { prepareScratchProject, runCli } from './helpers.ts';

test.describe('open-doc CLI', () => {
  test('--help lists the commands the docs promise', async () => {
    const res = await runCli(['--help'], prepareScratchProject('cli'));
    expect(res.code).toBe(0);
    for (const command of ['dev', 'build', 'preview', 'export', 'check', 'import', 'sync:skills']) {
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
});

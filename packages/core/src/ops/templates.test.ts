import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeContext } from '../vite/routes/context.ts';
import { OpsError } from './documents.ts';
import { createFromTemplate, listTemplates, suggestDocId } from './templates.ts';

let root: string;
const ctx = () => makeContext({ userCwd: root, coreVersion: '0.0.0' });

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-templates-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('listTemplates', () => {
  it('lists the built-in templates by name, blank last', async () => {
    const names = (await listTemplates(ctx())).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['report', 'proposal', 'meeting-notes', 'letter']),
    );
    expect(names.at(-1)).toBe('blank');
  });

  it("lets the workspace's own template win on a shared name", async () => {
    const dir = path.join(root, 'templates', 'report');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.tsx'), 'export default [];\n');
    await fs.writeFile(
      path.join(dir, 'template.json'),
      JSON.stringify({ title: 'Our report', description: 'House style' }),
    );
    const report = (await listTemplates(ctx())).find((t) => t.name === 'report');
    expect(report).toMatchObject({ title: 'Our report', source: 'workspace' });
  });
});

describe('createFromTemplate', () => {
  it('copies the folder without the manifest, retitled and dated today', async () => {
    const result = await createFromTemplate(ctx(), { template: 'report', title: 'Q3 review' });
    expect(result.id).toBe('q3-review');
    const dir = path.join(root, 'docs', 'q3-review');
    const files = await fs.readdir(dir);
    expect(files).toEqual(expect.arrayContaining(['index.tsx', 'data']));
    expect(files).not.toContain('template.json');
    const source = await fs.readFile(path.join(dir, 'index.tsx'), 'utf8');
    expect(source).toContain(`title: 'Q3 review'`);
    // Printed on the cover and in the running header, not only in meta.
    expect(source).not.toContain('Annual report');
    expect(source.split('Q3 review').length - 1).toBeGreaterThanOrEqual(3);
    expect(source).not.toContain('2026-01-01T00:00:00.000Z');
  });

  it('takes an id from the template when the title has no letters to make one', async () => {
    expect(suggestDocId(['季度報告', 'report'], new Set(['report']))).toBe('report-2');
  });

  it('names the command that lists templates when the name is wrong', async () => {
    await expect(createFromTemplate(ctx(), { template: 'nope' })).rejects.toThrow(
      /open-doc templates/,
    );
  });

  it('refuses an id that is taken', async () => {
    await fs.mkdir(path.join(root, 'docs', 'taken'));
    await fs.writeFile(path.join(root, 'docs', 'taken', 'index.tsx'), 'export default [];\n');
    await expect(
      createFromTemplate(ctx(), { template: 'blank', docId: 'taken' }),
    ).rejects.toBeInstanceOf(OpsError);
  });
});

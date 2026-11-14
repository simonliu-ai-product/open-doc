import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectUploads,
  decideWrites,
  hashBytes,
  INLINE_FILE_LIMIT,
  readTar,
  snapshotRel,
} from './sandbox-sync.ts';

const enc = new TextEncoder();

function header(name: string, size: number, type: string): Uint8Array {
  const block = new Uint8Array(512);
  block.set(enc.encode(name.slice(0, 100)), 0);
  block.set(enc.encode(`${size.toString(8).padStart(11, '0')}\0`), 124);
  block[156] = type.charCodeAt(0);
  block.set(enc.encode('ustar\0'), 257);
  return block;
}

function tar(entries: { name: string; body?: string; type?: string }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const { name, body = '', type = '0' } of entries) {
    const data = enc.encode(body);
    parts.push(header(name, data.length, type));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    parts.push(padded);
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let len = body.length + 1;
  while (`${len}${body}`.length !== len) len = `${len}${body}`.length;
  return `${len}${body}`;
}

describe('readTar', () => {
  it('reads regular files and skips directories', () => {
    const entries = readTar(
      tar([
        { name: './workspace/docs/a/', type: '5' },
        { name: './workspace/docs/a/index.tsx', body: 'export default 1;\n' },
      ]),
    );
    expect(entries.map((e) => e.path)).toEqual(['./workspace/docs/a/index.tsx']);
    expect(new TextDecoder().decode(entries[0].data)).toBe('export default 1;\n');
  });

  it('takes the path from a pax header', () => {
    const long = `./workspace/docs/a/${'x'.repeat(120)}.tsx`;
    const entries = readTar(
      tar([
        { name: 'PaxHeader', type: 'x', body: paxRecord('path', long) },
        { name: 'truncated', body: 'hi' },
      ]),
    );
    expect(entries.map((e) => e.path)).toEqual([long]);
  });
});

describe('snapshotRel', () => {
  it('keeps paths inside the writable folder', () => {
    expect(snapshotRel('./workspace/docs/a/index.tsx', 'docs/a')).toBe('docs/a/index.tsx');
    expect(snapshotRel('/workspace/docs/a/parts/x.tsx', 'docs/a')).toBe('docs/a/parts/x.tsx');
  });

  it('drops paths outside it, including traversal', () => {
    expect(snapshotRel('./workspace/docs/b/index.tsx', 'docs/a')).toBeNull();
    expect(snapshotRel('./workspace/docs/ab/index.tsx', 'docs/a')).toBeNull();
    expect(snapshotRel('./workspace/docs/a/../../etc/passwd', 'docs/a')).toBeNull();
    expect(snapshotRel('./etc/passwd', 'docs/a')).toBeNull();
    expect(snapshotRel('./workspace/.agents/skills/x/SKILL.md', 'docs/a')).toBeNull();
  });
});

describe('decideWrites', () => {
  const data = (s: string) => enc.encode(s);
  const h = (s: string) => hashBytes(data(s));

  it('skips files the agent did not change', () => {
    const uploaded = new Map([['docs/a/index.tsx', h('v1')]]);
    const local = new Map([['docs/a/index.tsx', h('v1')]]);
    expect(decideWrites([{ rel: 'docs/a/index.tsx', data: data('v1') }], uploaded, local)).toEqual(
      [],
    );
  });

  it('writes changed and new files when the local copy did not move', () => {
    const uploaded = new Map([['docs/a/index.tsx', h('v1')]]);
    const local = new Map([['docs/a/index.tsx', h('v1')]]);
    const decisions = decideWrites(
      [
        { rel: 'docs/a/index.tsx', data: data('v2') },
        { rel: 'docs/a/new.tsx', data: data('n') },
      ],
      uploaded,
      local,
    );
    expect(decisions.map((d) => [d.rel, d.action])).toEqual([
      ['docs/a/index.tsx', 'write'],
      ['docs/a/new.tsx', 'write'],
    ]);
  });

  it('reports a conflict when the file changed locally during the turn', () => {
    const uploaded = new Map([['docs/a/index.tsx', h('v1')]]);
    const local = new Map([
      ['docs/a/index.tsx', h('mine')],
      ['docs/a/new.tsx', h('also mine')],
    ]);
    const decisions = decideWrites(
      [
        { rel: 'docs/a/index.tsx', data: data('agent') },
        { rel: 'docs/a/new.tsx', data: data('agent') },
      ],
      uploaded,
      local,
    );
    expect(decisions.map((d) => d.action)).toEqual(['conflict', 'conflict']);
  });
});

describe('collectUploads', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'open-doc-sync-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uploads text, skips binary and keeps under the total budget', async () => {
    const doc = path.join(dir, 'docs', 'a');
    await mkdir(path.join(doc, 'node_modules'), { recursive: true });
    await writeFile(path.join(doc, 'index.tsx'), 'export default [];\n');
    await writeFile(path.join(doc, 'logo.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]));
    await writeFile(path.join(doc, 'node_modules', 'x.js'), 'ignored');
    const skills = path.join(dir, '.agents', 'skills', 'big');
    await mkdir(skills, { recursive: true });
    await writeFile(path.join(skills, 'a.md'), 'a'.repeat(INLINE_FILE_LIMIT - 10));
    await writeFile(path.join(skills, 'b.md'), 'b'.repeat(INLINE_FILE_LIMIT - 10));
    await writeFile(path.join(skills, 'c.md'), 'c'.repeat(500));
    await writeFile(path.join(skills, 'd.md'), 'd'.repeat(INLINE_FILE_LIMIT + 1));

    const plan = await collectUploads(dir, [doc, path.join(dir, '.agents', 'skills')]);
    expect(plan.files.map((f) => f.rel)).toEqual([
      'docs/a/index.tsx',
      '.agents/skills/big/a.md',
      '.agents/skills/big/b.md',
    ]);
    expect(plan.skipped).toEqual([
      'docs/a/logo.png',
      '.agents/skills/big/c.md',
      '.agents/skills/big/d.md',
    ]);
  });
});

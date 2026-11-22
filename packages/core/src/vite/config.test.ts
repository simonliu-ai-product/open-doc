import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Alias } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { createViteConfig } from './config.ts';

const dirs: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'open-doc-config-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.OPEN_DOC_CACHE_DIR;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function aliasFor(aliases: Alias[], id: string): string | undefined {
  const hit = aliases.find((a) => (typeof a.find === 'string' ? a.find === id : a.find.test(id)));
  return hit?.replacement;
}

describe('createViteConfig in a workspace that installed nothing', () => {
  it('hands documents the running core and one react', async () => {
    const config = await createViteConfig({ userCwd: workspace(), config: {} });
    const aliases = config.resolve?.alias as Alias[];
    expect(aliasFor(aliases, '@open-document/core')).toMatch(/[\\/]dist[\\/]index\.js$/);
    expect(aliasFor(aliases, '@open-document/core/ops')).toBeUndefined();
    expect(config.resolve?.dedupe).toEqual(['react', 'react-dom']);
  });

  it('keeps the Vite cache in the workspace unless the host moves it', async () => {
    const cwd = workspace();
    const local = await createViteConfig({ userCwd: cwd, config: {} });
    expect(local.cacheDir).toBe(path.join(cwd, 'node_modules', '.vite', 'open-doc'));

    process.env.OPEN_DOC_CACHE_DIR = '/shared/cache';
    const hosted = await createViteConfig({ userCwd: cwd, config: {}, headless: true });
    expect(hosted.cacheDir).toBe(path.join('/shared/cache', 'open-doc-headless'));
  });
});

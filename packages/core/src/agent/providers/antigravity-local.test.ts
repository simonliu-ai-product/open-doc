import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderEvent } from '../provider.ts';
import { createAntigravityMapper } from './antigravity.ts';
import {
  cliPath,
  ensureEnvironment,
  ensureWorker,
  forgetEnvironment,
  installCli,
  installedCliVersion,
  localModeSupported,
  stopWorker,
} from './antigravity-local.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'open-doc-agy-local-'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

function fakeArchive(): Uint8Array {
  const block = new Uint8Array(512 * 3);
  block.set(new TextEncoder().encode('gemini-api'), 0);
  block.set(new TextEncoder().encode('00000000004\0'), 124);
  block[156] = '0'.charCodeAt(0);
  block.set(new TextEncoder().encode('evil'), 512);
  return gzipSync(new Uint8Array([...block, ...new Uint8Array(1024)]));
}

describe('installCli', () => {
  it.runIf(localModeSupported())('refuses a download whose checksum does not match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from(fakeArchive()))),
    );
    await expect(installCli(dir)).rejects.toThrow(/checksum/);
    await expect(stat(cliPath(dir))).rejects.toThrow();
    expect(await installedCliVersion(dir)).toBeNull();
  });
});

describe('ensureEnvironment', () => {
  it('creates a self-hosted environment once and keeps its key owner-only', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'env-1', environment_key: 'ek_secret', mode: 'x' }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await ensureEnvironment(dir, 'api-key');
    const second = await ensureEnvironment(dir, 'api-key');
    expect(first).toEqual({ id: 'env-1', environment_key: 'ek_secret' });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'self_hosted' });

    const file = path.join(dir, 'node_modules', '.open-doc', 'antigravity-environment.json');
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, 'utf8')).id).toBe('env-1');

    await forgetEnvironment(dir);
    await expect(stat(file)).rejects.toThrow();
  });

  it('reports a failed creation without writing anything', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 })),
    );
    await expect(ensureEnvironment(dir, 'bad')).rejects.toThrow(/403/);
    await expect(
      stat(path.join(dir, 'node_modules', '.open-doc', 'antigravity-environment.json')),
    ).rejects.toThrow();
  });
});

describe('createAntigravityMapper on this machine', () => {
  it('shows tool paths relative to the project root', () => {
    const events: ProviderEvent[] = [];
    const mapper = createAntigravityMapper((e) => events.push(e), ['/Users/me/project']);
    mapper.handle({
      event_type: 'step.start',
      index: 0,
      step: {
        id: 'c1',
        type: 'function_call',
        name: 'replace_file_content',
        arguments: { TargetFile: '/Users/me/project/docs/a/index.tsx' },
      },
    });
    mapper.handle({ event_type: 'step.stop', index: 0 });
    expect(events).toEqual([
      {
        type: 'tool-start',
        id: 'c1',
        name: 'replace_file_content',
        title: 'Edit',
        detail: 'docs/a/index.tsx',
      },
    ]);
  });
});

describe('ensureWorker', () => {
  it.runIf(process.platform !== 'win32')(
    'starts the CLI without the API key, with bash disabled and rooted at the project',
    async () => {
      const out = path.join(dir, 'worker-seen.txt');
      await mkdir(path.dirname(cliPath(dir)), { recursive: true });
      await writeFile(
        cliPath(dir),
        `#!/bin/sh\necho "args=$*" > "${out}"\necho "api=\${GEMINI_API_KEY:-none} env=\${GEMINI_ENVIRONMENT_KEY}" >> "${out}"\necho "Worker polling" >&2\nsleep 5\n`,
      );
      await chmod(cliPath(dir), 0o755);
      vi.stubEnv('GEMINI_API_KEY', 'project-wide-secret');
      try {
        await ensureWorker(dir, { id: 'env-1', environment_key: 'ek_scoped' });
        const seen = await readFile(out, 'utf8');
        expect(seen).toContain(`--root-dir ${dir} --workdir ${dir} --disable-bash`);
        expect(seen).toContain('api=none env=ek_scoped');
      } finally {
        stopWorker();
        vi.unstubAllEnvs();
      }
    },
  );
});

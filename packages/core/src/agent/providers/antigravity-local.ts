import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readTar } from '../sandbox-sync.ts';

// Pinned, with the release's own checksums, so the binary that runs file tools
// on the user's machine is exactly the one Google published.
export const GEMINI_API_CLI_VERSION = '0.4.6';
const RELEASE = `https://github.com/google-gemini/gemini-api-cli/releases/download/v${GEMINI_API_CLI_VERSION}`;
const CHECKSUMS: Record<string, string> = {
  'darwin-arm64': 'c80b5ec2d0a6feee0cf18943427cfdaf9aab7183b7f62f50b956cd2431b98018',
  'darwin-x64': '009a83ea43b1cd25f87375efc01c9418c12fcd7ea779a26a483eb4e875da4a70',
  'linux-arm64': '6bf48dc0b6479b157d4dc35d074d06286c2c6e2f09ff99236bde9829763576f7',
  'linux-x64': '78862dde519d9b47a9fb70b1f0340d19fa1245934d65e83f0e2dbc1d17cd2fa6',
};
const ASSETS: Record<string, string> = {
  'darwin-arm64': 'gemini-api_Darwin_arm64.tar.gz',
  'darwin-x64': 'gemini-api_Darwin_x86_64.tar.gz',
  'linux-arm64': 'gemini-api_Linux_arm64.tar.gz',
  'linux-x64': 'gemini-api_Linux_x86_64.tar.gz',
};
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const READY_TIMEOUT_MS = 10_000;

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

export function localModeSupported(): boolean {
  return platformKey() in ASSETS;
}

function stateDir(cwd: string): string {
  return path.join(cwd, 'node_modules', '.open-doc');
}

export function cliPath(cwd: string): string {
  return path.join(stateDir(cwd), 'bin', 'gemini-api');
}

function versionFile(cwd: string): string {
  return path.join(stateDir(cwd), 'bin', 'gemini-api.version');
}

export async function installedCliVersion(cwd: string): Promise<string | null> {
  try {
    await fs.access(cliPath(cwd));
    return (await fs.readFile(versionFile(cwd), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

let installing: Promise<void> | null = null;

export function installCli(cwd: string): Promise<void> {
  installing ??= (async () => {
    const key = platformKey();
    const asset = ASSETS[key];
    if (!asset) throw new Error(`Local mode is not available on ${key} yet.`);
    const res = await fetch(`${RELEASE}/${asset}`);
    if (!res.ok) throw new Error(`Could not download the gemini-api CLI (${res.status}).`);
    const archive = new Uint8Array(await res.arrayBuffer());
    const digest = createHash('sha256').update(archive).digest('hex');
    if (digest !== CHECKSUMS[key]) {
      throw new Error('The downloaded gemini-api CLI failed its checksum; nothing was installed.');
    }
    const entry = readTar(gunzipSync(archive)).find(
      (e) => path.posix.basename(e.path) === 'gemini-api',
    );
    if (!entry) throw new Error('The gemini-api archive did not contain the CLI.');
    const target = cliPath(cwd);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.partial`;
    await fs.writeFile(partial, entry.data, { mode: 0o755 });
    await fs.rename(partial, target);
    await fs.writeFile(versionFile(cwd), `${GEMINI_API_CLI_VERSION}\n`);
  })().finally(() => {
    installing = null;
  });
  return installing;
}

type EnvironmentRecord = { id: string; environment_key: string };

function environmentFile(cwd: string): string {
  return path.join(stateDir(cwd), 'antigravity-environment.json');
}

async function readEnvironment(cwd: string): Promise<EnvironmentRecord | null> {
  try {
    const raw = JSON.parse(await fs.readFile(environmentFile(cwd), 'utf8'));
    return typeof raw?.id === 'string' && typeof raw?.environment_key === 'string' ? raw : null;
  } catch {
    return null;
  }
}

// The environment key is shown once, at creation, and lets anyone holding it
// take this environment's tool calls; it is stored owner-only.
export async function ensureEnvironment(cwd: string, apiKey: string): Promise<EnvironmentRecord> {
  const existing = await readEnvironment(cwd);
  if (existing) return existing;
  const res = await fetch(`${API_BASE}/environments`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'self_hosted' }),
  });
  if (!res.ok) {
    throw new Error(`Could not create a local environment (Gemini API ${res.status}).`);
  }
  const body = (await res.json()) as Partial<EnvironmentRecord>;
  if (!body.id || !body.environment_key) {
    throw new Error('The Gemini API returned an environment without a key.');
  }
  const record = { id: body.id, environment_key: body.environment_key };
  await fs.mkdir(stateDir(cwd), { recursive: true });
  await fs.writeFile(environmentFile(cwd), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
  return record;
}

export async function forgetEnvironment(cwd: string): Promise<void> {
  stopWorker();
  await fs.rm(environmentFile(cwd), { force: true });
}

type Worker = { process: ChildProcess; key: string; ready: Promise<void>; log: string[] };
let worker: Worker | null = null;

export function stopWorker(): void {
  worker?.process.kill();
  worker = null;
}

process.once('exit', stopWorker);

export function workerLog(): string {
  return worker?.log.slice(-5).join('\n') ?? '';
}

/**
 * One worker per dev server, rooted at the workspace so the agent finds the
 * project skills. `--disable-bash` leaves it only the file tools, which the CLI
 * confines to the root with os.Root, so a model can never run a command here.
 * The project-wide API key is withheld; the worker only needs its environment key.
 */
export function ensureWorker(cwd: string, env: EnvironmentRecord): Promise<void> {
  if (worker && worker.key === env.environment_key && worker.process.exitCode === null) {
    return worker.ready;
  }
  stopWorker();
  const { GEMINI_API_KEY: _withheld, ...rest } = process.env;
  const child = spawn(
    cliPath(cwd),
    ['environments', 'connect', '--root-dir', cwd, '--workdir', cwd, '--disable-bash'],
    {
      cwd,
      env: { ...rest, GEMINI_ENVIRONMENT_KEY: env.environment_key },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  const log: string[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, READY_TIMEOUT_MS);
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split('\n').filter(Boolean)) {
        log.push(line);
        if (log.length > 50) log.shift();
        if (/polling/i.test(line)) {
          clearTimeout(timer);
          resolve();
        }
      }
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (worker?.process === child) worker = null;
      reject(new Error(`The local worker stopped (exit ${code}). ${log.slice(-3).join(' ')}`));
    });
  });
  ready.catch(() => {});
  worker = { process: child, key: env.environment_key, ready, log };
  return ready;
}

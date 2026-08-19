import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { Connect } from 'vite';
import { DOC_ID_RE } from '../open-doc-plugin.ts';

export type ApiContext = {
  userCwd: string;
  docsDir: string;
  docsRoot: string;
  globalAssetsRoot: string;
  /** `docs/.folders.json` — the folder manifest, versioned alongside the docs. */
  manifestPath: string;
  coreVersion: string;
  /**
   * Origin of a dev server already serving this workspace. Headless rendering
   * reuses it instead of booting a second one; absent, it boots its own.
   */
  serverOrigin?: string;
};

export type ApiPluginOptions = {
  userCwd: string;
  docsDir?: string;
  assetsDir?: string;
  coreVersion: string;
  serverOrigin?: string;
};

export function makeContext(opts: ApiPluginOptions): ApiContext {
  const userCwd = opts.userCwd;
  const docsDir = opts.docsDir ?? 'docs';
  const assetsDir = opts.assetsDir ?? 'assets';
  const docsRoot = path.resolve(userCwd, docsDir);
  return {
    userCwd,
    docsDir,
    docsRoot,
    globalAssetsRoot: path.resolve(userCwd, assetsDir),
    manifestPath: path.join(docsRoot, '.folders.json'),
    coreVersion: opts.coreVersion,
    ...(opts.serverOrigin !== undefined ? { serverOrigin: opts.serverOrigin } : {}),
  };
}

export async function readBody(req: Connect.IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

const ENTRY_NAMES = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'];

/** Absolute path of a document's entry file, or null when the id is unusable. */
export function resolveDocPath(userCwd: string, docsDir: string, docId: string): string | null {
  if (!DOC_ID_RE.test(docId)) return null;
  const docsRoot = path.resolve(userCwd, docsDir);
  const full = path.resolve(docsRoot, docId, ENTRY_NAMES[0]);
  if (!full.startsWith(docsRoot + path.sep)) return null;
  return full;
}

/** The entry file that actually exists on disk for a document, or null. */
export function resolveDocEntry(docsRoot: string, docId: string): string | null {
  if (!DOC_ID_RE.test(docId)) return null;
  const docDir = path.resolve(docsRoot, docId);
  if (!docDir.startsWith(docsRoot + path.sep)) return null;
  for (const name of ENTRY_NAMES) {
    const candidate = path.join(docDir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export { ENTRY_NAMES };

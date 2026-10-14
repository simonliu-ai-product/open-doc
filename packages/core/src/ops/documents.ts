import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  copyTitle,
  nextCopyId,
  readMetaTitle,
  setMetaTitle,
  validateDocTitle,
} from '../editing/doc-ops.ts';
import { readManifest, writeManifest } from '../files/folders.ts';
import { DOC_ID_RE } from '../vite/open-doc-plugin.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { assertExpectedSource, hashSource, withFileLock } from './concurrency.ts';

/**
 * Operations shared by the dev API and the MCP server. Everything here takes an
 * `ApiContext` and touches disk directly — no HTTP, so an agent calling a tool
 * and a browser calling `/__docs` end up in exactly the same code.
 */

export class OpsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpsError';
  }
}

const ENTRY_NAMES = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'];

export function docDir(ctx: ApiContext, docId: string): string {
  if (!DOC_ID_RE.test(docId)) throw new OpsError(400, `invalid document id: ${docId}`);
  const dir = path.resolve(ctx.docsRoot, docId);
  // A traversal like `../..` would resolve outside the docs root.
  if (!dir.startsWith(ctx.docsRoot + path.sep)) {
    throw new OpsError(400, `invalid document id: ${docId}`);
  }
  return dir;
}

export function resolveEntry(ctx: ApiContext, docId: string): string | null {
  const dir = docDir(ctx, docId);
  for (const name of ENTRY_NAMES) {
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

export async function listDocIds(ctx: ApiContext): Promise<string[]> {
  try {
    const entries = await fs.readdir(ctx.docsRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && DOC_ID_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Reads what the doc declares without executing it — a regex over `export const meta`. */
function readMetaField(source: string, field: string): string | undefined {
  const re = new RegExp(`${field}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`);
  const inMeta = source.slice(source.indexOf('export const meta'));
  const match = inMeta.match(re);
  return match?.[2];
}

export type DocumentSummary = {
  id: string;
  title: string | null;
  subtitle?: string;
  theme?: string;
  createdAt?: string;
  folder?: string;
  entry: string | null;
};

export async function listDocuments(ctx: ApiContext): Promise<DocumentSummary[]> {
  const ids = await listDocIds(ctx);
  const manifest = await readManifest(ctx.manifestPath);
  const out: DocumentSummary[] = [];
  for (const id of ids) {
    const entry = resolveEntry(ctx, id);
    const source = entry ? await fs.readFile(entry, 'utf8') : '';
    out.push({
      id,
      title: source ? readMetaTitle(source) : null,
      subtitle: source ? readMetaField(source, 'subtitle') : undefined,
      theme: source ? readMetaField(source, 'theme') : undefined,
      createdAt: source ? readMetaField(source, 'createdAt') : undefined,
      folder: manifest.assignments[id],
      entry: entry ? path.relative(ctx.userCwd, entry) : null,
    });
  }
  return out;
}

export async function readDocument(
  ctx: ApiContext,
  docId: string,
): Promise<{ id: string; entry: string; source: string; hash: string }> {
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  const source = await fs.readFile(entry, 'utf8');
  return {
    id: docId,
    entry: path.relative(ctx.userCwd, entry),
    source,
    hash: hashSource(source),
  };
}

export async function createDocument(
  ctx: ApiContext,
  docId: string,
  source: string,
): Promise<{ id: string; entry: string; hash: string }> {
  const dir = docDir(ctx, docId);
  const entry = path.join(dir, 'index.tsx');
  return withFileLock(entry, async () => {
    if (existsSync(dir)) throw new OpsError(409, `document already exists: ${docId}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(entry, source, 'utf8');
    return {
      id: docId,
      entry: path.relative(ctx.userCwd, entry),
      hash: hashSource(source),
    };
  });
}

/**
 * Whole-file overwrite. `expected` (full source) or `expectedHash` (16-char
 * SHA-256 digest from `readDocument`) turns a blind overwrite into an atomic
 * conflict check inside a per-file write lock, keeping two agents (or an agent
 * and a person on GCS FUSE) from clobbering each other.
 */
export async function writeDocument(
  ctx: ApiContext,
  docId: string,
  source: string,
  expected?: string,
  expectedHash?: string,
): Promise<{ id: string; entry: string; hash: string }> {
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  return withFileLock(entry, async () => {
    if (expected !== undefined || expectedHash !== undefined) {
      const current = await fs.readFile(entry, 'utf8');
      assertExpectedSource(current, { expected, expectedHash });
    }
    await fs.writeFile(entry, source, 'utf8');
    return {
      id: docId,
      entry: path.relative(ctx.userCwd, entry),
      hash: hashSource(source),
    };
  });
}

export async function renameDocument(
  ctx: ApiContext,
  docId: string,
  rawTitle: unknown,
  opts: { expectedHash?: string } = {},
): Promise<{ id: string; title: string; hash: string }> {
  const title = validateDocTitle(rawTitle);
  if (!title) throw new OpsError(400, 'invalid title');
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  return withFileLock(entry, async () => {
    const source = await fs.readFile(entry, 'utf8');
    assertExpectedSource(source, opts);
    const next = setMetaTitle(source, title);
    if (next === null)
      throw new OpsError(422, 'document has no `export const meta` object to rename');
    if (next !== source) await fs.writeFile(entry, next, 'utf8');
    return { id: docId, title, hash: hashSource(next) };
  });
}

export async function duplicateDocument(
  ctx: ApiContext,
  docId: string,
  newId?: string,
): Promise<{ id: string }> {
  const dir = docDir(ctx, docId);
  if (!existsSync(dir)) throw new OpsError(404, `document not found: ${docId}`);

  const taken = new Set(await listDocIds(ctx));
  let targetId: string;
  if (newId) {
    if (!DOC_ID_RE.test(newId)) throw new OpsError(400, `invalid newId: ${newId}`);
    if (taken.has(newId)) throw new OpsError(409, `document already exists: ${newId}`);
    targetId = newId;
  } else {
    targetId = nextCopyId(docId, taken);
  }

  await fs.cp(dir, docDir(ctx, targetId), { recursive: true });

  const entry = resolveEntry(ctx, targetId);
  if (entry) {
    await withFileLock(entry, async () => {
      const source = await fs.readFile(entry, 'utf8');
      const renamed = setMetaTitle(source, copyTitle(readMetaTitle(source) ?? docId));
      if (renamed && renamed !== source) await fs.writeFile(entry, renamed, 'utf8');
    });
  }

  // Copies land next to the original, in the same folder.
  await withFileLock(ctx.manifestPath, async () => {
    const manifest = await readManifest(ctx.manifestPath);
    const folderId = manifest.assignments[docId];
    if (folderId) {
      manifest.assignments[targetId] = folderId;
      await writeManifest(ctx.manifestPath, manifest);
    }
  });

  return { id: targetId };
}

export async function deleteDocument(ctx: ApiContext, docId: string): Promise<void> {
  const dir = docDir(ctx, docId);
  if (!existsSync(dir)) throw new OpsError(404, `document not found: ${docId}`);
  await fs.rm(dir, { recursive: true, force: true });

  await withFileLock(ctx.manifestPath, async () => {
    const manifest = await readManifest(ctx.manifestPath);
    if (manifest.assignments[docId]) {
      delete manifest.assignments[docId];
      await writeManifest(ctx.manifestPath, manifest);
    }
  });
}

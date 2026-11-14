import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// The Interactions API takes inline sources up to 1 MB a file and 2 MB in all.
export const INLINE_FILE_LIMIT = 1024 * 1024;
export const INLINE_TOTAL_LIMIT = 2 * 1024 * 1024;
export const SANDBOX_ROOT = '/workspace';

export type UploadFile = { rel: string; content: string; hash: string };

export type UploadPlan = {
  files: UploadFile[];
  // Workspace-relative paths left behind: binary, too large, or over budget.
  skipped: string[];
};

export function hashBytes(data: Uint8Array | string): string {
  return createHash('sha1').update(data).digest('hex');
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

async function walk(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function toPosix(rel: string): string {
  return rel.split(path.sep).join('/');
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export function decodeText(data: Uint8Array): string | null {
  if (data.includes(0)) return null;
  try {
    return decoder.decode(data);
  } catch {
    return null;
  }
}

// The document folder goes first so the skills are what a tight budget drops.
export async function collectUploads(cwd: string, roots: string[]): Promise<UploadPlan> {
  const files: UploadFile[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const root of roots) {
    for (const file of await walk(root)) {
      const rel = toPosix(path.relative(cwd, file));
      const data = await fs.readFile(file).catch(() => null);
      const content = data && data.byteLength <= INLINE_FILE_LIMIT ? decodeText(data) : null;
      if (!data || content === null || total + data.byteLength > INLINE_TOTAL_LIMIT) {
        skipped.push(rel);
        continue;
      }
      total += data.byteLength;
      files.push({ rel, content, hash: hashBytes(data) });
    }
  }
  return { files, skipped };
}

export type TarEntry = { path: string; data: Uint8Array };

function readString(block: Uint8Array, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end));
}

function parsePax(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const text = new TextDecoder().decode(data);
  let i = 0;
  while (i < text.length) {
    const space = text.indexOf(' ', i);
    if (space === -1) break;
    const len = Number.parseInt(text.slice(i, space), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = text.slice(space + 1, i + len - 1);
    const eq = record.indexOf('=');
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

// Regular files only, with ustar prefixes, pax `path` records and GNU long
// names; enough for the sandbox snapshot, which is all this reads.
export function readTar(buffer: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = Number.parseInt(readString(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const data = buffer.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === 'x') {
      longName = parsePax(data).path ?? longName;
      continue;
    }
    if (type === 'L') {
      longName = readString(data, 0, data.length);
      continue;
    }
    if (type === 'g') continue;
    const prefix = readString(header, 345, 155);
    const name =
      longName ?? (prefix ? `${prefix}/${readString(header, 0, 100)}` : readString(header, 0, 100));
    longName = null;
    if (type === '0' || type === '\0' || type === '7') entries.push({ path: name, data });
  }
  return entries;
}

// Maps a snapshot path back to a workspace-relative one, or null when it falls
// outside the folder this turn may write.
export function snapshotRel(entryPath: string, writableRel: string): string | null {
  let p = entryPath
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');
  const root = SANDBOX_ROOT.replace(/^\/+/, '');
  if (!p.startsWith(`${root}/`)) return null;
  p = path.posix.normalize(p.slice(root.length + 1));
  if (p.startsWith('../') || p === '..' || path.posix.isAbsolute(p)) return null;
  const base = writableRel.replace(/\/+$/, '');
  return p.startsWith(`${base}/`) ? p : null;
}

export type WriteDecision =
  | { rel: string; action: 'write'; data: Uint8Array }
  | { rel: string; action: 'conflict'; data: Uint8Array };

/**
 * What to do with each file the agent left in its sandbox. A file it did not
 * change is skipped; a changed or new one is written unless the local copy
 * moved on since the upload (someone edited it during the turn), in which
 * case the agent's version is a conflict and the local file is left alone.
 * `uploaded` and `local` map workspace-relative paths to content hashes; a
 * missing key means the file did not exist.
 */
export function decideWrites(
  entries: { rel: string; data: Uint8Array }[],
  uploaded: Map<string, string>,
  local: Map<string, string>,
): WriteDecision[] {
  const decisions: WriteDecision[] = [];
  for (const { rel, data } of entries) {
    const before = uploaded.get(rel);
    if (before !== undefined && before === hashBytes(data)) continue;
    const now = local.get(rel);
    const action = now === before ? 'write' : 'conflict';
    decisions.push({ rel, action, data });
  }
  return decisions;
}

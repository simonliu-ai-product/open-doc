import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseStrict } from '../editing/babel-walk.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import {
  type FileChange,
  type Hunk,
  parseUnifiedDiff,
  placeHunks,
  revertHunkIn,
  untrackedFile,
} from './changes-diff.ts';
import { OpsError, resolveEntry } from './documents.ts';

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

export type Revision = { commit: string; short: string; subject: string; when: string };

export type ChangesResult =
  | { available: false; reason: 'no-git' | 'no-repo' }
  | {
      available: true;
      since: string;
      commit: string | null;
      files: FileChange[];
    };

/** The document folder relative to the workspace, POSIX-style, with a trailing slash. */
function folderOf(ctx: ApiContext, docId: string): string {
  return `${path.relative(ctx.userCwd, path.join(ctx.docsRoot, docId)).split(path.sep).join('/')}/`;
}

async function inRepo(ctx: ApiContext): Promise<'yes' | 'no-git' | 'no-repo'> {
  try {
    return (await git(ctx.userCwd, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true'
      ? 'yes'
      : 'no-repo';
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'no-git' : 'no-repo';
  }
}

/**
 * What changed in one document's folder since a revision — the working tree
 * against `since`, untracked files included — with each hunk of the document's
 * own source placed on the elements it touches, so the viewer can mark them.
 */
export async function readChanges(
  ctx: ApiContext,
  docId: string,
  since = 'HEAD',
): Promise<ChangesResult> {
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  const repo = await inRepo(ctx);
  if (repo !== 'yes') return { available: false, reason: repo };

  const folder = folderOf(ctx, docId);
  let commit: string | null = null;
  try {
    commit = (
      await git(ctx.userCwd, ['rev-parse', '--verify', '--quiet', `${since}^{commit}`])
    ).trim();
  } catch {
    // A repository with no commits yet: everything in the folder is new.
    if (since !== 'HEAD') throw new OpsError(400, `not a revision in this repository: ${since}`);
  }

  const files = commit
    ? parseUnifiedDiff(
        await git(ctx.userCwd, [
          'diff',
          '--unified=0',
          '--no-color',
          '--no-ext-diff',
          '--relative',
          commit,
          '--',
          folder,
        ]),
        folder,
      )
    : [];
  const untracked = (
    await git(ctx.userCwd, ['ls-files', '--others', '--exclude-standard', '--', folder])
  )
    .split('\n')
    .filter((file) => file.startsWith(folder));
  for (const file of untracked) {
    const rel = file.slice(folder.length);
    const buffer = await fs.readFile(path.join(ctx.userCwd, file));
    files.push(
      buffer.includes(0)
        ? { path: rel, status: 'added', binary: true, hunks: [] }
        : untrackedFile(rel, buffer.toString('utf8')),
    );
  }

  const own = files.find((file) => file.path === path.basename(entry));
  if (own && !own.binary) placeHunks(await fs.readFile(entry, 'utf8'), own.hunks);
  files.sort((a, b) => (a === own ? -1 : b === own ? 1 : a.path.localeCompare(b.path)));
  return { available: true, since, commit, files };
}

/** Recent commits that touched the document, newest first, for choosing what to compare against. */
export async function listRevisions(
  ctx: ApiContext,
  docId: string,
  limit = 15,
): Promise<Revision[]> {
  if (!resolveEntry(ctx, docId)) throw new OpsError(404, `document not found: ${docId}`);
  if ((await inRepo(ctx)) !== 'yes') return [];
  try {
    const out = await git(ctx.userCwd, [
      'log',
      `-n${limit}`,
      '--format=%H%x1f%h%x1f%s%x1f%cr',
      '--',
      folderOf(ctx, docId),
    ]);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [commit = '', short = '', subject = '', when = ''] = line.split('\x1f');
        return { commit, short, subject, when };
      });
  } catch {
    return [];
  }
}

/**
 * Takes one hunk back out of the working tree. The hunk is found again by id
 * in a fresh diff, never trusted from the request, and a source file must still
 * parse afterwards — hunks can depend on each other, and a revert that leaves
 * half a JSX tag behind is refused rather than written.
 */
export async function revertChange(
  ctx: ApiContext,
  docId: string,
  opts: { since?: string; file: string; hunk: string },
): Promise<{ ok: true }> {
  const changes = await readChanges(ctx, docId, opts.since);
  if (!changes.available) throw new OpsError(409, 'this workspace is not under git');
  const file = changes.files.find((candidate) => candidate.path === opts.file);
  const hunk: Hunk | undefined = file?.hunks.find((candidate) => candidate.id === opts.hunk);
  if (!file || !hunk)
    throw new OpsError(409, 'that change is no longer there — reload the changes');
  if (file.binary) throw new OpsError(422, 'a binary file cannot be reverted here');

  const target = path.join(ctx.docsRoot, docId, file.path);
  const source = await fs.readFile(target, 'utf8');
  const next = revertHunkIn(source, hunk);
  if (next === null) throw new OpsError(409, 'the file changed since the diff was read');
  if (/\.(tsx?|jsx?)$/.test(file.path) && !parseStrict(next)) {
    throw new OpsError(
      422,
      'reverting this change alone would break the source — revert the changes around it too',
    );
  }
  await fs.writeFile(target, next, 'utf8');
  return { ok: true };
}

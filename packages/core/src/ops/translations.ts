import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { setMetaString } from '../editing/doc-ops.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { withFileLock } from './concurrency.ts';
import { listDocIds, OpsError, readMetaField, resolveEntry } from './documents.ts';

const run = promisify(execFile);
const DIFF_LIMIT = 200_000;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

export type TranslationState =
  /** The source has not changed since `translatedAt`. */
  | 'current'
  /** The source changed after `translatedAt`. */
  | 'stale'
  /** No `translatedAt` yet: nothing says which version of the source it matches. */
  | 'unsynced'
  /** `translationOf` names a document that does not exist. */
  | 'missing-source'
  /** `translatedAt` is not a commit this repository knows. */
  | 'unknown-revision'
  /** The workspace is not a git repository, so changes cannot be traced. */
  | 'no-git';

export type TranslationStatus = {
  id: string;
  lang?: string;
  /** The document this one is a translation of. */
  of: string;
  sourceLang?: string;
  state: TranslationState;
  translatedAt?: string;
  /** Source files changed since `translatedAt`, committed or not, relative to the workspace. */
  changedFiles: string[];
  /** Commits to the source since `translatedAt`, newest first. */
  commits: Array<{ short: string; subject: string }>;
  /** With `diff`: the source's changes since `translatedAt` as a unified diff. */
  diff?: string;
  /** True when the diff was cut at its size limit. */
  diffTruncated?: boolean;
};

function folderOf(ctx: ApiContext, docId: string): string {
  return path.relative(ctx.userCwd, path.join(ctx.docsRoot, docId)).split(path.sep).join('/');
}

async function readSource(ctx: ApiContext, docId: string): Promise<string | null> {
  const entry = resolveEntry(ctx, docId);
  return entry ? fs.readFile(entry, 'utf8') : null;
}

async function statusOf(
  ctx: ApiContext,
  id: string,
  source: string,
  opts: { diff?: boolean; repo: boolean },
): Promise<TranslationStatus | null> {
  const of = readMetaField(source, 'translationOf');
  if (!of) return null;
  const translatedAt = readMetaField(source, 'translatedAt');
  const base: TranslationStatus = {
    id,
    lang: readMetaField(source, 'lang'),
    of,
    state: 'current',
    ...(translatedAt ? { translatedAt } : {}),
    changedFiles: [],
    commits: [],
  };

  const original = await readSource(ctx, of);
  if (original === null) return { ...base, state: 'missing-source' };
  base.sourceLang = readMetaField(original, 'lang');
  if (!opts.repo) return { ...base, state: 'no-git' };
  if (!translatedAt) return { ...base, state: 'unsynced' };
  if (!(await gitOk(ctx.userCwd, ['cat-file', '-e', `${translatedAt}^{commit}`]))) {
    return { ...base, state: 'unknown-revision' };
  }

  const folder = folderOf(ctx, of);
  const tracked = (await git(ctx.userCwd, ['diff', '--name-only', translatedAt, '--', folder]))
    .split('\n')
    .filter(Boolean);
  const untracked = (
    await git(ctx.userCwd, ['ls-files', '--others', '--exclude-standard', '--', folder])
  )
    .split('\n')
    .filter(Boolean);
  const changedFiles = [...new Set([...tracked, ...untracked])].sort();
  const commits = (
    await git(ctx.userCwd, ['log', '--format=%h%x09%s', `${translatedAt}..HEAD`, '--', folder])
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [short, ...subject] = line.split('\t');
      return { short, subject: subject.join('\t') };
    });

  const status: TranslationStatus = {
    ...base,
    state: changedFiles.length > 0 ? 'stale' : 'current',
    changedFiles,
    commits,
  };
  if (opts.diff && changedFiles.length > 0) {
    let diff = await git(ctx.userCwd, ['diff', translatedAt, '--', folder]);
    for (const file of untracked) {
      const text = await fs.readFile(path.join(ctx.userCwd, file), 'utf8').catch(() => '');
      diff += `--- /dev/null\n+++ b/${file}\n${text
        .split('\n')
        .map((l) => `+${l}`)
        .join('\n')}\n`;
    }
    status.diff = diff.length > DIFF_LIMIT ? diff.slice(0, DIFF_LIMIT) : diff;
    if (diff.length > DIFF_LIMIT) status.diffTruncated = true;
  }
  return status;
}

/**
 * Every document that declares `meta.translationOf`, and whether its source
 * moved on since the version it was translated from (`meta.translatedAt`, a
 * commit). Pass `docId` for one translation, and `diff` for what changed.
 */
export async function translationStatus(
  ctx: ApiContext,
  opts: { docId?: string; diff?: boolean } = {},
): Promise<TranslationStatus[]> {
  const repo = (await gitOk(ctx.userCwd, ['rev-parse', '--is-inside-work-tree'])) === true;
  const ids = opts.docId ? [opts.docId] : await listDocIds(ctx);
  const out: TranslationStatus[] = [];
  for (const id of ids) {
    const source = await readSource(ctx, id);
    if (source === null) {
      if (opts.docId) throw new OpsError(404, `document not found: ${id}`);
      continue;
    }
    const status = await statusOf(ctx, id, source, { diff: opts.diff, repo });
    if (status) out.push(status);
    else if (opts.docId) throw new OpsError(422, `${id} has no meta.translationOf`);
  }
  return out;
}

/**
 * Records that a translation now matches its source as of `revision` — by
 * default the last commit that touched the source. Refuses while the source
 * has uncommitted changes, which no commit could name.
 */
export async function markTranslated(
  ctx: ApiContext,
  docId: string,
  revision?: string,
): Promise<{ id: string; of: string; translatedAt: string }> {
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  if (!(await gitOk(ctx.userCwd, ['rev-parse', '--is-inside-work-tree']))) {
    throw new OpsError(
      412,
      'the workspace is not a git repository; translations are traced by commit',
    );
  }
  const source = await fs.readFile(entry, 'utf8');
  const of = readMetaField(source, 'translationOf');
  if (!of) throw new OpsError(422, `${docId} has no meta.translationOf`);
  if (!resolveEntry(ctx, of)) throw new OpsError(404, `source document not found: ${of}`);

  const folder = folderOf(ctx, of);
  let commit: string;
  if (revision) {
    try {
      commit = (await git(ctx.userCwd, ['rev-parse', '--verify', `${revision}^{commit}`])).trim();
    } catch {
      throw new OpsError(400, `not a commit: ${revision}`);
    }
  } else {
    const dirty = (await git(ctx.userCwd, ['status', '--porcelain', '--', folder])).trim();
    if (dirty) {
      throw new OpsError(
        409,
        `${of} has uncommitted changes; commit them first so the translation can name the version it matches`,
      );
    }
    commit = (await git(ctx.userCwd, ['log', '-1', '--format=%H', '--', folder])).trim();
    if (!commit) throw new OpsError(409, `${of} has never been committed`);
  }

  await withFileLock(entry, async () => {
    const current = await fs.readFile(entry, 'utf8');
    const next = setMetaString(current, 'translatedAt', commit);
    if (next === null) throw new OpsError(422, `${docId} has no \`export const meta\` object`);
    if (next !== current) await fs.writeFile(entry, next, 'utf8');
  });
  return { id: docId, of, translatedAt: commit };
}

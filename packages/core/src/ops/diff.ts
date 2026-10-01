import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createRenderSession,
  type ImageDiff,
  type RenderSession,
  RenderUnavailableError,
  type SheetSnapshot,
} from '../render/session.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { alignPages, diffLines, type LineChange, textLines } from './diff-pages.ts';
import { renderDiffReport } from './diff-report.ts';
import { OpsError, resolveEntry } from './documents.ts';

const run = promisify(execFile);

export type PageStatus = 'same' | 'changed' | 'added' | 'removed';

export type PageChange = {
  status: PageStatus;
  /** 1-based page in the old version, or null for a new page. */
  before: number | null;
  /** 1-based page in the new version, or null for a page that went away. */
  after: number | null;
  /** Lines added and removed, in reading order; empty for an unchanged page. */
  lines: LineChange[];
  /** Changed regions on the new page (or the old one, for a removed page), in CSS px. */
  boxes: ImageDiff['boxes'];
};

export type DiffResult = {
  docId: string;
  /** The revision compared against, as given and as resolved. */
  since: string;
  commit: string;
  pages: PageChange[];
  /** The report, relative to the workspace root. */
  file: string;
};

const MAX_BUFFER = 64 * 1024 * 1024;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout;
}

async function gitBytes(cwd: string, args: string[]): Promise<Buffer> {
  const { stdout } = await run('git', args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    encoding: 'buffer',
  });
  return stdout;
}

/**
 * The workspace as it was at `commit`, as far as one document needs it: its
 * folder, the global assets, and the config. It lives inside the workspace so
 * that `react` and `@open-document/core` resolve to the same installed copies
 * the current version renders with.
 */
async function checkout(
  ctx: ApiContext,
  docId: string,
  commit: string,
): Promise<{ dir: string; exists: boolean }> {
  const prefix = (await git(ctx.userCwd, ['rev-parse', '--show-prefix'])).trim();
  const dir = path.join(ctx.userCwd, '.open-doc-diff', `${commit.slice(0, 12)}-${docId}`);
  await fs.rm(dir, { recursive: true, force: true });

  const docRel = path.relative(ctx.userCwd, path.join(ctx.docsRoot, docId));
  const assetsRel = path.relative(ctx.userCwd, ctx.globalAssetsRoot);
  const wanted = [docRel, assetsRel, 'open-doc.config.ts'];

  let exists = false;
  for (const rel of wanted) {
    // `--full-tree` takes and prints paths from the repository root; without
    // it they are relative to the workspace, which may sit deeper in the repo.
    const listed = await git(ctx.userCwd, [
      'ls-tree',
      '-r',
      '--full-tree',
      '--name-only',
      commit,
      '--',
      `${prefix}${rel.split(path.sep).join('/')}`,
    ]);
    for (const file of listed.split('\n').filter(Boolean)) {
      const local = file.slice(prefix.length);
      const target = path.join(dir, local);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await gitBytes(ctx.userCwd, ['show', `${commit}:${file}`]));
      if (rel === docRel) exists = true;
    }
  }
  // A workspace older than its config file still needs one to boot.
  const config = path.join(dir, 'open-doc.config.ts');
  try {
    await fs.access(config);
  } catch {
    await fs.copyFile(path.join(ctx.userCwd, 'open-doc.config.ts'), config).catch(() => {});
  }
  return { dir, exists };
}

async function sheetsOf(
  session: RenderSession,
  docId: string,
): Promise<{ title: string; sheets: SheetSnapshot[] }> {
  const renderer = await session.open(docId);
  try {
    return { title: renderer.status.title || docId, sheets: await renderer.sheets() };
  } finally {
    await renderer.close();
  }
}

async function openSession(userCwd: string, origin?: string): Promise<RenderSession> {
  try {
    return await createRenderSession({
      userCwd,
      ...(origin ? { origin } : {}),
      deviceScaleFactor: 1,
    });
  } catch (err) {
    if (err instanceof RenderUnavailableError) throw new OpsError(503, err.message);
    throw err;
  }
}

/**
 * What changed in a document since a revision, page by page: the old and new
 * sheets rendered through the same print pipeline as an export, paired by
 * content, compared as pictures and as text, and written up as a report a
 * reviewer can read without the source.
 */
export async function diffDocument(
  ctx: ApiContext,
  docId: string,
  opts: { since?: string; outDir?: string } = {},
): Promise<DiffResult> {
  if (!resolveEntry(ctx, docId)) throw new OpsError(404, `document not found: ${docId}`);
  const since = opts.since ?? 'HEAD';

  let commit: string;
  try {
    commit = (await git(ctx.userCwd, ['rev-parse', '--verify', `${since}^{commit}`])).trim();
  } catch {
    throw new OpsError(400, `not a revision in this repository: ${since}`);
  }

  const outDir = path.resolve(ctx.userCwd, opts.outDir ?? 'out');
  if (outDir !== ctx.userCwd && !outDir.startsWith(ctx.userCwd + path.sep)) {
    throw new OpsError(400, `outDir must stay inside the workspace: ${opts.outDir}`);
  }

  const old = await checkout(ctx, docId, commit);
  // The current version's session stays open after its own snapshot: its
  // browser is what compares the pictures.
  const current = await openSession(ctx.userCwd, ctx.serverOrigin);
  try {
    let before: SheetSnapshot[] = [];
    if (old.exists) {
      const past = await openSession(old.dir);
      try {
        before = (await sheetsOf(past, docId)).sheets;
      } finally {
        await past.close();
      }
    }
    const after = await sheetsOf(current, docId);

    const pairs = alignPages(
      before.map((sheet) => sheet.text),
      after.sheets.map((sheet) => sheet.text),
    );

    const pages: PageChange[] = [];
    for (const pair of pairs) {
      const b = pair.before === null ? null : before[pair.before];
      const a = pair.after === null ? null : after.sheets[pair.after];
      const page = {
        before: pair.before === null ? null : pair.before + 1,
        after: pair.after === null ? null : pair.after + 1,
      };
      if (!b || !a) {
        pages.push({ ...page, status: b ? 'removed' : 'added', lines: [], boxes: [] });
        continue;
      }
      const picture = await current.compareImages(b.png, a.png);
      const lines = diffLines(textLines(b.text), textLines(a.text)).filter(
        (line) => line.op !== 'same',
      );
      const same = picture.boxes.length === 0 && lines.length === 0;
      pages.push({ ...page, status: same ? 'same' : 'changed', lines, boxes: picture.boxes });
    }

    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${docId}-diff.html`);
    await fs.writeFile(
      file,
      renderDiffReport({
        docId,
        title: after.title,
        since,
        commit,
        pages,
        before: before.map((sheet) => sheet.png),
        after: after.sheets.map((sheet) => sheet.png),
      }),
    );

    return { docId, since, commit, pages, file: path.relative(ctx.userCwd, file) };
  } finally {
    await current.close();
    await fs.rm(old.dir, { recursive: true, force: true });
    await fs.rmdir(path.dirname(old.dir)).catch(() => {});
  }
}

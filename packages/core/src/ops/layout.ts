import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LayoutFinding } from '../app/lib/diagnostics.ts';
import {
  createRenderSession,
  type DocRenderer,
  type RenderSession,
  RenderUnavailableError,
} from '../render/session.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { OpsError, resolveEntry } from './documents.ts';

export type { LayoutFinding };

export type LayoutReport = {
  docId: string;
  title: string;
  pageCount: number;
  errors: number;
  warnings: number;
  findings: LayoutFinding[];
};

import type { ExportFormat } from '../app/lib/sdk.ts';

export { EXPORT_FORMATS, type ExportFormat } from '../app/lib/sdk.ts';

export type ExportResult = {
  docId: string;
  format: ExportFormat;
  pageCount: number;
  /** Written paths, relative to the workspace root. */
  files: string[];
  /** With `each`: how many rows were written, one copy each. */
  records?: number;
};

/**
 * Chromium and a Vite server are expensive to start, and an agent checking its
 * work calls these back to back. One session is kept warm and closed once
 * nobody has asked for a while.
 */
const IDLE_MS = 120_000;

let shared: { session: RenderSession; origin: string | undefined } | null = null;
let pending: Promise<RenderSession> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let leases = 0;

function armIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (leases > 0) return;
    const current = shared;
    shared = null;
    idleTimer = null;
    void current?.session.close().catch(() => {});
  }, IDLE_MS);
  idleTimer.unref?.();
}

async function acquire(ctx: ApiContext): Promise<RenderSession> {
  if (shared && shared.origin === ctx.serverOrigin) return shared.session;
  if (!pending) {
    const origin = ctx.serverOrigin;
    pending = createRenderSession({ userCwd: ctx.userCwd, origin, deviceScaleFactor: 2 })
      .then((session) => {
        shared = { session, origin };
        return session;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

async function withDoc<T>(
  ctx: ApiContext,
  docId: string,
  fn: (renderer: DocRenderer) => Promise<T>,
): Promise<T> {
  if (!resolveEntry(ctx, docId)) throw new OpsError(404, `document not found: ${docId}`);

  let session: RenderSession;
  try {
    session = await acquire(ctx);
  } catch (err) {
    if (err instanceof RenderUnavailableError) throw new OpsError(501, err.message);
    throw new OpsError(500, (err as Error).message);
  }

  leases++;
  let renderer: DocRenderer | null = null;
  try {
    renderer = await session.open(docId);
    return await fn(renderer);
  } catch (err) {
    if (err instanceof OpsError) throw err;
    throw new OpsError(422, (err as Error).message);
  } finally {
    await renderer?.close().catch(() => {});
    leases--;
    armIdleClose();
  }
}

/** Closes the warm browser. Call before the process exits so nothing lingers. */
export async function closeRenderSession(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const current = shared;
  shared = null;
  await current?.session.close().catch(() => {});
}

/**
 * Renders the document headlessly at true page size and reports what is wrong
 * with the layout — the part of a document an agent writing React cannot see.
 */
export async function checkLayout(ctx: ApiContext, docId: string): Promise<LayoutReport> {
  return withDoc(ctx, docId, async (renderer) => {
    const report = await renderer.diagnose();
    return {
      docId: report.docId || docId,
      title: report.title,
      pageCount: report.pageCount,
      errors: report.findings.filter((f) => f.severity === 'error').length,
      warnings: report.findings.filter((f) => f.severity === 'warn').length,
      findings: report.findings,
    };
  });
}

export async function renderDocPage(
  ctx: ApiContext,
  docId: string,
  page: number,
): Promise<{ docId: string; page: number; pageCount: number; mimeType: string; base64: string }> {
  return withDoc(ctx, docId, async (renderer) => {
    const bytes = await renderer.screenshot(page);
    return {
      docId,
      page,
      pageCount: renderer.status.pageCount,
      mimeType: 'image/png',
      base64: Buffer.from(bytes).toString('base64'),
    };
  });
}

function resolveOutDir(ctx: ApiContext, outDir: string): string {
  const resolved = path.resolve(ctx.userCwd, outDir);
  if (resolved !== ctx.userCwd && !resolved.startsWith(ctx.userCwd + path.sep)) {
    throw new OpsError(400, `outDir must stay inside the workspace: ${outDir}`);
  }
  return resolved;
}

/**
 * Writes the document's files. With `each`, a document that exports
 * `records` is laid out and written once per row — `name` (or
 * `meta.recordName`) names each row's files.
 */
export async function exportDocument(
  ctx: ApiContext,
  docId: string,
  opts: { format?: ExportFormat; outDir?: string; each?: boolean; name?: string } = {},
): Promise<ExportResult> {
  const format = opts.format ?? 'pdf';
  const dir = resolveOutDir(ctx, opts.outDir ?? 'out');

  return withDoc(ctx, docId, async (renderer) => {
    await fs.mkdir(dir, { recursive: true });
    const written: string[] = [];
    const taken = new Set<string>();

    const write = async (name: string, bytes: Uint8Array) => {
      const file = path.join(dir, name);
      await fs.writeFile(file, bytes);
      written.push(path.relative(ctx.userCwd, file));
    };

    // Two rows can fill the pattern the same way; the second must not
    // overwrite the first.
    const free = (base: string) => {
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      taken.add(name);
      return name;
    };

    const writeCopy = async (base: string) => {
      if (format === 'pdf') {
        await write(`${base}.pdf`, await renderer.pdf());
      } else if (format === 'html' || format === 'docx') {
        const bundle = format === 'html' ? await renderer.html() : await renderer.docx();
        if (!bundle) throw new OpsError(422, `document has no pages: ${docId}`);
        await write(
          `${base}${path.extname(bundle.filename)}`,
          Buffer.from(bundle.base64, 'base64'),
        );
      } else {
        const width = String(renderer.status.pageCount).length;
        for (let page = 1; page <= renderer.status.pageCount; page++) {
          await write(
            `${base}-${String(page).padStart(width, '0')}.png`,
            await renderer.screenshot(page),
          );
        }
      }
    };

    if (!opts.each) {
      await writeCopy(docId);
      return { docId, format, pageCount: renderer.status.pageCount, files: written };
    }

    const records = renderer.status.records;
    if (records === 0) {
      throw new OpsError(
        422,
        `${docId} has no records — export \`records\` (rows from a .csv) to write one copy per row`,
      );
    }
    let pageCount = 0;
    for (let index = 0; index < records; index++) {
      const name = await renderer.setRecord(index, opts.name);
      pageCount += renderer.status.pageCount;
      await writeCopy(free(name));
    }
    return { docId, format, pageCount, files: written, records };
  });
}

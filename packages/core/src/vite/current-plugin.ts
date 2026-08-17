import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { DOC_ID_RE } from './open-doc-plugin.ts';

const TEXT_SNIPPET_MAX = 120;

export type CurrentPluginOptions = {
  userCwd: string;
  docsDir?: string;
};

type IncomingPayload = {
  docId?: unknown;
  pageIndex?: unknown;
  totalPages?: unknown;
  docTitle?: unknown;
  selection?: unknown;
};

type IncomingSelection = {
  line?: unknown;
  column?: unknown;
  tagName?: unknown;
  text?: unknown;
};

type Selection = {
  line: number;
  column: number;
  tagName: string;
  text: string;
};

type Cached = {
  docId: string;
  pageIndex: number;
  pageNumber: number;
  totalPages: number;
  docTitle: string;
  pagePath: string;
  selection: Selection | null;
};

function parseSelection(raw: unknown): Selection | null {
  if (raw == null || typeof raw !== 'object') return null;
  const sel = raw as IncomingSelection;
  if (typeof sel.line !== 'number' || !Number.isFinite(sel.line)) return null;
  if (typeof sel.column !== 'number' || !Number.isFinite(sel.column)) return null;
  const tagName =
    typeof sel.tagName === 'string' ? sel.tagName.toLowerCase().slice(0, 32) : 'unknown';
  const text =
    typeof sel.text === 'string'
      ? sel.text.replace(/\s+/g, ' ').trim().slice(0, TEXT_SNIPPET_MAX)
      : '';
  return {
    line: Math.max(1, Math.floor(sel.line)),
    column: Math.max(0, Math.floor(sel.column)),
    tagName,
    text,
  };
}

/**
 * Writes `node_modules/.open-doc/current.json` whenever the viewer navigates or
 * the inspector picks an element, so an agent can resolve "this page" without
 * asking. Dev only — a static build has no cursor to report.
 */
export function currentPlugin(opts: CurrentPluginOptions): Plugin {
  const userCwd = opts.userCwd;
  const docsDir = opts.docsDir ?? 'docs';
  const outDir = path.join(userCwd, 'node_modules', '.open-doc');
  const outFile = path.join(outDir, 'current.json');
  const tmpFile = `${outFile}.tmp`;

  let cached: Cached | null = null;

  return {
    name: 'open-doc:current',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.ws.on('open-doc:current', async (raw: IncomingPayload) => {
        const next: Cached = cached
          ? { ...cached }
          : {
              docId: '',
              pageIndex: 0,
              pageNumber: 1,
              totalPages: 1,
              docTitle: '',
              pagePath: '',
              selection: null,
            };

        if (typeof raw?.docId === 'string') {
          if (!DOC_ID_RE.test(raw.docId)) return;

          const totalPages =
            typeof raw.totalPages === 'number' &&
            Number.isFinite(raw.totalPages) &&
            raw.totalPages > 0
              ? Math.floor(raw.totalPages)
              : 1;
          const rawIndex =
            typeof raw.pageIndex === 'number' && Number.isFinite(raw.pageIndex)
              ? Math.floor(raw.pageIndex)
              : 0;
          const pageIndex = Math.max(0, Math.min(totalPages - 1, rawIndex));
          const docTitle = typeof raw.docTitle === 'string' ? raw.docTitle : raw.docId;
          const pagePath = path.join(docsDir, raw.docId, 'index.tsx').split(path.sep).join('/');

          // A move to another document or another sheet invalidates whatever the
          // inspector had picked — reporting a stale element is worse than none.
          if (cached?.docId !== raw.docId || cached?.pageIndex !== pageIndex) {
            next.selection = null;
          }

          next.docId = raw.docId;
          next.pageIndex = pageIndex;
          next.pageNumber = pageIndex + 1;
          next.totalPages = totalPages;
          next.docTitle = docTitle;
          next.pagePath = pagePath;
        }

        if ('selection' in raw) {
          next.selection = parseSelection(raw.selection);
        }

        if (!next.docId) return;

        cached = next;

        const body = { ...next, updatedAt: new Date().toISOString() };
        try {
          await fs.mkdir(outDir, { recursive: true });
          await fs.writeFile(tmpFile, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
          await fs.rename(tmpFile, outFile);
        } catch {
          // Best-effort: a transient FS error here shouldn't crash the dev server.
        }
      });
    },
  };
}

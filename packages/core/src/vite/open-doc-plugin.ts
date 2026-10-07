import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { loadConfigFromFile, normalizePath, type Plugin, type ViteDevServer } from 'vite';
import type { OpenDocConfig } from '../config.ts';

export type { OpenDocConfig };

export const DOC_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const CONFIG_FILE = 'open-doc.config.ts';
const DOCS_VMOD = 'virtual:open-doc/docs';
const CONFIG_VMOD = 'virtual:open-doc/config';
const FOLDERS_VMOD = 'virtual:open-doc/folders';

type FoldersManifest = {
  folders: unknown[];
  assignments: Record<string, string>;
};

async function readFoldersManifest(file: string): Promise<FoldersManifest> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<FoldersManifest>;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      assignments:
        parsed.assignments && typeof parsed.assignments === 'object'
          ? (parsed.assignments as Record<string, string>)
          : {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { folders: [], assignments: {} };
    throw err;
  }
}

export type OpenDocPluginOptions = {
  userCwd: string;
  config: OpenDocConfig;
  coreVersion: string;
};

function resolved(id: string): string {
  return `\0${id}`;
}

async function findDocs(userCwd: string, docsDir: string): Promise<string[]> {
  const abs = path.resolve(userCwd, docsDir);
  if (!existsSync(abs)) return [];
  const hits = await fg('*/index.{tsx,jsx,ts,js}', { cwd: abs, absolute: true, onlyFiles: true });
  return hits.sort();
}

function toId(absFile: string, docsRoot: string): string {
  return path.relative(docsRoot, absFile).split(path.sep)[0];
}

const META_CREATED_AT_RE = /(?:^|[\s,{])createdAt\s*:\s*['"]([^'"]+)['"]/;
const META_THEME_RE = /(?:^|[\s,{])theme\s*:\s*['"]([^'"]+)['"]/;
const META_TITLE_RE = /(?:^|[\s,{])title\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/;

export type ExtractedMeta = {
  theme: string | null;
  createdAt: string | null;
  title: string | null;
};

/**
 * Reads `meta` with a brace-matched regex instead of parsing: the plugin runs on
 * every discovery pass, and the fields it needs (sort order, theme back-link,
 * the title search and sorting use without loading every document) are
 * contractually string literals.
 */
export function extractMeta(src: string): ExtractedMeta {
  const empty: ExtractedMeta = { theme: null, createdAt: null, title: null };
  const metaStart = src.search(/export\s+const\s+meta\b/);
  if (metaStart === -1) return empty;
  const openBrace = src.indexOf('{', src.indexOf('=', metaStart));
  if (openBrace === -1) return empty;
  let depth = 0;
  let closeBrace = -1;
  for (let i = openBrace; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }
  if (closeBrace === -1) return empty;
  const body = src.slice(openBrace + 1, closeBrace);
  return {
    theme: body.match(META_THEME_RE)?.[1] ?? null,
    createdAt: body.match(META_CREATED_AT_RE)?.[1] ?? null,
    title: unescapeLiteral(body.match(META_TITLE_RE)?.[2] ?? null),
  };
}

function unescapeLiteral(raw: string | null): string | null {
  return raw === null ? null : raw.replace(/\\(.)/g, '$1');
}

function parseCreatedAtMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

async function readMeta(abs: string): Promise<ExtractedMeta> {
  try {
    return extractMeta(await fs.readFile(abs, 'utf8'));
  } catch {
    return { theme: null, createdAt: null, title: null };
  }
}

const warnedInvalidDocIds = new Set<string>();

export async function generateDocsModule(
  files: string[],
  docsRoot: string,
  isDev: boolean,
): Promise<{ code: string; ignored: string[] }> {
  const scanned = await Promise.all(
    files.map(async (abs) => {
      const meta = await readMeta(abs);
      return {
        id: toId(abs, docsRoot),
        importPath: isDev ? `@fs/${normalizePath(abs).replace(/^\/+/, '')}` : abs,
        theme: meta.theme,
        title: meta.title,
        createdAt: parseCreatedAtMs(meta.createdAt),
      };
    }),
  );

  // A doc id lands in URLs and filesystem paths, so a folder whose name can't
  // round-trip through both is dropped rather than listed as a broken doc.
  const entries = scanned.filter((e) => DOC_ID_RE.test(e.id));
  const ignored = scanned.filter((e) => !DOC_ID_RE.test(e.id)).map((e) => e.id);

  const ids = JSON.stringify(entries.map((e) => e.id).sort());
  const createdAtMap: Record<string, number> = {};
  const themesMap: Record<string, string> = {};
  const titlesMap: Record<string, string> = {};
  for (const e of entries) {
    if (e.createdAt !== null) createdAtMap[e.id] = e.createdAt;
    if (e.theme) themesMap[e.id] = e.theme;
    if (e.title) titlesMap[e.id] = e.title;
  }

  const importTokens = JSON.stringify(Object.fromEntries(entries.map((e) => [e.id, 0])));
  const devRuntime = isDev
    ? `
const docImportTokens = ${importTokens};
if (import.meta.hot) {
  import.meta.hot.on('open-doc:doc-changed', (data) => {
    const ids = Array.isArray(data?.docIds) ? data.docIds : data?.docId ? [data.docId] : [];
    const token = Date.now();
    for (const id of ids) {
      if (Object.prototype.hasOwnProperty.call(docImportTokens, id)) docImportTokens[id] = token;
    }
  });
}
`
    : '';

  const cases = entries
    .map((e) => {
      const importExpr = isDev
        ? `import(/* @vite-ignore */ import.meta.env.BASE_URL + ${JSON.stringify(`${e.importPath}?t=`)} + docImportTokens[${JSON.stringify(e.id)}])`
        : `import(${JSON.stringify(e.importPath)})`;
      return `    case ${JSON.stringify(e.id)}: return ${importExpr};`;
    })
    .join('\n');

  const code = `// virtual:open-doc/docs — generated
export const docIds = ${ids};
export const docCreatedAt = ${JSON.stringify(createdAtMap)};
export const docThemes = ${JSON.stringify(themesMap)};
export const docTitles = ${JSON.stringify(titlesMap)};
${devRuntime}

export async function loadDoc(id) {
  switch (id) {
${cases}
    default: throw new Error('Document not found: ' + id);
  }
}
`;
  return { code, ignored };
}

export function openDocPlugin(opts: OpenDocPluginOptions): Plugin {
  const { userCwd, config, coreVersion } = opts;
  const docsDir = config.docsDir ?? 'docs';
  const docsRoot = path.resolve(userCwd, docsDir);
  const foldersManifestPath = path.join(docsRoot, '.folders.json');

  let isDev = false;
  // The ids the browser was last given, to tell whether a rescan found new ones.
  let listedIds = '';

  const docIdForEntry = (p: string): string | null => {
    const rel = path.relative(docsRoot, p);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep);
    if (parts.length !== 2) return null;
    if (!/^index\.(tsx|jsx|ts|js)$/.test(parts[1])) return null;
    return parts[0];
  };

  let docChangeTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingDocChanges = new Set<string>();
  const queueDocChanged = (server: ViteDevServer, id: string) => {
    pendingDocChanges.add(id);
    if (docChangeTimer) clearTimeout(docChangeTimer);
    docChangeTimer = setTimeout(() => {
      docChangeTimer = null;
      const mod = server.moduleGraph.getModuleById(resolved(DOCS_VMOD));
      if (mod) server.moduleGraph.invalidateModule(mod);
      const docIds = Array.from(pendingDocChanges);
      pendingDocChanges.clear();
      server.ws.send({ type: 'custom', event: 'open-doc:doc-changed', data: { docIds } });
    }, 100);
  };

  return {
    name: 'open-doc',
    config(_c, env) {
      isDev = env.command === 'serve';
      return { server: { fs: { allow: [userCwd] } } };
    },
    resolveId(id) {
      if (id === DOCS_VMOD) return resolved(DOCS_VMOD);
      if (id === CONFIG_VMOD) return resolved(CONFIG_VMOD);
      if (id === FOLDERS_VMOD) return resolved(FOLDERS_VMOD);
      return null;
    },
    async load(id) {
      if (id === resolved(DOCS_VMOD)) {
        const files = await findDocs(userCwd, docsDir);
        listedIds = JSON.stringify(files.map((file) => toId(file, docsRoot)).sort());
        const { code, ignored } = await generateDocsModule(files, docsRoot, isDev);
        for (const docId of ignored) {
          if (warnedInvalidDocIds.has(docId)) continue;
          warnedInvalidDocIds.add(docId);
          this.warn(
            `Ignoring document folder "${docId}": ids must match ${DOC_ID_RE} (letters, digits, "-", "_"). Rename it under "${docsDir}/" to a kebab-case id so it shows up.`,
          );
        }
        return code;
      }
      if (id === resolved(CONFIG_VMOD)) {
        const userBuild = config.build ?? {};
        const build = isDev
          ? { showDocBrowser: true, allowHtmlExport: true }
          : {
              showDocBrowser: userBuild.showDocBrowser ?? true,
              allowHtmlExport: userBuild.allowHtmlExport ?? true,
            };
        return `export default ${JSON.stringify({ ...config, build, version: coreVersion })};\n`;
      }
      if (id === resolved(FOLDERS_VMOD)) {
        const manifest = await readFoldersManifest(foldersManifestPath);
        return `export default ${JSON.stringify(manifest)};\n`;
      }
      return null;
    },
    handleHotUpdate(ctx) {
      const docId = docIdForEntry(ctx.file);
      if (!docId) return;
      queueDocChanged(ctx.server, docId);
      return [];
    },
    configureServer(server) {
      const isDocEntry = (p: string) => docIdForEntry(p) !== null;

      let reloadTimer: ReturnType<typeof setTimeout> | null = null;
      const reload = () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          const mod = server.moduleGraph.getModuleById(resolved(DOCS_VMOD));
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }, 150);
      };

      // Vite's `root` is the core app dir, so chokidar doesn't watch the user's
      // docs folder by default. Pass the directory itself — Vite sets
      // `disableGlobbing: true` and would treat a glob as a literal path.
      // Watched even when missing, so a docs/ directory created after the server
      // started still registers without a restart.
      server.watcher.add(docsRoot);
      server.watcher.on('add', (p) => {
        if (isDocEntry(p)) reload();
      });
      // The viewer's fallback when it is sent to a document it has never heard
      // of: on Linux CI the watcher missed a folder created and filled in one
      // go — a template, a copy, `open-doc new` — entirely, and the disk is the
      // truth. Reloads only when the list really changed.
      server.middlewares.use('/__docs-rescan', async (_req, res) => {
        const files = await findDocs(userCwd, docsDir);
        const changed =
          JSON.stringify(files.map((file) => toId(file, docsRoot)).sort()) !== listedIds;
        if (changed) reload();
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ changed }));
      });
      server.watcher.on('unlink', (p) => {
        if (isDocEntry(p)) reload();
      });
      // A document folder deleted whole (rather than just its entry) still has
      // to drop out of the browser.
      server.watcher.on('unlinkDir', (p) => {
        if (path.dirname(p) === docsRoot) reload();
      });

      // The sidebar re-reads the manifest on this event, so folder edits made
      // in one tab show up in another.
      let foldersTimer: ReturnType<typeof setTimeout> | null = null;
      const foldersChanged = () => {
        if (foldersTimer) clearTimeout(foldersTimer);
        foldersTimer = setTimeout(() => {
          foldersTimer = null;
          const mod = server.moduleGraph.getModuleById(resolved(FOLDERS_VMOD));
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'custom', event: 'open-doc:files-changed', data: {} });
        }, 100);
      };
      server.watcher.add(foldersManifestPath);
      for (const event of ['add', 'change', 'unlink'] as const) {
        server.watcher.on(event, (p) => {
          if (p === foldersManifestPath) foldersChanged();
        });
      }
    },
  };
}

export async function loadUserConfig(userCwd: string): Promise<OpenDocConfig> {
  const file = path.join(userCwd, CONFIG_FILE);
  if (!existsSync(file)) return {};
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    file,
    userCwd,
    'silent',
  );
  return (loaded?.config ?? {}) as OpenDocConfig;
}

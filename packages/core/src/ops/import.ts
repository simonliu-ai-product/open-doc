import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateAssetName } from '../files/assets.ts';
import { parseMarkdown } from '../import/markdown.ts';
import { collectImageSources, generateDocumentSource, type ImportImage } from '../import/to-tsx.ts';
import { DOC_ID_RE } from '../vite/open-doc-plugin.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { createDocument, listDocIds, OpsError } from './documents.ts';

export type ImportMarkdownOptions = {
  /** Markdown text. One of `markdown` or `file` is required. */
  markdown?: string;
  /** Path to a `.md` file, relative to the workspace root. */
  file?: string;
  docId?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  pageSize?: string;
  orientation?: string;
  /** Open with a title page. Defaults to true. */
  cover?: boolean;
  /** Insert a self-filling contents page. Defaults to false. */
  contents?: boolean;
};

export type ImportResult = {
  id: string;
  entry: string;
  title: string;
  blocks: number;
  /** Local images copied into `docs/<id>/assets/`. */
  assets: string[];
  /** Image references that could not be resolved and were left as written. */
  missingAssets: string[];
};

const REMOTE_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function slugify(value: string, fallback = 'document'): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // Non-Latin titles slug down to nothing; a caller-supplied id is the fix.
  return DOC_ID_RE.test(slug) ? slug : fallback;
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new OpsError(409, `could not find a free id for ${base}`);
}

function identFor(index: number): string {
  return `figure${index + 1}`;
}

/**
 * Reads markdown and writes a real open-doc document: `flow()` body, inline
 * styles, a cover, and any local images copied into the document's own assets
 * folder. Nothing about the result is special-cased — it is the same shape an
 * agent would have written by hand, and every editing surface works on it.
 */
export async function importMarkdown(
  ctx: ApiContext,
  opts: ImportMarkdownOptions,
): Promise<ImportResult> {
  const sourceFile = opts.file ? path.resolve(ctx.userCwd, opts.file) : null;
  if (sourceFile && !sourceFile.startsWith(ctx.userCwd + path.sep)) {
    throw new OpsError(400, `file must sit inside the workspace: ${opts.file}`);
  }

  let markdown = opts.markdown;
  if (markdown === undefined) {
    if (!sourceFile) throw new OpsError(400, 'pass either `markdown` or `file`');
    try {
      markdown = await fs.readFile(sourceFile, 'utf8');
    } catch {
      throw new OpsError(404, `file not found: ${opts.file}`);
    }
  }
  if (markdown.trim() === '') throw new OpsError(422, 'the markdown is empty');

  const parsed = parseMarkdown(markdown);

  const fallbackName = sourceFile ? path.basename(sourceFile).replace(/\.mdx?$/i, '') : 'document';
  const requestedId = opts.docId ?? slugify(opts.title ?? parsed.frontmatter.title ?? fallbackName);
  if (opts.docId && !DOC_ID_RE.test(opts.docId)) {
    throw new OpsError(400, `invalid document id: ${opts.docId}`);
  }
  const docId = opts.docId ?? uniqueId(requestedId, new Set(await listDocIds(ctx)));

  const baseDir = sourceFile ? path.dirname(sourceFile) : ctx.userCwd;
  const images = new Map<string, ImportImage>();
  const missing: string[] = [];
  const staged: Array<{ from: string; filename: string }> = [];
  const usedNames = new Set<string>();

  for (const src of new Set(collectImageSources(parsed.blocks))) {
    if (REMOTE_RE.test(src)) continue;
    const from = path.resolve(baseDir, src.split(/[?#]/)[0]);
    if (!from.startsWith(ctx.userCwd + path.sep) || !existsSync(from)) {
      missing.push(src);
      continue;
    }
    const safe = validateAssetName(path.basename(from));
    if (!safe) {
      missing.push(src);
      continue;
    }
    const filename = usedNames.has(safe) ? `${images.size + 1}-${safe}` : safe;
    usedNames.add(filename);
    images.set(src, { source: src, ident: identFor(images.size), filename });
    staged.push({ from, filename });
  }

  const generated = generateDocumentSource(parsed, {
    docId,
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.subtitle !== undefined ? { subtitle: opts.subtitle } : {}),
    ...(opts.author !== undefined ? { author: opts.author } : {}),
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
    ...(opts.pageSize !== undefined ? { pageSize: opts.pageSize } : {}),
    ...(opts.orientation !== undefined ? { orientation: opts.orientation } : {}),
    ...(opts.cover !== undefined ? { cover: opts.cover } : {}),
    ...(opts.contents !== undefined ? { contents: opts.contents } : {}),
    createdAt: new Date().toISOString(),
    images,
  });

  const created = await createDocument(ctx, docId, generated.source);

  if (staged.length > 0) {
    const assetsDir = path.join(ctx.docsRoot, docId, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });
    for (const { from, filename } of staged) {
      await fs.copyFile(from, path.join(assetsDir, filename));
    }
  }

  return {
    id: created.id,
    entry: created.entry,
    title: generated.title,
    blocks: generated.blockCount,
    assets: staged.map((asset) => asset.filename),
    missingAssets: missing,
  };
}

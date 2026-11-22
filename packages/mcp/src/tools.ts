import { Buffer } from 'node:buffer';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  type ApiContext,
  addComment,
  checkLayout,
  createDocument,
  createFolder,
  createFromTemplate,
  deleteAsset,
  deleteDocument,
  diffDocument,
  duplicateDocument,
  EXPORT_FORMATS,
  editDocument,
  exportDocument,
  fileDocument,
  findAssetUsages,
  importDocx,
  importMarkdown,
  listAssets,
  listDocuments,
  listFolders,
  listTemplates,
  listThemes,
  markTranslated,
  OpsError,
  ORIENTATIONS,
  outlineDocument,
  PAGE_SIZE_NAMES,
  readDocument,
  readDocumentLines,
  readText,
  readTheme,
  renameDocument,
  renderDocPage,
  searchDocument,
  translationStatus,
  writeAsset,
  writeDocument,
  writeText,
} from '@open-document/core/ops';
import { z } from 'zod';

export type FileChangeTap = (event: 'add' | 'change' | 'unlink', filePath: string) => void;

/**
 * Every tool is a thin wrapper over `@open-document/core/ops` — the same functions
 * the dev server calls for the browser. An agent and a person editing the same
 * workspace therefore go through one implementation, including its conflict
 * checks.
 */

const LOC = z.object({
  line: z.number().int().positive().describe('1-based line in the document source'),
  column: z.number().int().nonnegative().describe('column reported by data-od-loc'),
});

/** Tools return text; JSON payloads go through as pretty-printed text blocks. */
function ok(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

/**
 * An OpsError is a refusal the caller can act on (404 wrong id, 409 stale
 * write), so it comes back as a tool error rather than a transport failure.
 */
async function runTool(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof OpsError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `${err.status}: ${err.message}` }],
      };
    }
    throw err;
  }
}

export function registerTools(
  server: McpServer,
  ctx: ApiContext,
  onFileChange?: FileChangeTap,
  /**
   * Awaited before every tool call. The stdio entry uses it to settle which
   * workspace `ctx` points at, and to refuse the call when there is none.
   */
  ensureWorkspace?: () => Promise<void>,
): void {
  const run = (fn: () => Promise<unknown>) =>
    runTool(async () => {
      await ensureWorkspace?.();
      return fn();
    });
  const docEntry = (docId: string) => path.join(ctx.docsRoot, docId, 'index.tsx');
  const notify = (event: 'add' | 'change' | 'unlink', filePath: string) => {
    onFileChange?.(event, filePath);
  };

  server.registerTool(
    'list_documents',
    {
      title: 'List documents',
      description:
        'Every document in the workspace with its id, title, theme, and folder. Start here.',
      inputSchema: z.object({}),
    },
    () => run(() => listDocuments(ctx)),
  );

  server.registerTool(
    'read_document',
    {
      title: 'Read document source',
      description:
        'The TSX source of a document. A document is React — read it before editing it. For a long document, call outline_document first and pass fromLine/toLine to read only the part you change; leave both out for the whole file.',
      inputSchema: z.object({
        docId: z.string(),
        fromLine: z.number().int().positive().optional().describe('first line to read, 1-based'),
        toLine: z.number().int().positive().optional().describe('last line to read, inclusive'),
      }),
    },
    ({ docId, fromLine, toLine }) =>
      run(() =>
        fromLine === undefined && toLine === undefined
          ? readDocument(ctx, docId)
          : readDocumentLines(ctx, docId, fromLine, toLine),
      ),
  );

  server.registerTool(
    'outline_document',
    {
      title: 'Outline document source',
      description:
        'Where things are in a document without its source: line count, each top-level block (design, components, pages) with its line range, and every h1–h3 with its line. Start here with a long document, then read_document with fromLine/toLine.',
      inputSchema: z.object({ docId: z.string() }),
    },
    ({ docId }) => run(() => outlineDocument(ctx, docId)),
  );

  server.registerTool(
    'search_document',
    {
      title: 'Search document source',
      description:
        'Every line of a document’s source that contains some exact text (a colour such as #fff, a component, a phrase), with its line number. Finds what to change across a long document without reading all of it.',
      inputSchema: z.object({
        docId: z.string(),
        text: z.string().describe('exact, case-sensitive text to look for'),
      }),
    },
    ({ docId, text }) => run(() => searchDocument(ctx, docId, text)),
  );

  server.registerTool(
    'edit_document',
    {
      title: 'Replace exact text in the source',
      description:
        'Change one exact piece of a document’s source: `find` (copied exactly from read_document or search_document, spacing and quotes included) becomes `replace`. `find` must occur once — pass fromLine/toLine (the range you read) when the same text appears elsewhere — unless `all` is set to change every occurrence. Use it for small changes instead of rewriting the whole file with write_document.',
      inputSchema: z.object({
        docId: z.string(),
        find: z.string().describe('the exact text to change'),
        replace: z.string().describe('what it becomes'),
        all: z.boolean().optional().describe('change every occurrence, not just one'),
        fromLine: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('look for `find` only from this line (1-based), e.g. the range you read'),
        toLine: z.number().int().positive().optional().describe('…to this line, inclusive'),
        expectedHash: z
          .string()
          .optional()
          .describe(
            'optional 16-char hash from read_document; refuses the edit if the file changed',
          ),
      }),
    },
    ({ docId, find, replace, all, expectedHash, fromLine, toLine }) =>
      run(async () => {
        const res = await editDocument(ctx, docId, find, replace, {
          all,
          expectedHash,
          fromLine,
          toLine,
        });
        notify('change', docEntry(docId));
        return res;
      }),
  );

  server.registerTool(
    'create_document',
    {
      title: 'Create document',
      description:
        'Write a new docs/<id>/index.tsx. Fails if the id is taken. Read a theme first and follow its components.',
      inputSchema: z.object({
        docId: z.string().describe('kebab-case folder name under docs/'),
        source: z.string().describe('complete TSX module source'),
      }),
    },
    ({ docId, source }) =>
      run(async () => {
        const res = await createDocument(ctx, docId, source);
        notify('add', docEntry(res.id));
        return res;
      }),
  );

  server.registerTool(
    'list_templates',
    {
      title: 'List templates',
      description:
        'Templates a new document can start from — built-in and the workspace’s own templates/<name>/. The `name` is what create_from_template takes.',
      inputSchema: z.object({}),
    },
    () => run(() => listTemplates(ctx)),
  );

  server.registerTool(
    'create_from_template',
    {
      title: 'Create document from template',
      description:
        'Copy a template into docs/<id>/, retitled and dated today. Start here rather than from a blank file when a template fits; call list_templates for the names.',
      inputSchema: z.object({
        template: z.string().describe('a name from list_templates'),
        docId: z
          .string()
          .optional()
          .describe('kebab-case folder name; derived from the title when omitted'),
        title: z.string().optional().describe('meta.title of the new document'),
      }),
    },
    ({ template, docId, title }) =>
      run(async () => {
        const res = await createFromTemplate(ctx, {
          template,
          ...(docId ? { docId } : {}),
          ...(title ? { title } : {}),
        });
        notify('add', docEntry(res.id));
        return res;
      }),
  );

  server.registerTool(
    'write_document',
    {
      title: 'Overwrite document source',
      description:
        'Replace a document’s source. Pass `expected` (the source you read) or `expectedHash` (the 16-char SHA-256 hash returned by read_document) to be refused instead of clobbering a concurrent edit.',
      inputSchema: z.object({
        docId: z.string(),
        source: z.string(),
        expected: z
          .string()
          .optional()
          .describe('the source you last read; enables conflict check'),
        expectedHash: z
          .string()
          .optional()
          .describe(
            'the 16-char hash returned by read_document; enables lightweight conflict check',
          ),
      }),
    },
    ({ docId, source, expected, expectedHash }) =>
      run(async () => {
        const res = await writeDocument(ctx, docId, source, expected, expectedHash);
        notify('change', docEntry(docId));
        return res;
      }),
  );

  server.registerTool(
    'rename_document',
    {
      title: 'Rename document',
      description: 'Rewrites meta.title in the source. The document id never changes.',
      inputSchema: z.object({
        docId: z.string(),
        title: z.string(),
        expectedHash: z
          .string()
          .optional()
          .describe('optional 16-char hash from read_document; refuses write if file changed'),
      }),
    },
    ({ docId, title, expectedHash }) =>
      run(async () => {
        const res = await renameDocument(ctx, docId, title, { expectedHash });
        notify('change', docEntry(docId));
        return res;
      }),
  );

  server.registerTool(
    'duplicate_document',
    {
      title: 'Duplicate document',
      description: 'Copies the folder to a fresh id, lands in the same folder as the original.',
      inputSchema: z.object({ docId: z.string(), newId: z.string().optional() }),
    },
    ({ docId, newId }) =>
      run(async () => {
        const res = await duplicateDocument(ctx, docId, newId);
        notify('add', docEntry(res.id));
        return res;
      }),
  );

  server.registerTool(
    'delete_document',
    {
      title: 'Delete document',
      description: 'Removes the document folder from disk. Not reversible.',
      inputSchema: z.object({ docId: z.string() }),
    },
    ({ docId }) =>
      run(async () => {
        await deleteDocument(ctx, docId);
        notify('unlink', docEntry(docId));
        return { ok: true };
      }),
  );

  server.registerTool(
    'read_text',
    {
      title: 'Read text at a location',
      description:
        'The editable text runs at a line:column. Use before write_text to learn the run index and current value.',
      inputSchema: z.object({
        docId: z.string(),
        locs: z.array(LOC).min(1),
        shown: z.string().optional().describe('rendered text, disambiguates helper components'),
        prop: z
          .string()
          .optional()
          .describe(
            'a path into the element’s attributes for words a component prints from a prop, e.g. `caption` or `columns.2.label` (the `data-od-prop` on the rendered element)',
          ),
      }),
    },
    ({ docId, locs, shown, prop }) => run(() => readText(ctx, docId, locs, shown, prop)),
  );

  server.registerTool(
    'write_text',
    {
      title: 'Replace text at a location',
      description:
        'Surgical edit of one text run, leaving surrounding markup untouched. Pass `expected` (or `expectedHash`) so a stale write is refused. A run that read_text returned with `segments` (code, emphasis, links) must be written with `segments` too, or it is refused rather than losing its formatting.',
      inputSchema: z.object({
        docId: z.string(),
        loc: LOC,
        text: z.string(),
        index: z.number().int().nonnegative().optional().describe('which run, for mixed content'),
        expected: z.string().optional(),
        expectedHash: z
          .string()
          .optional()
          .describe(
            'optional 16-char hash from read_document or read_text; refuses write if file changed',
          ),
        segments: z
          .array(
            z.object({
              text: z.string(),
              bold: z.boolean().optional(),
              italic: z.boolean().optional(),
              code: z.boolean().optional(),
              href: z.string().optional(),
            }),
          )
          .optional()
          .describe('the run as formatted pieces, in order; their texts concatenate to `text`'),
        prop: z.string().optional().describe('as in read_text'),
      }),
    },
    ({ docId, loc, text, index, expected, expectedHash, segments, prop }) =>
      run(async () => {
        const res = await writeText(ctx, docId, loc, text, {
          index,
          expected,
          expectedHash,
          segments,
          prop,
        });
        notify('change', docEntry(docId));
        return res;
      }),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Leave a comment marker',
      description:
        'Anchors a @doc-comment note in the source for a later pass to act on, without changing the copy.',
      inputSchema: z.object({
        docId: z.string(),
        loc: LOC,
        note: z.string(),
        hint: z.string().optional(),
        expectedHash: z
          .string()
          .optional()
          .describe(
            'optional 16-char hash from read_document or read_text; refuses write if file changed',
          ),
      }),
    },
    ({ docId, loc, note, hint, expectedHash }) =>
      run(async () => {
        const res = await addComment(ctx, docId, loc, note, hint, { expectedHash });
        notify('change', docEntry(docId));
        return res;
      }),
  );

  server.registerTool(
    'list_themes',
    {
      title: 'List themes',
      description: 'House styles available in this workspace.',
      inputSchema: z.object({}),
    },
    () => run(() => listThemes(ctx)),
  );

  server.registerTool(
    'read_theme',
    {
      title: 'Read a theme',
      description:
        'The theme document: palette, type scale, page setup, and paste-ready components. Read this before writing a document that declares the theme.',
      inputSchema: z.object({ themeId: z.string() }),
    },
    ({ themeId }) => run(() => readTheme(ctx, themeId)),
  );

  server.registerTool(
    'list_assets',
    {
      title: 'List assets',
      description: 'Images in a scope — a document id, or "global" for the shared directory.',
      inputSchema: z.object({ scope: z.string().default('global') }),
    },
    ({ scope }) => run(() => listAssets(ctx, scope)),
  );

  server.registerTool(
    'upload_asset',
    {
      title: 'Upload an asset',
      description: 'Writes a base64 payload into the scope’s assets directory.',
      inputSchema: z.object({
        scope: z.string(),
        filename: z.string(),
        base64: z.string().describe('file contents, base64 encoded'),
      }),
    },
    ({ scope, filename, base64 }) =>
      run(() => writeAsset(ctx, scope, filename, Buffer.from(base64, 'base64'))),
  );

  server.registerTool(
    'find_asset_usages',
    {
      title: 'Find asset usages',
      description: 'Which documents import an asset. Check this before deleting one.',
      inputSchema: z.object({ scope: z.string(), filename: z.string() }),
    },
    ({ scope, filename }) => run(() => findAssetUsages(ctx, scope, filename)),
  );

  server.registerTool(
    'delete_asset',
    {
      title: 'Delete an asset',
      description: 'Removes the file. Run find_asset_usages first.',
      inputSchema: z.object({ scope: z.string(), filename: z.string() }),
    },
    ({ scope, filename }) =>
      run(() => deleteAsset(ctx, scope, filename).then(() => ({ ok: true }))),
  );

  server.registerTool(
    'list_folders',
    {
      title: 'List folders',
      description: 'The folder manifest and which document sits in which folder.',
      inputSchema: z.object({}),
    },
    () => run(() => listFolders(ctx)),
  );

  server.registerTool(
    'create_folder',
    {
      title: 'Create folder',
      description: 'Adds a folder to the manifest.',
      inputSchema: z.object({
        name: z.string(),
        icon: z
          .object({ type: z.enum(['emoji', 'color']), value: z.string() })
          .optional()
          .describe('defaults to a grey colour chip'),
      }),
    },
    ({ name, icon }) =>
      run(async () => {
        const res = await createFolder(ctx, name, icon);
        notify('change', path.join(ctx.docsRoot, '.folders.json'));
        return res;
      }),
  );

  server.registerTool(
    'file_document',
    {
      title: 'File a document',
      description: 'Assigns a document to a folder, or unfiles it with folderId: null.',
      inputSchema: z.object({ docId: z.string(), folderId: z.string().nullable() }),
    },
    ({ docId, folderId }) =>
      run(async () => {
        await fileDocument(ctx, docId, folderId);
        notify('change', path.join(ctx.docsRoot, '.folders.json'));
        return { ok: true };
      }),
  );

  server.registerTool(
    'check_layout',
    {
      title: 'Check the layout',
      description:
        'Renders the document at true page size and reports what is wrong with the sheets — content clipped by the page edge, a blank page, a heading stranded at the foot of a page, unreadable type, an image that failed to load. Findings carry a `loc` (line:column) pointing at the source. Run this after writing or editing a document: it is the only way to see what you actually produced. With `maxPages`, going over is an error and `budget` says how many pages must go and how many each top-level section takes.',
      inputSchema: z.object({
        docId: z.string(),
        maxPages: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Page limit the document must fit in'),
      }),
    },
    ({ docId, maxPages }) => run(() => checkLayout(ctx, docId, { maxPages })),
  );

  server.registerTool(
    'translation_status',
    {
      title: 'Translations and what they are behind',
      description:
        "Every document that declares `meta.translationOf` (the source document's id) and `meta.translatedAt` (the source commit it matches), with its state: current, stale (the source changed since), unsynced (no translatedAt yet), missing-source, unknown-revision or no-git. Stale ones list the changed source files and commits. Pass `docId` with `diff: true` to get the source's changes as a unified diff — translate only those, then call mark_translated.",
      inputSchema: z.object({
        docId: z.string().optional().describe('One translation; omit for all'),
        diff: z
          .boolean()
          .optional()
          .describe("Include the source's unified diff since translatedAt"),
      }),
    },
    ({ docId, diff }) => run(() => translationStatus(ctx, { docId, diff })),
  );

  server.registerTool(
    'mark_translated',
    {
      title: 'Mark a translation as up to date',
      description:
        "Sets the translation's `meta.translatedAt` to the source's last commit (or `revision`). Call it after the translation has caught up with every change translation_status listed. Refuses while the source has uncommitted changes.",
      inputSchema: z.object({
        docId: z.string().describe('The translation, not the source'),
        revision: z
          .string()
          .optional()
          .describe('Source commit it now matches; defaults to the last one'),
      }),
    },
    ({ docId, revision }) => run(() => markTranslated(ctx, docId, revision)),
  );

  server.registerTool(
    'render_page',
    {
      title: 'Screenshot a page',
      description:
        'A PNG of one sheet at true page size, exactly as it prints. Use it when check_layout reports something you need to look at, or to confirm a design change landed.',
      inputSchema: z.object({
        docId: z.string(),
        page: z.number().int().positive().describe('1-based page number'),
      }),
    },
    async ({ docId, page }) => {
      try {
        const shot = await renderDocPage(ctx, docId, page);
        return {
          content: [
            { type: 'image' as const, data: shot.base64, mimeType: shot.mimeType },
            {
              type: 'text' as const,
              text: `${docId} page ${shot.page} of ${shot.pageCount}`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof OpsError) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `${err.status}: ${err.message}` }],
          };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'export_document',
    {
      title: 'Export a document',
      description:
        'Writes the document to disk headlessly — pdf, html, one png per page, or docx (structure Word flows itself, for review in Word). The output directory must stay inside the workspace.',
      inputSchema: z.object({
        docId: z.string(),
        format: z.enum(EXPORT_FORMATS).default('pdf'),
        outDir: z.string().optional().describe('relative to the workspace root; defaults to `out`'),
        each: z
          .boolean()
          .optional()
          .describe('one copy per row of the document’s `records` — certificates, letters, quotes'),
        name: z
          .string()
          .optional()
          .describe(
            'with each: file name pattern, `{column}` for a value and `{#}` for the row number',
          ),
      }),
    },
    ({ docId, format, outDir, each, name }) =>
      run(() =>
        exportDocument(ctx, docId, {
          format,
          outDir,
          ...(each ? { each } : {}),
          ...(name ? { name } : {}),
        }),
      ),
  );

  server.registerTool(
    'diff_document',
    {
      title: 'What changed since a revision',
      description:
        'Renders the document as it is and as it was at a git revision (default HEAD), pairs the pages by content, and reports each page as same, changed, added or removed — with the lines of text added and removed and the changed regions. Also writes a self-contained HTML report with before/after pictures for a human reviewer. Use it to summarise your edits before handing a document back, or to answer "what changed since main".',
      inputSchema: z.object({
        docId: z.string(),
        since: z.string().optional().describe('git revision to compare against; defaults to HEAD'),
        outDir: z.string().optional().describe('relative to the workspace root; defaults to `out`'),
      }),
    },
    ({ docId, since, outDir }) =>
      run(() =>
        diffDocument(ctx, docId, {
          ...(since ? { since } : {}),
          ...(outDir ? { outDir } : {}),
        }),
      ),
  );

  server.registerTool(
    'import_markdown',
    {
      title: 'Import Markdown',
      description:
        'Turns Markdown into a real document under docs/ — flow() body, cover page, local images copied into the document’s assets. Use this instead of hand-writing TSX when the user already has the content written.',
      inputSchema: z.object({
        markdown: z.string().optional().describe('the Markdown itself'),
        file: z.string().optional().describe('path to a .md file inside the workspace'),
        docId: z.string().optional().describe('defaults to a slug of the title'),
        title: z.string().optional(),
        lang: z
          .string()
          .optional()
          .describe(
            'BCP 47 tag, e.g. zh-Hant-TW; detected for Chinese, Japanese and Korean when omitted',
          ),
        subtitle: z.string().optional(),
        author: z.string().optional(),
        theme: z.string().optional(),
        pageSize: z.enum(PAGE_SIZE_NAMES).optional(),
        orientation: z.enum(ORIENTATIONS).optional(),
        cover: z.boolean().optional().describe('open with a title page; defaults to true'),
        contents: z.boolean().optional().describe('add a self-filling contents page'),
      }),
    },
    (args) =>
      run(async () => {
        const res = await importMarkdown(ctx, args);
        notify('add', docEntry(res.id));
        return res;
      }),
  );

  server.registerTool(
    'import_docx',
    {
      title: 'Import Word document',
      description:
        'Turns a Word .docx file into a real document under docs/, the same way import_markdown does — headings from Word’s heading styles, lists, tables, links, embedded pictures copied into the document’s assets. `warnings` lists what Word had that the document could not hold (text boxes, footnotes, comments, tracked changes); tell the user about them.',
      inputSchema: z.object({
        file: z.string().describe('path to a .docx file inside the workspace'),
        docId: z.string().optional().describe('defaults to a slug of the title'),
        title: z.string().optional(),
        lang: z
          .string()
          .optional()
          .describe(
            'BCP 47 tag, e.g. zh-Hant-TW; detected for Chinese, Japanese and Korean when omitted',
          ),
        subtitle: z.string().optional(),
        author: z.string().optional(),
        theme: z.string().optional(),
        pageSize: z.enum(PAGE_SIZE_NAMES).optional(),
        orientation: z.enum(ORIENTATIONS).optional(),
        cover: z.boolean().optional().describe('open with a title page; defaults to true'),
        contents: z.boolean().optional().describe('add a self-filling contents page'),
      }),
    },
    (args) =>
      run(async () => {
        const res = await importDocx(ctx, args);
        notify('add', docEntry(res.id));
        return res;
      }),
  );
}

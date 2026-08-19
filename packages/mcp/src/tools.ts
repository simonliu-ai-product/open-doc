import { Buffer } from 'node:buffer';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  type ApiContext,
  addComment,
  checkLayout,
  createDocument,
  createFolder,
  deleteAsset,
  deleteDocument,
  duplicateDocument,
  exportDocument,
  fileDocument,
  findAssetUsages,
  importMarkdown,
  listAssets,
  listDocuments,
  listFolders,
  listThemes,
  OpsError,
  readDocument,
  readText,
  readTheme,
  renameDocument,
  renderDocPage,
  writeAsset,
  writeDocument,
  writeText,
} from '@open-document/core/ops';
import { z } from 'zod';

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
async function run(fn: () => Promise<unknown>) {
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

export function registerTools(server: McpServer, ctx: ApiContext): void {
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
        'The full TSX source of a document. A document is React — read it before editing it.',
      inputSchema: z.object({ docId: z.string() }),
    },
    ({ docId }) => run(() => readDocument(ctx, docId)),
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
    ({ docId, source }) => run(() => createDocument(ctx, docId, source)),
  );

  server.registerTool(
    'write_document',
    {
      title: 'Overwrite document source',
      description:
        'Replace a document’s source. Pass `expected` (the source you read) to be refused instead of clobbering a concurrent edit.',
      inputSchema: z.object({
        docId: z.string(),
        source: z.string(),
        expected: z
          .string()
          .optional()
          .describe('the source you last read; enables conflict check'),
      }),
    },
    ({ docId, source, expected }) => run(() => writeDocument(ctx, docId, source, expected)),
  );

  server.registerTool(
    'rename_document',
    {
      title: 'Rename document',
      description: 'Rewrites meta.title in the source. The document id never changes.',
      inputSchema: z.object({ docId: z.string(), title: z.string() }),
    },
    ({ docId, title }) => run(() => renameDocument(ctx, docId, title)),
  );

  server.registerTool(
    'duplicate_document',
    {
      title: 'Duplicate document',
      description: 'Copies the folder to a fresh id, lands in the same folder as the original.',
      inputSchema: z.object({ docId: z.string(), newId: z.string().optional() }),
    },
    ({ docId, newId }) => run(() => duplicateDocument(ctx, docId, newId)),
  );

  server.registerTool(
    'delete_document',
    {
      title: 'Delete document',
      description: 'Removes the document folder from disk. Not reversible.',
      inputSchema: z.object({ docId: z.string() }),
    },
    ({ docId }) => run(() => deleteDocument(ctx, docId).then(() => ({ ok: true }))),
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
      }),
    },
    ({ docId, locs, shown }) => run(() => readText(ctx, docId, locs, shown)),
  );

  server.registerTool(
    'write_text',
    {
      title: 'Replace text at a location',
      description:
        'Surgical edit of one text run, leaving surrounding markup untouched. Pass `expected` so a stale write is refused.',
      inputSchema: z.object({
        docId: z.string(),
        loc: LOC,
        text: z.string(),
        index: z.number().int().nonnegative().optional().describe('which run, for mixed content'),
        expected: z.string().optional(),
      }),
    },
    ({ docId, loc, text, index, expected }) =>
      run(() => writeText(ctx, docId, loc, text, { index, expected })),
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
      }),
    },
    ({ docId, loc, note, hint }) => run(() => addComment(ctx, docId, loc, note, hint)),
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
    ({ name, icon }) => run(() => createFolder(ctx, name, icon)),
  );

  server.registerTool(
    'file_document',
    {
      title: 'File a document',
      description: 'Assigns a document to a folder, or unfiles it with folderId: null.',
      inputSchema: z.object({ docId: z.string(), folderId: z.string().nullable() }),
    },
    ({ docId, folderId }) =>
      run(() => fileDocument(ctx, docId, folderId).then(() => ({ ok: true }))),
  );

  server.registerTool(
    'check_layout',
    {
      title: 'Check the layout',
      description:
        'Renders the document at true page size and reports what is wrong with the sheets — content clipped by the page edge, a blank page, a heading stranded at the foot of a page, unreadable type, an image that failed to load. Findings carry a `loc` (line:column) pointing at the source. Run this after writing or editing a document: it is the only way to see what you actually produced.',
      inputSchema: z.object({ docId: z.string() }),
    },
    ({ docId }) => run(() => checkLayout(ctx, docId)),
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
        'Writes the document to disk headlessly — pdf, html, or one png per page. The output directory must stay inside the workspace.',
      inputSchema: z.object({
        docId: z.string(),
        format: z.enum(['pdf', 'html', 'png']).default('pdf'),
        outDir: z.string().optional().describe('relative to the workspace root; defaults to `out`'),
      }),
    },
    ({ docId, format, outDir }) => run(() => exportDocument(ctx, docId, { format, outDir })),
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
        subtitle: z.string().optional(),
        author: z.string().optional(),
        theme: z.string().optional(),
        pageSize: z.enum(['A4', 'Letter', 'A5', 'Legal']).optional(),
        cover: z.boolean().optional().describe('open with a title page; defaults to true'),
        contents: z.boolean().optional().describe('add a self-filling contents page'),
      }),
    },
    (args) => run(() => importMarkdown(ctx, args)),
  );
}

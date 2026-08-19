/**
 * Document operations, independent of transport. The dev API serves them over
 * HTTP for the browser; `@open-document/mcp` exposes the same functions as MCP tools
 * so an agent and a person act on one implementation.
 */

export { type ApiContext, makeContext } from '../vite/routes/context.ts';
export {
  createDocument,
  type DocumentSummary,
  deleteDocument,
  docDir,
  duplicateDocument,
  listDocIds,
  listDocuments,
  OpsError,
  readDocument,
  renameDocument,
  resolveEntry,
  writeDocument,
} from './documents.ts';
export {
  type ImportMarkdownOptions,
  type ImportResult,
  importMarkdown,
  slugify,
} from './import.ts';
export {
  checkLayout,
  closeRenderSession,
  type ExportFormat,
  type ExportResult,
  exportDocument,
  type LayoutFinding,
  type LayoutReport,
  renderDocPage,
} from './layout.ts';
export {
  type AssetSummary,
  createFolder,
  deleteAsset,
  fileDocument,
  findAssetUsages,
  listAssets,
  listFolders,
  listThemes,
  readTheme,
  type ThemeSummary,
  writeAsset,
} from './library.ts';
export { addComment, type Loc, readText, writeText } from './text.ts';

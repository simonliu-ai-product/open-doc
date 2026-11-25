/**
 * Document operations, independent of transport. The dev API serves them over
 * HTTP for the browser; `@open-document/mcp` exposes the same functions as MCP tools
 * so an agent and a person act on one implementation.
 */

export {
  ORIENTATIONS,
  type Orientation,
  PAGE_SIZE_NAMES,
  type PageSizeName,
} from '../app/lib/sdk.ts';
export { type ApiContext, makeContext } from '../vite/routes/context.ts';
export {
  type ChangesResult,
  listRevisions,
  type Revision,
  readChanges,
  revertChange,
} from './changes.ts';
export {
  assertExpectedSource,
  hashSource,
  withFileLock,
} from './concurrency.ts';
export { type DiffResult, diffDocument, type PageChange, type PageStatus } from './diff.ts';
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
  type ImportDocxOptions,
  type ImportMarkdownOptions,
  type ImportResult,
  importDocx,
  importMarkdown,
  slugify,
} from './import.ts';
export {
  type CheckLayoutOptions,
  checkLayout,
  closeRenderSession,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportResult,
  exportDocument,
  type LayoutFinding,
  type LayoutReport,
  type PageBudget,
  type ProofreadFinding,
  type ProofreadReport,
  proofreadDocument,
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
export {
  type DocumentOutline,
  editDocument,
  type OutlineBlock,
  type OutlineHeading,
  outlineDocument,
  outlineSource,
  readDocumentLines,
  searchDocument,
} from './source.ts';
export {
  createFromTemplate,
  listTemplates,
  suggestDocId,
  type TemplateSummary,
} from './templates.ts';
export { addComment, type Loc, readText, writeEdits, writeText, writeTexts } from './text.ts';
export {
  markTranslated,
  type TranslationState,
  type TranslationStatus,
  translationStatus,
} from './translations.ts';

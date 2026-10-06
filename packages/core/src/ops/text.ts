import fs from 'node:fs/promises';
import type { StyleInfo } from '../app/lib/inspector/format.ts';
import { insertMarker } from '../editing/comments.ts';
import {
  replaceTextAt,
  replaceTextsAt,
  resolveTextTarget,
  type TextEdit,
  type TextEditOutcome,
  type TextSegment,
} from '../editing/edit-ops.ts';
import { readStyleAt, replaceEditsAt, type StyleEdit } from '../editing/style-ops.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { OpsError, resolveEntry } from './documents.ts';

export type Loc = { line: number; column: number };

async function sourceOf(
  ctx: ApiContext,
  docId: string,
): Promise<{ entry: string; source: string }> {
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  return { entry, source: await fs.readFile(entry, 'utf8') };
}

/**
 * Resolves a `line:column` (or several candidates) to the editable text runs at
 * that spot. `shown` is the rendered text — when a clicked element belongs to a
 * local helper component, it is what decides which candidate was really meant.
 */
export async function readText(
  ctx: ApiContext,
  docId: string,
  locs: Loc[],
  shown?: string,
  prop?: string,
): Promise<unknown> {
  if (locs.length === 0) throw new OpsError(400, 'at least one loc is required');
  const { source } = await sourceOf(ctx, docId);
  const resolved = resolveTextTarget(source, locs, shown, prop);
  if (!resolved) throw new OpsError(404, 'no editable text at that location');
  return resolved;
}

/**
 * `expected` is the text the caller believes is there; when it no longer
 * matches the write is refused rather than silently overwriting someone else's
 * edit. `index` picks a run when the element mixes text and markup. A run that
 * carries code, emphasis or links must be written as `segments`, or the write
 * is refused rather than dropping the formatting.
 */
export async function writeText(
  ctx: ApiContext,
  docId: string,
  loc: Loc,
  text: string,
  opts: { index?: number; expected?: string; segments?: TextSegment[]; prop?: string } = {},
): Promise<{ ok: true }> {
  const { entry, source } = await sourceOf(ctx, docId);
  const result = replaceTextAt(source, loc, text, opts);
  if (!result.ok) throw new OpsError(result.status, result.error);
  if (result.source !== source) await fs.writeFile(entry, result.source, 'utf8');
  return { ok: true };
}

/**
 * Several run replacements in one read and one write, so an editing session
 * that touched five paragraphs lands as a single hot reload rather than five
 * that each re-paginate the document. Per-edit failures are reported, not
 * thrown: the edits that still apply are written.
 */
export async function writeTexts(
  ctx: ApiContext,
  docId: string,
  edits: TextEdit[],
): Promise<{ results: TextEditOutcome[] }> {
  if (edits.length === 0) throw new OpsError(400, 'at least one edit is required');
  const { entry, source } = await sourceOf(ctx, docId);
  const result = replaceTextsAt(source, edits);
  if (result.source !== source) await fs.writeFile(entry, result.source, 'utf8');
  return { results: result.results };
}

/** What the element at `loc` sets in its `style`, key by key, for the element panel's Format section. */
export async function readStyle(
  ctx: ApiContext,
  docId: string,
  loc: Loc,
  tag: string,
): Promise<StyleInfo> {
  const { source } = await sourceOf(ctx, docId);
  return readStyleAt(source, loc, tag);
}

/**
 * One save from the element panel: retyped text and style changes, located
 * against the same read of the file and written once. Per-edit failures are
 * reported, not thrown, like `writeTexts`.
 */
export async function writeEdits(
  ctx: ApiContext,
  docId: string,
  texts: TextEdit[],
  styles: StyleEdit[],
): Promise<{ texts: TextEditOutcome[]; styles: TextEditOutcome[] }> {
  if (texts.length + styles.length === 0) throw new OpsError(400, 'at least one edit is required');
  const { entry, source } = await sourceOf(ctx, docId);
  const result = replaceEditsAt(source, texts, styles);
  if (result.source !== source) await fs.writeFile(entry, result.source, 'utf8');
  return { texts: result.texts, styles: result.styles };
}

/** Leaves a `@doc-comment` marker in the source for a later agent pass to act on. */
export async function addComment(
  ctx: ApiContext,
  docId: string,
  loc: Loc,
  note: string,
  hint?: string,
): Promise<{ id: string }> {
  if (note.trim() === '') throw new OpsError(400, 'note is empty');
  const { entry, source } = await sourceOf(ctx, docId);
  const inserted = insertMarker(source, loc, note.trim(), hint);
  if (!inserted) {
    throw new OpsError(422, 'cannot anchor a comment here — pick the surrounding element');
  }
  await fs.writeFile(entry, inserted.source, 'utf8');
  return { id: inserted.id };
}

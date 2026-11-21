import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApiContext } from '../vite/routes/context.ts';
import { assertExpectedSource, hashSource, withFileLock } from './concurrency.ts';
import { OpsError, resolveEntry } from './documents.ts';

/**
 * Working on part of a document's source: its outline, a range of lines, the
 * lines that contain some text, and an exact find-and-replace. A long document
 * (hundreds of lines) need not be read whole to change a sentence or a colour,
 * which matters to an agent: whatever it reads is sent again on every later
 * model call.
 */

async function sourceOf(ctx: ApiContext, docId: string) {
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  return { entry, source: await fs.readFile(entry, 'utf8') };
}

export interface OutlineBlock {
  /** The declared name (`design`, `Cover`, `Body`), or `default` for the default export. */
  name: string;
  /** 1-based, inclusive. */
  lines: [number, number];
}

export interface OutlineHeading {
  level: 1 | 2 | 3;
  text: string;
  line: number;
}

export interface DocumentOutline {
  id: string;
  hash: string;
  totalLines: number;
  /** Top-level declarations in source order: the design, helper components, pages. */
  blocks: OutlineBlock[];
  /** h1–h3 in source order, with their text as a reader sees it. */
  headings: OutlineHeading[];
}

const DECLARATION = /^(?:export\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/;

/** The text inside a heading, without tags or `{…}` expressions, spaces collapsed. */
function headingText(inner: string): string {
  return inner
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where things are in a document's source, without the source itself. */
export async function outlineDocument(ctx: ApiContext, docId: string): Promise<DocumentOutline> {
  const { source } = await sourceOf(ctx, docId);
  return { id: docId, hash: hashSource(source), ...outlineSource(source) };
}

export function outlineSource(source: string): Omit<DocumentOutline, 'id' | 'hash'> {
  const lines = source.split('\n');
  const starts: Array<{ name: string; line: number }> = [];
  lines.forEach((l, i) => {
    const m = DECLARATION.exec(l);
    if (m) starts.push({ name: m[1] ?? '', line: i + 1 });
    else if (/^export\s+default\b/.test(l)) starts.push({ name: 'default', line: i + 1 });
  });
  const blocks = starts.map((s, i): OutlineBlock => {
    let end = (starts[i + 1]?.line ?? lines.length + 1) - 1;
    while (end > s.line && !lines[end - 1]?.trim()) end -= 1;
    return { name: s.name, lines: [s.line, end] };
  });
  const headings: OutlineHeading[] = [];
  const lineAt = (offset: number) => source.slice(0, offset).split('\n').length;
  for (const m of source.matchAll(/<h([1-3])\b(?:[^>{]|\{[^}]*\})*>([\s\S]*?)<\/h\1>/g)) {
    const text = headingText(m[2] ?? '');
    if (text)
      headings.push({
        level: Number(m[1]) as 1 | 2 | 3,
        text: text.slice(0, 160),
        line: lineAt(m.index),
      });
  }
  return { totalLines: lines.length, blocks, headings };
}

/** Lines `fromLine`–`toLine` (1-based, inclusive) exactly as they are; either end may be left out. */
export async function readDocumentLines(
  ctx: ApiContext,
  docId: string,
  fromLine?: number,
  toLine?: number,
): Promise<{
  id: string;
  entry: string;
  hash: string;
  lines: [number, number];
  totalLines: number;
  text: string;
}> {
  const { entry, source } = await sourceOf(ctx, docId);
  const all = source.split('\n');
  const from = Math.max(1, Math.floor(fromLine ?? 1));
  const to = Math.min(all.length, Math.floor(toLine ?? all.length));
  if (from > to)
    throw new OpsError(400, `lines ${from}–${to} are outside the document (${all.length} lines)`);
  return {
    id: docId,
    entry: path.relative(ctx.userCwd, entry),
    hash: hashSource(source),
    lines: [from, to],
    totalLines: all.length,
    text: all.slice(from - 1, to).join('\n'),
  };
}

/** Every line that contains `text` (exact, case-sensitive), at most `limit` of them; `total` counts all. */
export async function searchDocument(
  ctx: ApiContext,
  docId: string,
  text: string,
  limit = 60,
): Promise<{
  id: string;
  hash: string;
  matches: Array<{ line: number; text: string }>;
  total: number;
}> {
  if (!text) throw new OpsError(400, 'text to search for is required');
  const { source } = await sourceOf(ctx, docId);
  const matches: Array<{ line: number; text: string }> = [];
  let total = 0;
  source.split('\n').forEach((l, i) => {
    if (!l.includes(text)) return;
    total += 1;
    if (matches.length < limit)
      matches.push({ line: i + 1, text: l.length > 240 ? `${l.slice(0, 240)}…` : l });
  });
  return { id: docId, hash: hashSource(source), matches, total };
}

/**
 * Replaces `find` with `replace` in the source. `find` must occur exactly once,
 * unless `all` is set, which replaces every occurrence. Refused when the file
 * changed since `expectedHash` was read.
 */
export async function editDocument(
  ctx: ApiContext,
  docId: string,
  find: string,
  replace: string,
  opts: { all?: boolean; expectedHash?: string } = {},
): Promise<{ id: string; replaced: number; hash: string }> {
  if (!find)
    throw new OpsError(400, '`find` is empty: copy the exact text to change from the source');
  const entry = resolveEntry(ctx, docId);
  if (!entry) throw new OpsError(404, `document not found: ${docId}`);
  return withFileLock(entry, async () => {
    const source = await fs.readFile(entry, 'utf8');
    assertExpectedSource(source, { expectedHash: opts.expectedHash });
    const count = source.split(find).length - 1;
    if (count === 0) {
      throw new OpsError(
        404,
        '`find` is not in the document: copy it exactly, spacing and quotes included',
      );
    }
    if (count > 1 && !opts.all) {
      throw new OpsError(
        409,
        `\`find\` occurs ${count} times: include more of the text around it so it occurs once, or pass all to change every one`,
      );
    }
    const next = opts.all ? source.split(find).join(replace) : source.replace(find, () => replace);
    await fs.writeFile(entry, next, 'utf8');
    return { id: docId, replaced: opts.all ? count : 1, hash: hashSource(next) };
  });
}

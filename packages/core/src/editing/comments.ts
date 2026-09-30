import { randomUUID } from 'node:crypto';
import { type AstNode, findJsxAt, parseStrict } from './babel-walk.ts';

const MARKER_RE =
  /\{\/\*\s*@doc-comment\s+id="(c-[a-f0-9]+)"\s+ts="([^"]+)"\s+text="([A-Za-z0-9_-]+={0,2})"\s*\*\/\}/;

export type DocComment = { id: string; line: number; ts: string; note: string; hint?: string };

export function b64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function b64urlDecode(value: string): string {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

export function parseMarkers(source: string): DocComment[] {
  const comments: DocComment[] = [];
  source.split('\n').forEach((line, index) => {
    const match = MARKER_RE.exec(line);
    if (!match) return;
    const [, id, ts, payload] = match;
    try {
      const decoded = JSON.parse(b64urlDecode(payload)) as { note: string; hint?: string };
      comments.push({ id, line: index + 1, ts, note: decoded.note, hint: decoded.hint });
    } catch {}
  });
  return comments;
}

export function newCommentId(): string {
  return `c-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function markerFor(id: string, ts: string, note: string, hint?: string): string {
  const payload = b64urlEncode(JSON.stringify(hint ? { note, hint } : { note }));
  return `{/* @doc-comment id="${id}" ts="${ts}" text="${payload}" */}`;
}

function markerPattern(id: string): string {
  return `\\{\\/\\*\\s*@doc-comment\\s+id="${id}"\\s+ts="[^"]+"\\s+text="[A-Za-z0-9_\\-]+={0,2}"\\s*\\*\\/\\}`;
}

export function markerDeleteRegex(id: string): RegExp {
  return new RegExp(markerPattern(id));
}

/**
 * Removes a marker and the whitespace the insertion added — whichever side it
 * landed on — so deleting a comment restores the file byte for byte.
 */
export function removeMarker(source: string, id: string): string | null {
  const pattern = markerPattern(id);
  for (const re of [
    new RegExp(`[ \\t]*${pattern}\\n`),
    new RegExp(`\\n[ \\t]*${pattern}`),
    new RegExp(pattern),
  ]) {
    if (re.test(source)) return source.replace(re, '');
  }
  return null;
}

function indentOfLine(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const match = /^[ \t]*/.exec(source.slice(lineStart, offset));
  return match?.[0] ?? '';
}

/**
 * Splices the marker in as the **first child** of the target element. A
 * JSX-comment token outside a JSX child position parses as an empty object
 * literal and breaks the surrounding expression, so this never puts one before
 * an element.
 */
export function insertMarker(
  source: string,
  target: { line: number; column: number },
  note: string,
  hint?: string,
): { source: string; id: string } | null {
  const ast = parseStrict(source);
  if (!ast) return null;
  const element = findJsxAt(ast, target.line, target.column);
  if (!element) return null;

  const opening = element.openingElement as AstNode | undefined;
  if (!opening) return null;
  // A self-closing element has no children to host the marker; anchor to its
  // parent instead by refusing — the caller falls back to the nearest wrapper.
  if (opening.selfClosing === true) return null;

  const offset = opening.end;
  const id = newCommentId();
  const marker = markerFor(id, new Date().toISOString(), note, hint);
  const indent = indentOfLine(source, (element.start as number) ?? offset);
  const next = `${source.slice(0, offset)}\n${indent}  ${marker}${source.slice(offset)}`;
  return { source: next, id };
}

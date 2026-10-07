import { createHash } from 'node:crypto';
import { type AstNode, parseSource, walkJsx } from '../editing/babel-walk.ts';
import { taggableName } from '../vite/loc-tags-plugin.ts';

/**
 * How a change shows on the page: the element is new, rewritten, or something
 * was taken out just before or after it.
 */
export type ChangeMark = 'added' | 'changed' | 'removed-before' | 'removed-after';

export type ChangeTarget = { loc: string; mark: ChangeMark };

export type Hunk = {
  /** Stable across edits elsewhere in the file, so a revert names the hunk the viewer saw. */
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  removed: string[];
  added: string[];
  /** Elements on the page this hunk touches; empty when it is not drawn (meta, a style const). */
  targets: ChangeTarget[];
};

export type FileChange = {
  /** Relative to the document's folder: `index.tsx`, `data/rows.csv`. */
  path: string;
  status: 'modified' | 'added' | 'deleted';
  binary: boolean;
  hunks: Hunk[];
};

const REVIEW_MARKER = /^\s*\{\/\*\s*@doc-comment\s.*\*\/\}\s*$/;

/**
 * Drops hunks that only add or remove review comments. A comment is a marker
 * in the source, but it is a note about the document, not a change to it —
 * counting it would put every note left in review on the changes list too.
 */
export function withoutReviewMarkers(files: FileChange[]): FileChange[] {
  return files.map((file) => ({
    ...file,
    hunks: file.hunks.filter(
      (hunk) => ![...hunk.removed, ...hunk.added].every((line) => REVIEW_MARKER.test(line)),
    ),
  }));
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function hunkId(file: string, oldStart: number, removed: string[], added: string[]): string {
  return createHash('sha1')
    .update(`${file}\0${oldStart}\0${removed.join('\n')}\0${added.join('\n')}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * `git diff --unified=0 --relative` output, file by file. Paths come back
 * relative to `prefix` — the document's folder — and anything outside it is
 * dropped.
 */
export function parseUnifiedDiff(text: string, prefix: string): FileChange[] {
  const files: FileChange[] = [];
  let file: FileChange | null = null;
  let hunk: Hunk | null = null;
  let oldPath: string | null = null;

  const strip = (raw: string): string | null => {
    if (raw === '/dev/null') return null;
    const path = raw.replace(/^[ab]\//, '');
    return path.startsWith(prefix) ? path.slice(prefix.length) : null;
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = null;
      hunk = null;
      oldPath = null;
      continue;
    }
    if (line.startsWith('--- ')) {
      oldPath = line.slice(4);
      continue;
    }
    if (line.startsWith('+++ ')) {
      const before = oldPath === null ? null : strip(oldPath);
      const after = strip(line.slice(4));
      const path = after ?? before;
      if (path === null) continue;
      file = {
        path,
        status:
          oldPath === '/dev/null'
            ? 'added'
            : line.slice(4) === '/dev/null'
              ? 'deleted'
              : 'modified',
        binary: false,
        hunks: [],
      };
      files.push(file);
      continue;
    }
    if (line.startsWith('Binary files ')) {
      const match = / and (\S+) differ$/.exec(line);
      const path = match ? strip(match[1] as string) : null;
      if (path !== null) files.push({ path, status: 'modified', binary: true, hunks: [] });
      continue;
    }
    const header = HUNK_HEADER.exec(line);
    if (header && file) {
      hunk = {
        id: '',
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        removed: [],
        added: [],
        targets: [],
      };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk || !file) continue;
    if (line.startsWith('-')) hunk.removed.push(line.slice(1));
    else if (line.startsWith('+')) hunk.added.push(line.slice(1));
  }

  for (const changed of files) {
    for (const h of changed.hunks) h.id = hunkId(changed.path, h.oldStart, h.removed, h.added);
  }
  return files;
}

/** A file that git does not know yet: one hunk that adds every line. */
export function untrackedFile(path: string, source: string): FileChange {
  const lines = source.endsWith('\n') ? source.slice(0, -1).split('\n') : source.split('\n');
  return {
    path,
    status: 'added',
    binary: false,
    hunks: [
      {
        id: hunkId(path, 0, [], lines),
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        removed: [],
        added: lines,
        targets: [],
      },
    ],
  };
}

type Element = { loc: string; line: number; endLine: number; start: number; end: number };

/** Every element the loc-tags plugin stamps, with its extent in the source. */
function taggedElements(ast: AstNode): Element[] {
  const out: Element[] = [];
  walkJsx(ast, (node) => {
    const opening = node.openingElement as AstNode | undefined;
    if (!opening || !node.loc || !taggableName(opening)) return;
    out.push({
      loc: `${node.loc.start.line}:${node.loc.start.column}`,
      line: node.loc.start.line,
      endLine: node.loc.end.line,
      start: node.start,
      end: node.end,
    });
  });
  return out;
}

const contains = (outer: Element, inner: Element) =>
  outer !== inner && outer.start <= inner.start && outer.end >= inner.end;

function innermost(elements: Element[], from: number, to: number): Element | null {
  let best: Element | null = null;
  for (const el of elements) {
    if (el.line > from || el.endLine < to) continue;
    if (!best || contains(best, el)) best = el;
  }
  return best;
}

/**
 * Puts each hunk of the document's own source on the elements it touches.
 * Elements that start inside the hunk are the change, outermost first; a
 * hunk inside one element's text marks that element; a deletion marks the
 * element that now stands where the removed lines were.
 */
export function placeHunks(source: string, hunks: Hunk[]): void {
  const ast = parseSource(source);
  if (!ast) return;
  const elements = taggedElements(ast);

  for (const hunk of hunks) {
    if (hunk.newLines === 0) {
      // The lines went away after line `newStart`.
      const point = hunk.newStart;
      const parent = innermost(elements, point, point + 1);
      const next = elements.find(
        (el) =>
          el.line > point &&
          (!parent || contains(parent, el)) &&
          !elements.some(
            (other) =>
              other !== el &&
              other.line > point &&
              contains(other, el) &&
              (!parent || contains(parent, other)),
          ),
      );
      if (next) hunk.targets = [{ loc: next.loc, mark: 'removed-before' }];
      else if (parent) hunk.targets = [{ loc: parent.loc, mark: 'changed' }];
      continue;
    }
    const from = hunk.newStart;
    const to = hunk.newStart + hunk.newLines - 1;
    const mark: ChangeMark = hunk.oldLines === 0 ? 'added' : 'changed';
    const starting = elements.filter((el) => el.line >= from && el.line <= to);
    const outermost = starting.filter((el) => !starting.some((other) => contains(other, el)));
    if (outermost.length > 0) {
      hunk.targets = outermost.map((el) => ({ loc: el.loc, mark }));
      continue;
    }
    const around = innermost(elements, from, to);
    if (around) hunk.targets = [{ loc: around.loc, mark: 'changed' }];
  }
}

/**
 * The file with one hunk taken back. The lines the hunk added have to still be
 * where it put them — otherwise the file moved on since the viewer looked, and
 * the revert is refused rather than guessed.
 */
export function revertHunkIn(source: string, hunk: Hunk): string | null {
  const trailing = source.endsWith('\n');
  const lines = (trailing ? source.slice(0, -1) : source).split('\n');
  const at = hunk.newLines === 0 ? hunk.newStart : hunk.newStart - 1;
  const current = lines.slice(at, at + hunk.newLines);
  if (current.length !== hunk.added.length || current.some((line, i) => line !== hunk.added[i])) {
    return null;
  }
  lines.splice(at, hunk.newLines, ...hunk.removed);
  const next = lines.join('\n');
  return trailing || next === '' ? `${next}\n` : next;
}

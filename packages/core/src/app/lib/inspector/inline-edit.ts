/*
 * Editing text on the page, where it is printed.
 *
 * The element the reader double-clicked belongs to React. Typing into it
 * directly lets the browser split, merge, and delete nodes React still holds
 * references to, and the next commit that touches that subtree throws. So the
 * editor never touches it: it hides the element and puts a clone in its place,
 * with the same classes and inline styles, in the same parent — the clone lays
 * out exactly as the original did. Discarding removes the clone and shows the
 * original again, untouched. Saving writes source and lets hot reload replace
 * the original; the clone is only removed once it has.
 *
 * Inside the clone every run of text the source can take back is wrapped in a
 * `[data-od-run]` span, and every other node is inert. Keystrokes are applied
 * by hand to the run the caret is in, which is what keeps the runs intact:
 * left to itself the browser deletes an emptied span and puts the next
 * character beside it, where no run can claim it.
 *
 * A run is held as segments — stretches of text and the emphasis on them — so
 * bold and italic can be previewed as real `<strong>`/`<em>` inside the run
 * and still be read back as one run the source can take.
 */

export const EDITING_ATTR = 'data-od-editing';
const RUN_ATTR = 'data-od-run';

export type RunPart = { index: number; value: string; formattable?: boolean };

export type Run = {
  index: number;
  /** The run's text in source, as the server resolved it. */
  expected: string;
  /** Written between tags in source, so it can take `<strong>` and `<em>`. */
  formattable: boolean;
  el: HTMLElement;
};

export type Mark = 'bold' | 'italic';
export type Segment = { text: string; bold?: boolean; italic?: boolean };

function sameMarks(a: Segment, b: Segment): boolean {
  return Boolean(a.bold) === Boolean(b.bold) && Boolean(a.italic) === Boolean(b.italic);
}

function marksOf(segment: Segment | undefined): Omit<Segment, 'text'> {
  return {
    ...(segment?.bold ? { bold: true } : {}),
    ...(segment?.italic ? { italic: true } : {}),
  };
}

/** Drops empty pieces and joins neighbours that carry the same emphasis. */
export function mergeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.text === '') continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, segment)) last.text += segment.text;
    else out.push({ text: segment.text, ...marksOf(segment) });
  }
  return out;
}

export function segmentsText(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/**
 * One piece per UTF-16 unit — the unit DOM offsets count in, so a range read
 * off the selection lines up with these indices even past an emoji.
 */
function explode(segments: Segment[]): Segment[] {
  return segments.flatMap((segment) =>
    segment.text.split('').map((char) => ({ text: char, ...marksOf(segment) })),
  );
}

/**
 * Replaces characters `from`–`to` with `text`. What is typed takes the
 * emphasis of the character before it — typing at the end of a bold word
 * continues the bold — or of the first character when there is none before.
 */
export function spliceSegments(
  segments: Segment[],
  from: number,
  to: number,
  text: string,
): Segment[] {
  const chars = explode(segments);
  const like = chars[from - 1] ?? chars[from] ?? chars[0];
  const inserted = text.split('').map((char) => ({ text: char, ...marksOf(like) }));
  return mergeSegments([...chars.slice(0, from), ...inserted, ...chars.slice(to)]);
}

/** Whether every character in `from`–`to` carries the mark. */
export function hasMark(segments: Segment[], from: number, to: number, mark: Mark): boolean {
  const chars = explode(segments).slice(from, to);
  return chars.length > 0 && chars.every((char) => char[mark]);
}

/** Adds the mark to the range, or takes it off when the whole range already has it. */
export function toggleMark(segments: Segment[], from: number, to: number, mark: Mark): Segment[] {
  const on = !hasMark(segments, from, to, mark);
  const chars = explode(segments).map((char, at) =>
    at >= from && at < to ? { ...char, [mark]: on } : char,
  );
  return mergeSegments(chars);
}

/** A length-preserving rewrite of the text, applied across piece boundaries. */
export function mapSegmentText(segments: Segment[], fn: (text: string) => string): Segment[] {
  const next = fn(segmentsText(segments));
  let at = 0;
  return segments.map((segment) => {
    const text = next.slice(at, at + segment.text.length);
    at += segment.text.length;
    return { ...segment, text };
  });
}

export type MountedEditor = {
  clone: HTMLElement;
  runs: Run[];
  restore: () => void;
};

export function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Pairs each source run with a rendered text node, in order.
 *
 * Direct children are tried first: that is where a run sits when the element
 * writes its own text or renders a prop. Only if that fails are descendants
 * considered — a helper may wrap its children — because matching descendants
 * first would hand a run the text of a `<code>` that happens to read the same.
 * Returns which pool matched and the node position per run, or null when any
 * run cannot be placed.
 */
export function matchRuns(
  parts: RunPart[],
  direct: string[],
  all: string[],
): { deep: boolean; at: number[] } | null {
  const attempt = (pool: string[]): number[] | null => {
    const picked: number[] = [];
    let from = 0;
    for (const part of parts) {
      const want = normalize(part.value);
      let found = -1;
      for (let at = from; at < pool.length; at++) {
        if (normalize(pool[at] ?? '') === want) {
          found = at;
          break;
        }
      }
      if (found < 0) return null;
      picked.push(found);
      from = found + 1;
    }
    return picked;
  };
  if (parts.length === 0) return null;
  const shallow = attempt(direct);
  if (shallow) return { deep: false, at: shallow };
  const deep = all.length > direct.length ? attempt(all) : null;
  return deep ? { deep: true, at: deep } : null;
}

function textNodes(root: Node, deep: boolean): Text[] {
  const out: Text[] = [];
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (normalize(child.nodeValue ?? '') !== '') out.push(child as Text);
      } else if (deep) {
        visit(child);
      }
    }
  };
  visit(root);
  return out;
}

function pathOf(node: Node, root: Node): number[] {
  const path: number[] = [];
  let at: Node | null = node;
  while (at && at !== root) {
    const parent: Node | null = at.parentNode;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, at));
    at = parent;
  }
  return path;
}

function follow(root: Node, path: number[]): Node | null {
  let at: Node | null = root;
  for (const step of path) at = at?.childNodes[step] ?? null;
  return at;
}

/**
 * Hides `anchor` and puts an editable clone where it was, or returns null when
 * the rendered text cannot be lined up with the runs the source offers — the
 * caller then says why rather than guessing which words go where.
 */
export function mountEditor(anchor: HTMLElement, parts: RunPart[]): MountedEditor | null {
  const direct = textNodes(anchor, false);
  const all = textNodes(anchor, true);
  const valuesOf = (nodes: Text[]) => nodes.map((node) => node.nodeValue ?? '');
  const matched = matchRuns(parts, valuesOf(direct), valuesOf(all));
  if (!matched) return null;
  const pool = matched.deep ? all : direct;
  const paths = matched.at.map((at) => pathOf(pool[at] as Text, anchor));

  const clone = anchor.cloneNode(true) as HTMLElement;
  // Ids and loc tags belong to the original: a duplicate id would capture
  // outline jumps, and a loc tag would let the inspector select the clone as
  // if it were source.
  for (const el of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
    el.removeAttribute('id');
    el.removeAttribute('data-od-loc');
  }

  const targets = paths.map((path) => follow(clone, path));
  const runs: Run[] = [];
  targets.forEach((node, at) => {
    const part = parts[at];
    if (!node || !part) return;
    const span = document.createElement('span');
    span.setAttribute(RUN_ATTR, String(part.index));
    node.parentNode?.replaceChild(span, node);
    span.appendChild(node);
    runs.push({
      index: part.index,
      expected: part.value,
      formattable: part.formattable ?? false,
      el: span,
    });
  });
  if (runs.length !== parts.length) return null;

  for (const el of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
    if (!el.hasAttribute(RUN_ATTR) && !el.closest(`[${RUN_ATTR}]`)) {
      el.setAttribute('contenteditable', 'false');
    }
  }
  clone.setAttribute(EDITING_ATTR, '');
  clone.setAttribute('contenteditable', 'true');
  clone.setAttribute('spellcheck', 'false');
  clone.setAttribute('role', 'textbox');
  clone.setAttribute('aria-label', 'Edit text');
  // The inspector's selection frame is the focus indicator; the browser's own
  // ring would sit inside it, a second outline around the same words.
  clone.style.outline = 'none';
  clone.style.cursor = 'text';
  clone.style.userSelect = 'text';

  const display = anchor.style.getPropertyValue('display');
  const priority = anchor.style.getPropertyPriority('display');
  anchor.style.setProperty('display', 'none', 'important');
  anchor.after(clone);

  return {
    clone,
    runs,
    restore: () => {
      clone.remove();
      if (display) anchor.style.setProperty('display', display, priority);
      else anchor.style.removeProperty('display');
    },
  };
}

export function readRuns(runs: Run[]): string[] {
  return runs.map((run) => run.el.textContent ?? '');
}

const MARK_TAGS: Record<string, Mark> = { STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic' };

/** The run as it stands on the page, emphasis included. */
export function readSegments(el: HTMLElement): Segment[] {
  const out: Segment[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const segment: Segment = { text: (node as Text).data };
    for (let at = node.parentElement; at && at !== el; at = at.parentElement) {
      const mark = MARK_TAGS[at.tagName];
      if (mark) segment[mark] = true;
    }
    out.push(segment);
  }
  return mergeSegments(out);
}

export function writeSegments(el: HTMLElement, segments: Segment[]): void {
  el.replaceChildren(
    ...mergeSegments(segments).map((segment) => {
      let node: Node = document.createTextNode(segment.text);
      if (segment.italic) {
        const em = document.createElement('em');
        em.appendChild(node);
        node = em;
      }
      if (segment.bold) {
        const strong = document.createElement('strong');
        strong.appendChild(node);
        node = strong;
      }
      return node;
    }),
  );
}

/** Every run's segments — what undo and Escape put back. */
export function snapshotRuns(runs: Run[]): Segment[][] {
  return runs.map((run) => readSegments(run.el));
}

export function restoreRuns(runs: Run[], snapshot: Segment[][]): void {
  runs.forEach((run, at) => {
    writeSegments(run.el, snapshot[at] ?? []);
  });
}

export function isFormatted(segments: Segment[]): boolean {
  return segments.some((segment) => segment.bold || segment.italic);
}

/** The segments to send, cleaned the way `cleanRun` cleans the text. */
export function cleanSegments(segments: Segment[], expected: string): Segment[] {
  const unbreak = !expected.includes('\u00a0');
  const out = segments.map((segment) => ({
    ...segment,
    text: unbreak ? segment.text.replace(/\u00a0/g, ' ') : segment.text,
  }));
  if (expected === expected.trim()) {
    const first = out[0];
    if (first) out[0] = { ...first, text: first.text.trimStart() };
    const last = out[out.length - 1];
    if (last) out[out.length - 1] = { ...last, text: last.text.trimEnd() };
  }
  return mergeSegments(out);
}

export function isRunChanged(run: Run): boolean {
  return isRunDirty(run.el.textContent ?? '', run.expected) || isFormatted(readSegments(run.el));
}

/**
 * What to send for a run. Non-breaking spaces are the browser's, not the
 * author's — contenteditable inserts them for any space it fears would
 * collapse. Whitespace at the edges is dropped only when the source run had
 * none: a JSX text run is stored trimmed, and its indentation is not part of it.
 */
export function cleanRun(current: string, expected: string): string {
  const text = expected.includes(' ') ? current : current.replace(/ /g, ' ');
  return expected === expected.trim() ? text.trim() : text;
}

/**
 * A space the layout would collapse — at either end of the run, or after
 * another space — takes no width, so the browser snaps the caret back over it
 * and the next character lands before it. Browsers keep such a space as a
 * non-breaking one while editing; `cleanRun` turns it back on the way out.
 */
export function holdSpaces(text: string): string {
  let out = '';
  for (let at = 0; at < text.length; at++) {
    const char = text[at] as string;
    const collapsible =
      char === ' ' && (at === 0 || at === text.length - 1 || /\s/.test(out[at - 1] ?? ''));
    out += collapsible ? ' ' : char;
  }
  return out;
}

export function isRunDirty(current: string, expected: string): boolean {
  return normalize(cleanRun(current, expected)) !== normalize(expected);
}

export function runOf(node: Node | null, clone: HTMLElement): HTMLElement | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  const run = el?.closest<HTMLElement>(`[${RUN_ATTR}]`) ?? null;
  return run && clone.contains(run) ? run : null;
}

/** Character offset of a DOM point within a run. */
function offsetIn(run: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(run);
  range.setEnd(container, offset);
  return range.toString().length;
}

export function placeCaret(run: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  let remaining = offset;
  const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    if (remaining <= length) {
      selection.collapse(node, remaining);
      return;
    }
    remaining -= length;
    node = walker.nextNode() as Text | null;
  }
  selection.collapse(run, run.childNodes.length);
}

type DomRange = {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
};

/**
 * The run a range acts on, and its character offsets within that run. A
 * range that spills past one run — select-all, or a selection dragged over a
 * `<code>` chip — is narrowed to it, leaving the markup alone. A range that
 * touches two runs has no one place in source it could be written back to.
 */
export function locate(
  clone: HTMLElement,
  range: DomRange,
): { run: HTMLElement; from: number; to: number } | null {
  let run = runOf(range.startContainer, clone);
  if (!run || runOf(range.endContainer, clone) !== run) {
    const live = document.createRange();
    live.setStart(range.startContainer, range.startOffset);
    live.setEnd(range.endContainer, range.endOffset);
    const touched = Array.from(clone.querySelectorAll<HTMLElement>(`[${RUN_ATTR}]`)).filter(
      (candidate) => live.intersectsNode(candidate),
    );
    if (touched.length !== 1) return null;
    run = touched[0] as HTMLElement;
  }
  const length = (run.textContent ?? '').length;
  const start = run.contains(range.startContainer)
    ? offsetIn(run, range.startContainer, range.startOffset)
    : 0;
  const end = run.contains(range.endContainer)
    ? offsetIn(run, range.endContainer, range.endOffset)
    : length;
  return start <= end ? { run, from: start, to: end } : { run, from: end, to: start };
}

/** Replaces the text a range covers with `text`. Returns false, changing nothing, when it cannot. */
export function replaceInRun(clone: HTMLElement, range: DomRange, text: string): boolean {
  const at = locate(clone, range);
  if (!at) return false;
  const { run, from, to } = at;
  let next = spliceSegments(readSegments(run), from, to, text);
  if (!getComputedStyle(run).whiteSpace.startsWith('pre')) next = mapSegmentText(next, holdSpaces);
  writeSegments(run, next);
  placeCaret(run, from + text.length);
  return true;
}

export function selectInRun(run: HTMLElement, from: number, to: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  placeCaret(run, from);
  const anchor = { node: selection.anchorNode, offset: selection.anchorOffset };
  placeCaret(run, to);
  const focus = { node: selection.focusNode, offset: selection.focusOffset };
  if (anchor.node && focus.node) {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  }
}

/** Puts the caret where the reader clicked, and selects the word there on a double-click. */
export function focusAt(
  clone: HTMLElement,
  point: { x: number; y: number } | null,
  selectWord: boolean,
): void {
  clone.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;
  if (point) {
    const range = caretRangeAt(point.x, point.y);
    if (range && runOf(range.startContainer, clone)) {
      selection.removeAllRanges();
      selection.addRange(range);
      const modifiable = selection as Selection & {
        modify?: (alter: string, direction: string, granularity: string) => void;
      };
      if (selectWord && typeof modifiable.modify === 'function') {
        modifiable.modify('move', 'backward', 'word');
        modifiable.modify('extend', 'forward', 'word');
      }
      return;
    }
  }
  const runs = clone.querySelectorAll<HTMLElement>(`[${RUN_ATTR}]`);
  const last = runs[runs.length - 1];
  if (last) placeCaret(last, (last.textContent ?? '').length);
}

function caretRangeAt(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return doc.caretRangeFromPoint?.(x, y) ?? null;
}

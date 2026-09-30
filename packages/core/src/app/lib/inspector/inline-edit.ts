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
 * A run is held as segments — stretches of text and the formatting on them —
 * so bold, italic, code and links show as real `<strong>`, `<em>`, `<code>`
 * and `<a>` inside the run and still read back as one run the source can take.
 */

export const EDITING_ATTR = 'data-od-editing';
const RUN_ATTR = 'data-od-run';

export type Mark = 'bold' | 'italic' | 'code';
export type Segment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

export type RunPart = {
  index: number;
  value: string;
  formattable?: boolean;
  segments?: Segment[];
};

export type Run = {
  index: number;
  /** The run's text in source, as the server resolved it. */
  expected: string;
  /** The run's formatting in source; plain text when it has none. */
  expectedSegments: Segment[];
  /** Written between tags in source, so it can take formatting. */
  formattable: boolean;
  el: HTMLElement;
};

function sameMarks(a: Segment, b: Segment): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.code) === Boolean(b.code) &&
    a.href === b.href
  );
}

function marksOf(segment: Segment | undefined): Omit<Segment, 'text'> {
  return {
    ...(segment?.bold ? { bold: true } : {}),
    ...(segment?.italic ? { italic: true } : {}),
    ...(segment?.code ? { code: true } : {}),
    ...(segment?.href ? { href: segment.href } : {}),
  };
}

/** Drops empty pieces and joins neighbours that carry the same formatting. */
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
 * Replaces characters `from`–`to` with `text`. Typing over a selection takes
 * the formatting of what it replaces — retyping a bold word keeps it bold.
 * Typing at a caret takes the formatting of the character before it, so
 * typing at the end of a bold word continues the bold. A link is the
 * exception: typing just past its end does not extend it.
 */
export function spliceSegments(
  segments: Segment[],
  from: number,
  to: number,
  text: string,
): Segment[] {
  const chars = explode(segments);
  const source = to > from ? chars[from] : (chars[from - 1] ?? chars[from]);
  const like = { ...marksOf(source ?? chars[0]) };
  if (like.href && chars[to]?.href !== like.href && from > 0) delete like.href;
  const inserted = text.split('').map((char) => ({ text: char, ...like }));
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

/** Links the range to `href`, or unlinks it when `href` is null. */
export function setHref(
  segments: Segment[],
  from: number,
  to: number,
  href: string | null,
): Segment[] {
  const chars = explode(segments).map((char, at) => {
    if (at < from || at >= to) return char;
    const { href: _drop, ...rest } = char;
    return href ? { ...rest, href } : rest;
  });
  return mergeSegments(chars);
}

/** Takes every kind of formatting off the range. */
export function clearFormatting(segments: Segment[], from: number, to: number): Segment[] {
  const chars = explode(segments).map((char, at) =>
    at >= from && at < to ? { text: char.text } : char,
  );
  return mergeSegments(chars);
}

/** The link under `offset`, and how far it reaches either side. */
export function linkAt(
  segments: Segment[],
  offset: number,
): { from: number; to: number; href: string } | null {
  const chars = explode(segments);
  const href = chars[offset]?.href ?? chars[offset - 1]?.href;
  if (!href) return null;
  let from = chars[offset]?.href === href ? offset : offset - 1;
  let to = from + 1;
  while (from > 0 && chars[from - 1]?.href === href) from--;
  while (to < chars.length && chars[to]?.href === href) to++;
  return { from, to, href };
}

/** The href shared by every character in the range, if there is one. */
export function hrefOf(segments: Segment[], from: number, to: number): string | null {
  const chars = explode(segments).slice(from, to);
  const href = chars[0]?.href;
  return href && chars.every((char) => char.href === href) ? href : null;
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

/**
 * The formatting of a run, character by character, blind to whitespace — two
 * runs whose words carry the same marks compare equal however their spaces
 * were written.
 */
function formatSignature(segments: Segment[]): string {
  return explode(segments)
    .filter((char) => char.text.trim() !== '')
    .map(
      (char) =>
        `${char.text}${char.bold ? 'b' : ''}${char.italic ? 'i' : ''}${char.code ? 'c' : ''}${char.href ?? ''}`,
    )
    .join('\n');
}

export type MountedEditor = {
  clone: HTMLElement;
  runs: Run[];
  restore: () => void;
};

export function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const MARK_ELEMENTS = new Set(['STRONG', 'B', 'EM', 'I', 'CODE']);

/**
 * The DOM side of the server's rule: a bare mark, or a link with nothing but
 * an href, holding only text and other marks. `data-*` attributes do not
 * count: the loc tag is ours, and extensions and tooling stamp their own onto
 * whatever they touch. One the author wrote makes the server call the element
 * markup, and the runs it splits into still line up here.
 */
function isMarkElement(el: Element): boolean {
  const own = Array.from(el.attributes)
    .map((attribute) => attribute.name)
    .filter((name) => !name.startsWith('data-'));
  const bare =
    el.tagName === 'A'
      ? own.length === 1 && own[0] === 'href'
      : MARK_ELEMENTS.has(el.tagName) && own.length === 0;
  return bare && Array.from(el.children).every(isMarkElement);
}

export type Item = { text: string; inline: boolean };

/**
 * Pairs each source run with a stretch of the element's children, in order.
 *
 * A run is text and marks side by side, so its match is a contiguous range of
 * inline children — text nodes, bare marks — whose words read as the run's.
 * Markup between runs is stepped over; so is text a run does not claim, such
 * as the output of an expression the source cannot trace. Returns the range
 * per run, or null when any run cannot be placed.
 */
export function matchRanges(parts: RunPart[], items: Item[]): Array<[number, number]> | null {
  if (parts.length === 0) return null;
  const out: Array<[number, number]> = [];
  let from = 0;
  for (const part of parts) {
    const want = normalize(part.value);
    let found: [number, number] | null = null;
    for (let start = from; start < items.length && !found; start++) {
      const first = items[start];
      if (!first?.inline || normalize(first.text) === '') continue;
      let seen = '';
      for (let end = start; end < items.length; end++) {
        const item = items[end];
        if (!item?.inline) break;
        seen += item.text;
        const have = normalize(seen);
        if (have === want) {
          found = [start, end];
          break;
        }
        if (!want.startsWith(have)) break;
      }
    }
    if (!found) return null;
    out.push(found);
    from = found[1] + 1;
  }
  return out;
}

function itemsOf(anchor: HTMLElement): Item[] {
  return Array.from(anchor.childNodes).map((node) => ({
    text: node.textContent ?? '',
    inline: node.nodeType === Node.TEXT_NODE || (node instanceof Element && isMarkElement(node)),
  }));
}

/**
 * A helper may wrap its children one level down, so a plain run that is not
 * among the element's own children is looked for as a single text node
 * anywhere inside it. A formatted run is never searched for this way: its
 * pieces would have to be gathered from wherever they happened to fall.
 */
function deepTextNodes(anchor: HTMLElement, parts: RunPart[]): Text[] | null {
  if (parts.some((part) => part.segments)) return null;
  const pool: Text[] = [];
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (normalize(node.nodeValue ?? '') !== '') pool.push(node as Text);
  }
  const picked: Text[] = [];
  let from = 0;
  for (const part of parts) {
    const at = pool.findIndex(
      (node, index) => index >= from && normalize(node.nodeValue ?? '') === normalize(part.value),
    );
    const node = pool[at];
    if (at < 0 || !node) return null;
    picked.push(node);
    from = at + 1;
  }
  return picked;
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
  const ranges = matchRanges(parts, itemsOf(anchor));
  const deep = ranges ? null : deepTextNodes(anchor, parts);
  if (!ranges && !deep) return null;

  const clone = anchor.cloneNode(true) as HTMLElement;
  // Ids and loc tags belong to the original: a duplicate id would capture
  // outline jumps, and a loc tag would let the inspector select the clone as
  // if it were source.
  for (const el of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
    el.removeAttribute('id');
    el.removeAttribute('data-od-loc');
  }

  // Resolve every run's nodes in the clone before moving any of them, so one
  // run's wrapping cannot shift the positions another is found by.
  const groups: Node[][] = ranges
    ? ranges.map(([start, end]) => Array.from(clone.childNodes).slice(start, end + 1))
    : (deep ?? []).map((node) => {
        const twin = follow(clone, pathOf(node, anchor));
        return twin ? [twin] : [];
      });

  const runs: Run[] = [];
  groups.forEach((nodes, at) => {
    const part = parts[at];
    const first = nodes[0];
    if (!part || !first) return;
    const span = document.createElement('span');
    span.setAttribute(RUN_ATTR, String(part.index));
    first.parentNode?.insertBefore(span, first);
    for (const node of nodes) span.appendChild(node);
    runs.push({
      index: part.index,
      expected: part.value,
      expectedSegments: part.segments ?? [{ text: part.value }],
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
  // A link inside the text being edited is text to edit, not a way off the page.
  clone.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest?.('a')) event.preventDefault();
  });

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

const MARK_TAGS: Record<string, Mark> = {
  STRONG: 'bold',
  B: 'bold',
  EM: 'italic',
  I: 'italic',
  CODE: 'code',
};

/** The run as it stands on the page, formatting included. */
export function readSegments(el: HTMLElement): Segment[] {
  const out: Segment[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const segment: Segment = { text: (node as Text).data };
    for (let at = node.parentElement; at && at !== el; at = at.parentElement) {
      const mark = MARK_TAGS[at.tagName];
      if (mark) segment[mark] = true;
      if (at.tagName === 'A' && !segment.href) {
        const href = at.getAttribute('href');
        if (href) segment.href = href;
      }
    }
    out.push(segment);
  }
  return mergeSegments(out);
}

function wrap(node: Node, tag: string): Node {
  const el = document.createElement(tag);
  el.appendChild(node);
  return el;
}

export function writeSegments(el: HTMLElement, segments: Segment[]): void {
  el.replaceChildren(
    ...mergeSegments(segments).map((segment) => {
      let node: Node = document.createTextNode(segment.text);
      if (segment.code) node = wrap(node, 'code');
      if (segment.italic) node = wrap(node, 'em');
      if (segment.bold) node = wrap(node, 'strong');
      if (segment.href) {
        node = wrap(node, 'a');
        (node as HTMLAnchorElement).setAttribute('href', segment.href);
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
  return segments.some((segment) => segment.bold || segment.italic || segment.code || segment.href);
}

/** The segments to send, cleaned the way `cleanRun` cleans the text. */
export function cleanSegments(segments: Segment[], expected: string): Segment[] {
  const unbreak = !expected.includes(' ');
  const out = segments.map((segment) => ({
    ...segment,
    text: unbreak ? segment.text.replace(/ /g, ' ') : segment.text,
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
  return (
    isRunDirty(run.el.textContent ?? '', run.expected) ||
    formatSignature(readSegments(run.el)) !== formatSignature(run.expectedSegments)
  );
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
 * piece of markup — is narrowed to it, leaving the markup alone. A range that
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

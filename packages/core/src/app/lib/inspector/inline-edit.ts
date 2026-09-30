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
 */

export const EDITING_ATTR = 'data-od-editing';
const RUN_ATTR = 'data-od-run';

export type RunPart = { index: number; value: string };

export type Run = {
  index: number;
  /** The run's text in source, as the server resolved it. */
  expected: string;
  el: HTMLElement;
};

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
    runs.push({ index: part.index, expected: part.value, el: span });
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

export function writeRuns(runs: Run[], texts: string[]): void {
  runs.forEach((run, at) => {
    run.el.textContent = texts[at] ?? '';
  });
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

/**
 * Replaces the text a StaticRange covers with `text`, provided the range
 * touches one run. A range that spills past it — select-all, or a selection
 * dragged over a `<code>` chip — is narrowed to that run, leaving the markup
 * alone. Returns false, changing nothing, when it touches two runs: a single
 * replacement has no one place in source it could be written back to.
 */
export function replaceInRun(
  clone: HTMLElement,
  range: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number },
  text: string,
): boolean {
  let run = runOf(range.startContainer, clone);
  if (!run || runOf(range.endContainer, clone) !== run) {
    const live = document.createRange();
    live.setStart(range.startContainer, range.startOffset);
    live.setEnd(range.endContainer, range.endOffset);
    const touched = Array.from(clone.querySelectorAll<HTMLElement>(`[${RUN_ATTR}]`)).filter(
      (candidate) => live.intersectsNode(candidate),
    );
    if (touched.length !== 1) return false;
    run = touched[0] as HTMLElement;
  }
  const current = run.textContent ?? '';
  const start = run.contains(range.startContainer)
    ? offsetIn(run, range.startContainer, range.startOffset)
    : 0;
  const end = run.contains(range.endContainer)
    ? offsetIn(run, range.endContainer, range.endOffset)
    : current.length;
  const [from, to] = start <= end ? [start, end] : [end, start];
  const next = current.slice(0, from) + text + current.slice(to);
  run.textContent = getComputedStyle(run).whiteSpace.startsWith('pre') ? next : holdSpaces(next);
  placeCaret(run, from + text.length);
  return true;
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

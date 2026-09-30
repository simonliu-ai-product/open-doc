import { Check, Loader2, MessageSquarePlus, X } from 'lucide-react';
import {
  type CSSProperties,
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { candidateLocs, formatLocs } from '../../lib/inspector/fiber';
import {
  cleanRun,
  focusAt,
  isRunDirty,
  type MountedEditor,
  mountEditor,
  normalize,
  placeCaret,
  readRuns,
  replaceInRun,
  writeRuns,
} from '../../lib/inspector/inline-edit';

type TextPart = { kind: 'text'; index: number; value: string } | { kind: 'markup'; label: string };

type ResolvedTarget = {
  line: number;
  column: number;
  editable: boolean;
  text: string;
  parts: TextPart[];
  reason?: string;
};

export const LOC_ATTR = 'data-od-loc';

export type InspectorTarget = {
  line: number;
  column: number;
  anchor: HTMLElement;
  tag: string;
};

/**
 * Text being edited on the page. `line:column` is where the server resolved the
 * words to — not necessarily the clicked element's own tag, when the words are
 * a prop written at a call site.
 */
type Entry = {
  anchor: HTMLElement;
  editor: MountedEditor;
  line: number;
  column: number;
  shown: string;
  pre: boolean;
  undo: string[][];
  redo: string[][];
  lastInsert: number;
};

type Outcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * Where in an element the reader clicked, as a fraction of its box. Selecting
 * opens the side panel, which narrows the pane and re-zooms the page between
 * the two clicks of a double-click — an absolute point would land on whatever
 * slid under it.
 */
type At = { rx: number; ry: number };

function atIn(el: HTMLElement, x: number, y: number): At {
  const r = el.getBoundingClientRect();
  return {
    rx: r.width ? (x - r.left) / r.width : 0,
    ry: r.height ? (y - r.top) / r.height : 0,
  };
}

function pointIn(el: HTMLElement, at: At | null): { x: number; y: number } | null {
  if (!at) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + at.rx * r.width, y: r.top + at.ry * r.height };
}

// Longer than any double-click interval a system allows by default.
const DOUBLE_CLICK_MS = 600;

// Same visual language as open-slide's inspector: dashed on hover, solid on
// selection, both in the same blue. Unsaved text keeps a dashed frame after the
// cursor leaves it, so a change that exists only on screen never looks saved.
const FRAME_STYLE: Record<'hover' | 'selected' | 'pending', CSSProperties> = {
  hover: { outline: '1.5px dashed #3b82f6', background: 'rgba(59,130,246,0.05)' },
  selected: { outline: '2px solid #3b82f6', background: 'rgba(59,130,246,0.1)' },
  pending: { outline: '1.5px dashed #3b82f6', outlineOffset: 2 },
};

// Past this, a reload that should have replaced a saved element is not coming
// (the write changed nothing the page renders), and the clone must not linger.
const RELOAD_TIMEOUT_MS = 4000;

function targetFrom(el: Element | null): InspectorTarget | null {
  // A contents row is generated from a heading and written nowhere; the words
  // to edit are the heading's. Clicking the row selects that instead, so the
  // list stays what it is — a view — and still answers to a click.
  const row = (el as HTMLElement | null)?.closest?.('[data-od-toc-entry]') as HTMLElement | null;
  const heading = row?.dataset.odTocEntry ? document.getElementById(row.dataset.odTocEntry) : null;
  const from = heading ?? el;
  const host = (from as HTMLElement | null)?.closest?.(`[${LOC_ATTR}]`) as HTMLElement | null;
  const raw = host?.getAttribute(LOC_ATTR);
  if (!host || !raw) return null;
  const [line, column] = raw.split(':').map(Number);
  if (!Number.isFinite(line) || !Number.isFinite(column)) return null;
  return { line, column, anchor: host, tag: host.tagName.toLowerCase() };
}

type Rect = { left: number; top: number; width: number; height: number };

function sameRect(a: Rect | null, b: Rect) {
  return (
    a !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function Frame({
  anchor,
  container,
  variant,
}: {
  anchor: HTMLElement | null;
  container: HTMLElement;
  variant: 'hover' | 'selected' | 'pending';
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  // Deliberately no dependency array. Opening a side pane re-zooms and re-centres
  // the pages, which moves the anchor without resizing it — ResizeObserver never
  // sees that, and the zoom lands a frame after the observer would have fired.
  // Measuring after every render is what keeps the frame on its element; the
  // value comparison below stops that from looping.
  useLayoutEffect(() => {
    if (!anchor?.isConnected) {
      setRect(null);
      return;
    }
    // The overlay is absolutely positioned inside the scroller, so its origin
    // is the content box — frames live in content coordinates and scroll along
    // with the pages.
    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const next = {
        left: a.left - c.left + container.scrollLeft,
        top: a.top - c.top + container.scrollTop,
        width: a.width,
        height: a.height,
      };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(anchor);
    ro.observe(container);
    container.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', measure);
    };
  });

  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-[2px]"
      style={{ ...rect, ...FRAME_STYLE[variant] }}
    />
  );
}

function dirtyRuns(entry: Entry): number {
  const texts = readRuns(entry.editor.runs);
  return entry.editor.runs.filter((run, at) => isRunDirty(texts[at] ?? '', run.expected)).length;
}

/** The DOM range an input will act on, when the browser does not say. */
function fallbackRange(inputType: string): StaticRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const modifiable = selection as Selection & {
    modify?: (alter: string, direction: string, granularity: string) => void;
  };
  if (selection.isCollapsed && inputType.startsWith('delete') && modifiable.modify) {
    const backward = inputType.includes('Backward');
    const word = inputType.includes('Word');
    modifiable.modify('extend', backward ? 'backward' : 'forward', word ? 'word' : 'character');
  }
  const range = selection.getRangeAt(0);
  return new StaticRange({
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  });
}

type Props = {
  docId: string;
  /** The scroll container the pages live in. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The design panel shares the right dock and wins it while open. */
  panelHidden: boolean;
  onExit: () => void;
  /** Set to a function that saves any unsaved text, then leaves edit mode. */
  exitRef: MutableRefObject<(() => void) | null>;
};

export function Inspector({ docId, containerRef, panelHidden, onExit, exitRef }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [hover, setHover] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<InspectorTarget | null>(null);
  const [resolution, setResolution] = useState<{
    anchor: HTMLElement;
    value: ResolvedTarget;
  } | null>(null);
  // Derived against the selection, never stored alone: a click that selects
  // and a double-click that asks to edit can land in one render, before the
  // new lookup has even started, and the previous element's runs would be
  // laid over this one's text.
  const target = resolution && resolution.anchor === selected?.anchor ? resolution.value : null;
  const [active, setActive] = useState<Entry | null>(null);
  const [wantEdit, setWantEdit] = useState<{
    anchor: HTMLElement;
    at: At | null;
    selectWord: boolean;
  } | null>(null);
  const [pending, setPending] = useState<Entry[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef(new Map<HTMLElement, Entry>());
  const sessionStartRef = useRef<string[]>([]);
  const firstClickRef = useRef<{ anchor: HTMLElement; at: At; time: number } | null>(null);

  useLayoutEffect(() => setContainer(containerRef.current), [containerRef]);

  const insideChrome = useCallback(
    (node: EventTarget | null) =>
      (panelRef.current?.contains(node as Node) ?? false) ||
      (barRef.current?.contains(node as Node) ?? false),
    [],
  );

  const entryAt = useCallback((node: EventTarget | null): Entry | null => {
    for (const entry of entriesRef.current.values()) {
      if (entry.editor.clone.contains(node as Node)) return entry;
    }
    return null;
  }, []);

  const refresh = useCallback(() => {
    setPending([...entriesRef.current.values()].filter((entry) => dirtyRuns(entry) > 0));
  }, []);

  const drop = useCallback((entry: Entry) => {
    entry.editor.restore();
    entriesRef.current.delete(entry.anchor);
  }, []);

  const begin = useCallback(
    (anchor: HTMLElement, at: At | null, selectWord: boolean, resolved?: ResolvedTarget) => {
      let entry = entriesRef.current.get(anchor);
      if (!entry) {
        if (!resolved) return;
        const runs = resolved.parts.filter(
          (part): part is Extract<TextPart, { kind: 'text' }> => part.kind === 'text',
        );
        const shown = normalize(anchor.textContent ?? '');
        const editor = mountEditor(anchor, runs);
        if (!editor) {
          setStatus(
            'The text on the page does not line up with its source, so it cannot be edited here.',
          );
          return;
        }
        entry = {
          anchor,
          editor,
          line: resolved.line,
          column: resolved.column,
          shown,
          pre: getComputedStyle(anchor).whiteSpace.startsWith('pre'),
          undo: [],
          redo: [],
          lastInsert: 0,
        };
        entriesRef.current.set(anchor, entry);
      }
      sessionStartRef.current = readRuns(entry.editor.runs);
      setStatus(null);
      setActive(entry);
      focusAt(entry.editor.clone, pointIn(entry.editor.clone, at), selectWord);
    },
    [],
  );

  /** Ends the typing session. The change stays on the page, unsaved, unless reverted. */
  const finish = useCallback(
    (entry: Entry, revert: boolean) => {
      if (revert) writeRuns(entry.editor.runs, sessionStartRef.current);
      if (dirtyRuns(entry) === 0) drop(entry);
      else entry.editor.clone.blur();
      setActive((current) => (current === entry ? null : current));
      refresh();
    },
    [drop, refresh],
  );

  const discard = useCallback(() => {
    for (const entry of [...entriesRef.current.values()]) drop(entry);
    setActive(null);
    refresh();
    setStatus('Discarded unsaved edits');
  }, [drop, refresh]);

  /**
   * Leaves the clone in place until hot reload has replaced what it covers —
   * removing it at once would flash the old words for the length of a reload.
   */
  const settle = useCallback(
    (entry: Entry) => {
      entriesRef.current.delete(entry.anchor);
      const root = container ?? document.body;
      const before = entry.anchor.textContent;
      let timer = 0;
      const done = () => {
        observer.disconnect();
        window.clearTimeout(timer);
        entry.editor.restore();
      };
      const observer = new MutationObserver(() => {
        if (!entry.anchor.isConnected || entry.anchor.textContent !== before) done();
      });
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      timer = window.setTimeout(done, RELOAD_TIMEOUT_MS);
    },
    [container],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (active) finish(active, false);
    const entries = [...entriesRef.current.values()];
    const edits: Array<Record<string, unknown>> = [];
    const owners: Entry[] = [];
    for (const entry of entries) {
      const texts = readRuns(entry.editor.runs);
      entry.editor.runs.forEach((run, at) => {
        const current = texts[at] ?? '';
        if (!isRunDirty(current, run.expected)) return;
        edits.push({
          line: entry.line,
          column: entry.column,
          index: run.index,
          expected: run.expected,
          shown: entry.shown,
          text: cleanRun(current, run.expected),
        });
        owners.push(entry);
      });
    }
    if (edits.length === 0) return true;

    setBusy(true);
    try {
      const res = await fetch('/__edit/texts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId, edits }),
      });
      const body = (await res.json()) as { results?: Outcome[]; error?: string };
      if (!res.ok || !body.results) {
        setStatus(body.error ?? 'Save failed');
        return false;
      }
      const results = body.results;
      const failures = results.filter(
        (result): result is Extract<Outcome, { ok: false }> => !result.ok,
      );
      for (const entry of new Set(owners)) {
        const wrote = results.some((result, at) => result.ok && owners[at] === entry);
        if (wrote) settle(entry);
        else drop(entry);
      }
      refresh();
      setSelected(null);
      setStatus(
        failures.length === 0
          ? 'Saved to source'
          : `${failures.length} of ${edits.length} not saved — ${failures[0]?.error ?? 'refused'}`,
      );
      return failures.length === 0;
    } catch {
      setStatus('Save failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [active, docId, drop, finish, refresh, settle]);

  const leave = useCallback(async () => {
    if (await save()) onExit();
  }, [save, onExit]);

  useEffect(() => {
    exitRef.current = () => void leave();
    return () => {
      exitRef.current = null;
    };
  }, [exitRef, leave]);

  // Leaving edit mode any other way — a route change, closing the tab — drops
  // unsaved text rather than leaving a clone on the page with nothing to own it.
  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      for (const entry of entries.values()) entry.editor.restore();
      entries.clear();
    };
  }, []);

  useEffect(() => {
    if (pending.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pending.length]);

  // An external write (an agent, the design panel) reloads the document and may
  // replace an element that has unsaved text over it. Its clone goes with it;
  // say so rather than let the edit vanish silently.
  useEffect(() => {
    if (!container) return;
    const observer = new MutationObserver(() => {
      let lost = 0;
      for (const entry of [...entriesRef.current.values()]) {
        if (entry.anchor.isConnected) continue;
        drop(entry);
        lost++;
        setActive((current) => (current === entry ? null : current));
      }
      if (lost > 0) {
        refresh();
        setStatus(
          `The document reloaded — ${lost} unsaved edit${lost > 1 ? 's were' : ' was'} lost`,
        );
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [container, drop, refresh]);

  useEffect(() => {
    if (!container) return;

    const onMove = (e: PointerEvent) => {
      if (insideChrome(e.target)) return;
      const entry = entryAt(e.target);
      setHover(entry ? entry.editor.clone : (targetFrom(e.target as Element)?.anchor ?? null));
    };
    const onClick = (e: MouseEvent) => {
      if (insideChrome(e.target)) return;
      // Text already open on the page is a field: a click places the caret.
      const entry = entryAt(e.target);
      if (entry) {
        const owner = targetFrom(entry.anchor);
        if (owner) setSelected((prev) => (prev?.anchor === owner.anchor ? prev : owner));
        if (active !== entry) {
          begin(entry.anchor, atIn(entry.editor.clone, e.clientX, e.clientY), false);
        }
        return;
      }
      const first = firstClickRef.current;
      if (e.detail > 1 && first && Date.now() - first.time < DOUBLE_CLICK_MS) {
        // The second click of a double-click: the page may have moved under
        // the pointer since the first, so it must not change the selection.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const target = targetFrom(e.target as Element);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      firstClickRef.current = target.anchor.contains(e.target as Node)
        ? { anchor: target.anchor, at: atIn(target.anchor, e.clientX, e.clientY), time: Date.now() }
        : null;
      // A contents row sends the selection to a heading pages away. Without
      // this the panel fills in and the document sits where it was, which
      // reads as nothing having happened.
      if (!target.anchor.contains(e.target as Node)) {
        target.anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      setSelected((prev) => (prev?.anchor === target.anchor ? prev : target));
      setStatus(null);
      setNote('');
    };
    const onDblClick = (e: MouseEvent) => {
      if (insideChrome(e.target)) return;
      const first = firstClickRef.current;
      firstClickRef.current = null;
      if (first && Date.now() - first.time < DOUBLE_CLICK_MS) {
        e.preventDefault();
        setWantEdit({ anchor: first.anchor, at: first.at, selectWord: true });
        return;
      }
      if (entryAt(e.target)) return;
      const target = targetFrom(e.target as Element);
      if (!target?.anchor.contains(e.target as Node)) return;
      e.preventDefault();
      setSelected((prev) => (prev?.anchor === target.anchor ? prev : target));
      setWantEdit({
        anchor: target.anchor,
        at: atIn(target.anchor, e.clientX, e.clientY),
        selectWord: true,
      });
    };
    const onPointerDown = (e: PointerEvent) => {
      if (active && !active.editor.clone.contains(e.target as Node)) finish(active, false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (entriesRef.current.size === 0) return;
        e.preventDefault();
        void save();
        return;
      }
      if (e.key === 'Escape') {
        if (active) {
          e.preventDefault();
          e.stopPropagation();
          finish(active, true);
          return;
        }
        if (selected) {
          setSelected(null);
          return;
        }
        void leave();
        return;
      }
      if (e.key === 'Enter' && !active && selected && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const typing = (e.target as HTMLElement | null)?.closest?.(
          'input, textarea, select, button, a, [contenteditable]',
        );
        if (typing) return;
        e.preventDefault();
        if (entriesRef.current.has(selected.anchor)) begin(selected.anchor, null, false);
        else setWantEdit({ anchor: selected.anchor, at: null, selectWord: false });
      }
    };

    container.addEventListener('pointermove', onMove, true);
    container.addEventListener('click', onClick, true);
    container.addEventListener('dblclick', onDblClick, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      container.removeEventListener('pointermove', onMove, true);
      container.removeEventListener('click', onClick, true);
      container.removeEventListener('dblclick', onDblClick, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [container, insideChrome, entryAt, active, selected, begin, finish, save, leave]);

  // Typing is applied by hand to the run under the caret — see inline-edit.ts
  // for why the browser is not allowed to. IME composition is the exception:
  // it cannot be cancelled, so it runs natively and is checked afterwards.
  useEffect(() => {
    if (!active) return;
    const { clone, runs } = active.editor;
    let beforeComposition: { html: Node; texts: string[] } | null = null;

    const record = (before: string[], coalesce: boolean) => {
      const now = Date.now();
      if (!(coalesce && now - active.lastInsert < 1000)) active.undo.push(before);
      active.lastInsert = coalesce ? now : 0;
      active.redo = [];
    };
    const step = (forward: boolean) => {
      const from = forward ? active.redo : active.undo;
      const to = forward ? active.undo : active.redo;
      const texts = from.pop();
      if (!texts) return;
      to.push(readRuns(runs));
      writeRuns(runs, texts);
      active.lastInsert = 0;
      const last = runs[runs.length - 1];
      if (last) placeCaret(last.el, (last.el.textContent ?? '').length);
      refresh();
    };

    const onBeforeInput = (e: InputEvent) => {
      const type = e.inputType;
      if (e.isComposing || type === 'insertCompositionText') return;
      e.preventDefault();
      if (type === 'historyUndo' || type === 'historyRedo') {
        step(type === 'historyRedo');
        return;
      }
      let text: string;
      if (type === 'insertParagraph' || type === 'insertLineBreak') {
        // A run is one string; outside a code block a newline has nowhere to go.
        if (!active.pre) {
          finish(active, false);
          return;
        }
        text = '\n';
      } else if (type.startsWith('insert')) {
        text = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
        if (!active.pre) text = text.replace(/\s*\n\s*/g, ' ');
      } else if (type.startsWith('delete')) {
        text = '';
      } else {
        return;
      }
      const range = e.getTargetRanges()[0] ?? fallbackRange(type);
      if (!range) return;
      const before = readRuns(runs);
      if (replaceInRun(clone, range, text)) {
        record(before, type === 'insertText' && text.trim() !== '');
        refresh();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || (key === 'y' && e.ctrlKey)) {
        e.preventDefault();
        step(e.shiftKey || key === 'y');
      } else if (key === 'b' || key === 'i' || key === 'u') {
        e.preventDefault();
      }
    };
    const onCompositionStart = () => {
      beforeComposition = { html: clone.cloneNode(true), texts: readRuns(runs) };
    };
    const onCompositionEnd = () => {
      const snapshot = beforeComposition;
      beforeComposition = null;
      if (runs.every((run) => clone.contains(run.el))) {
        if (snapshot) record(snapshot.texts, false);
        refresh();
        return;
      }
      // The composition replaced a selection that ran past the edge of a run
      // and took the run's span with it. Put the structure back.
      if (!snapshot) return;
      clone.replaceChildren(...Array.from(snapshot.html.childNodes));
      for (const run of runs) {
        const el = clone.querySelector<HTMLElement>(`[data-od-run="${run.index}"]`);
        if (el) run.el = el;
      }
      setStatus('Type inside one run of text — the markup between runs stays as written.');
      refresh();
    };

    clone.addEventListener('beforeinput', onBeforeInput);
    clone.addEventListener('keydown', onKeyDown);
    clone.addEventListener('compositionstart', onCompositionStart);
    clone.addEventListener('compositionend', onCompositionEnd);
    return () => {
      clone.removeEventListener('beforeinput', onBeforeInput);
      clone.removeEventListener('keydown', onKeyDown);
      clone.removeEventListener('compositionstart', onCompositionStart);
      clone.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [active, finish, refresh]);

  // Report the pick to the dev server so `current.json` can answer "this
  // element" for an agent. Clearing the selection clears it there too.
  useEffect(() => {
    if (!import.meta.hot) return;
    import.meta.hot.send('open-doc:current', {
      selection: selected
        ? {
            line: selected.line,
            column: selected.column,
            tagName: selected.anchor.tagName.toLowerCase(),
            text: normalize(selected.anchor.textContent ?? '').slice(0, 120),
          }
        : null,
    });
  }, [selected]);

  // Read the element's text from source, not from the DOM: only source can say
  // which runs are editable and which are markup we must not touch.
  useEffect(() => {
    setResolution(null);
    if (!selected) return;
    let cancelled = false;
    const params = new URLSearchParams({
      docId,
      locs: formatLocs(candidateLocs(selected.anchor)),
      shown: normalize(selected.anchor.textContent ?? '').slice(0, 400),
    });
    fetch(`/__edit/text?${params}`)
      .then((res) => res.json())
      .then((body: ResolvedTarget & { error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setStatus(body.error);
          return;
        }
        // Last line of defence: every run the source offers has to be visible
        // in the element the user clicked. A drifted resolution would
        // otherwise let a save rewrite someone else's words.
        const shownText = normalize(selected.anchor.textContent ?? '');
        const runs = (body.parts ?? []).filter((part) => part.kind === 'text');
        const belongs =
          runs.length > 0 &&
          runs.every((part) => part.kind === 'text' && shownText.includes(normalize(part.value)));
        setResolution({
          anchor: selected.anchor,
          value:
            body.editable && !belongs
              ? { ...body, editable: false, reason: 'source text does not match this element' }
              : body,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('could not read source');
      });
    return () => {
      cancelled = true;
    };
  }, [selected, docId]);

  useEffect(() => {
    if (!wantEdit || !target || selected?.anchor !== wantEdit.anchor) return;
    setWantEdit(null);
    if (!target.editable) {
      setStatus(target.reason ?? 'This text cannot be edited here.');
      return;
    }
    begin(wantEdit.anchor, wantEdit.at, wantEdit.selectWord, target);
  }, [wantEdit, target, selected, begin]);

  const saveComment = async () => {
    if (!selected || note.trim() === '' || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/__edit/comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          docId,
          line: target?.line ?? selected.line,
          column: target?.column ?? selected.column,
          note,
          hint: selected.tag,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setNote('');
        setStatus('Marked in source — run /apply-comments');
      } else {
        setStatus(body.error ?? 'Could not add comment');
      }
    } finally {
      setBusy(false);
    }
  };

  const visible = (anchor: HTMLElement | null | undefined) =>
    anchor ? (entriesRef.current.get(anchor)?.editor.clone ?? anchor) : null;
  const selectedEl = visible(selected?.anchor);
  const hint = active
    ? 'Enter to keep · Esc to revert'
    : selected
      ? 'Double-click or Enter to edit text · Esc to deselect'
      : 'Click to select · double-click to edit · Esc to leave';

  const overlay = container
    ? createPortal(
        <>
          <div className="pointer-events-none absolute inset-0 z-30">
            {pending.map((entry) =>
              entry.editor.clone === selectedEl ? null : (
                <Frame
                  key={`${entry.line}:${entry.column}:${entry.shown}`}
                  anchor={entry.editor.clone}
                  container={container}
                  variant="pending"
                />
              ),
            )}
            <Frame
              anchor={hover === selectedEl ? null : hover}
              container={container}
              variant="hover"
            />
            <Frame anchor={selectedEl} container={container} variant="selected" />
          </div>
          {pending.length > 0 ? (
            <div
              ref={barRef}
              role="toolbar"
              aria-label="Unsaved edits"
              className="sticky bottom-3 z-40 mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-background py-1 pr-1 pl-3 text-xs shadow-md"
            >
              <span className="mr-1 text-muted-foreground">
                {pending.length} unsaved edit{pending.length > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={discard}
                disabled={busy}
                className="h-7 rounded-full px-3 transition-colors hover:bg-accent disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                title="Save (⌘S)"
                className="flex h-7 items-center gap-1.5 rounded-full bg-primary px-3 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                Save
              </button>
            </div>
          ) : (
            <div className="pointer-events-none sticky bottom-3 z-40 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1.5 text-[11px] text-background">
              {status ?? hint}
            </div>
          )}
        </>,
        container,
      )
    : null;

  return (
    <>
      {overlay}
      {selected && !panelHidden && (
        <aside
          ref={panelRef}
          aria-label="Element"
          className="flex w-72 flex-none flex-col border-border border-l bg-background"
        >
          <header className="flex h-10 flex-none items-center justify-between border-border border-b px-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              &lt;{selected.tag}&gt; · {target?.line ?? selected.line}:
              {target?.column ?? selected.column}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelected(null)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">
              Text
            </span>
            {target === null ? (
              <div className="grid h-16 place-items-center">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              </div>
            ) : target.editable ? (
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                {active?.anchor === selected.anchor
                  ? 'Editing on the page. Enter keeps the change, Esc reverts it.'
                  : 'Double-click the text on the page, or press Enter, to edit it where it is printed.'}
                {target.parts.some((part) => part.kind === 'markup') &&
                  ' Inline markup stays as written.'}
              </p>
            ) : (
              <p className="mt-1 rounded border border-border bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                {target.reason ?? 'Not editable here.'}
              </p>
            )}

            <span className="mt-4 block text-[10px] text-muted-foreground uppercase tracking-wider">
              Comment for the agent
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveComment();
              }}
              rows={3}
              placeholder="make this bold, shorten to one line…"
              className="mt-1 w-full resize-y rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
            <button
              type="button"
              onClick={saveComment}
              disabled={busy || note.trim() === ''}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              <MessageSquarePlus className="size-3" />
              Mark comment
            </button>

            {status && <p className="mt-2 text-[11px] text-muted-foreground">{status}</p>}
          </div>
        </aside>
      )}
    </>
  );
}

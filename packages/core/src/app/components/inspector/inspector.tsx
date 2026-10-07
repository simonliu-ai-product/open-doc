import {
  Bold,
  Check,
  Code,
  Copy,
  Heading,
  Image,
  Italic,
  Link2,
  List,
  Lock,
  MessageSquarePlus,
  Pencil,
  Pilcrow,
  RemoveFormatting,
  Square,
  Table,
  Type,
  Unlink,
  X,
} from 'lucide-react';
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
import { isSafeHref } from '../../lib/href';
import { useT } from '../../lib/i18n';
import { candidateLocs, formatLocs } from '../../lib/inspector/fiber';
import type { StyleInfo } from '../../lib/inspector/format';
import {
  cleanRun,
  cleanSegments,
  clearFormatting,
  EDITING_ATTR,
  focusAt,
  hasMark,
  hrefOf,
  isFormatted,
  isRunChanged,
  linkAt,
  locate,
  type Mark,
  type MountedEditor,
  mountEditor,
  normalize,
  placeCaret,
  type Run,
  readSegments,
  replaceInRun,
  restoreRuns,
  runLength,
  runText,
  type Segment,
  selectInRun,
  setHref,
  shownText,
  snapshotRuns,
  toggleMark,
  writeSegments,
} from '../../lib/inspector/inline-edit';
import { PROP_ATTR } from '../../lib/source-loc';
import { useHistory } from '../history-provider';
import { OverlayFrame } from '../overlay-frame';
import { CollapsibleSection, Section } from '../panel/fields';
import { PanelIconButton, PanelShell } from '../panel/panel-shell';
import { FieldSource } from './field-source';
import { FormatSection } from './format-section';
import { elementsAt, styleKey, useStyleEdits } from './use-style-edits';

type TextPart =
  | { kind: 'text'; index: number; value: string; formattable?: true; segments?: Segment[] }
  | { kind: 'markup'; label: string };

type ResolvedTarget = {
  line: number;
  column: number;
  editable: boolean;
  text: string;
  parts: TextPart[];
  reason?: string;
  /** Values `<Field>` prints from the document's records. */
  fields?: { names: string[]; file: string | null };
};

export const LOC_ATTR = 'data-od-loc';

export type InspectorTarget = {
  line: number;
  column: number;
  anchor: HTMLElement;
  tag: string;
  /** Set when the words are an attribute of a component's call site. */
  prop?: string;
};

/**
 * Text being edited on the page. `line:column` is where the server resolved the
 * words to — not necessarily the clicked element's own tag, when the words are
 * a prop written at a call site.
 */
type Entry = {
  /** Stable across a reload that moves the editor to a new element, so undo can find it. */
  id: number;
  anchor: HTMLElement;
  editor: MountedEditor;
  line: number;
  column: number;
  prop?: string;
  shown: string;
  pre: boolean;
  undo: Segment[][][];
  redo: Segment[][][];
  lastInsert: number;
  /** Where the caret was, so a transplanted editor can put it back. */
  caret: { run: number; from: number; to: number } | null;
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
const FRAME_STYLE: Record<'hover' | 'selected' | 'pending' | 'twin', CSSProperties> = {
  hover: { outline: '1.5px dashed #3b82f6', background: 'rgba(59,130,246,0.05)' },
  selected: { outline: '2px solid #3b82f6', background: 'rgba(59,130,246,0.1)' },
  pending: { outline: '1.5px dashed #3b82f6', outlineOffset: 2 },
  twin: { outline: '1px solid rgba(59,130,246,0.55)', background: 'rgba(59,130,246,0.05)' },
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
  const prop = host.getAttribute(PROP_ATTR) ?? undefined;
  return { line, column, anchor: host, tag: host.tagName.toLowerCase(), ...(prop ? { prop } : {}) };
}

/** What the panel's header calls the selected element — by role, not by tag. */
function kindOf(tag: string): { label: string; vars?: Record<string, number>; icon: typeof Type } {
  const level = /^h([1-6])$/.exec(tag)?.[1];
  if (level) return { label: 'Heading {level}', vars: { level: Number(level) }, icon: Heading };
  if (tag === 'p' || tag === 'blockquote') return { label: 'Paragraph', icon: Pilcrow };
  if (tag === 'li' || tag === 'ul' || tag === 'ol') return { label: 'List', icon: List };
  if (tag === 'td' || tag === 'th' || tag === 'table' || tag === 'tr') {
    return { label: 'Table', icon: Table };
  }
  if (tag === 'img' || tag === 'svg' || tag === 'figure') return { label: 'Image', icon: Image };
  if (
    ['span', 'strong', 'em', 'b', 'i', 'a', 'code', 'small', 'figcaption', 'label'].includes(tag)
  ) {
    return { label: 'Text', icon: Type };
  }
  return { label: 'Box', icon: Square };
}

type FrameVariant = keyof typeof FRAME_STYLE;

function Frame({
  variant,
  ...rest
}: {
  anchor: HTMLElement | null;
  container: HTMLElement;
  variant: FrameVariant;
}) {
  return <OverlayFrame {...rest} style={FRAME_STYLE[variant]} />;
}

const TOOLBAR_GAP = 6;

type LinkDraft = { run: Run; from: number; to: number; value: string; existing: boolean };

// Icons read at 75% of the foreground and fall to 30% when disabled: dimming a
// muted colour instead left disabled icons all but invisible on the dark theme.
const TOOL_CLASS =
  'flex size-8 items-center justify-center rounded text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60 disabled:text-foreground/30 disabled:hover:bg-transparent aria-pressed:bg-accent aria-pressed:text-foreground';

/**
 * Inline formatting, floating over the text being edited: emphasis, code,
 * links, and a way to take them off. Size, colour and alignment are the
 * element panel's, which offers the document's design tokens before a
 * one-off value — here they would style a few words and quietly fork it.
 */
function TextToolbar({
  anchor,
  container,
  emphasis,
  link,
  onFormat,
  onOpenLink,
  onClear,
  onLinkChange,
  onLinkApply,
  onLinkCancel,
  toolbarRef,
}: {
  anchor: HTMLElement;
  container: HTMLElement;
  emphasis: Emphasis;
  link: LinkDraft | null;
  onFormat: (mark: Mark) => void;
  onOpenLink: () => void;
  onClear: () => void;
  onLinkChange: (value: string) => void;
  onLinkApply: () => void;
  onLinkCancel: () => void;
  toolbarRef: React.RefObject<HTMLDivElement>;
}) {
  const t = useT();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Same measuring contract as Frame: after every render, compared by value.
  useLayoutEffect(() => {
    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const height = toolbarRef.current?.offsetHeight ?? 36;
      const above = a.top - c.top - height - TOOLBAR_GAP;
      const next = {
        left: a.left - c.left + container.scrollLeft,
        top: (above >= 0 ? above : a.bottom - c.top + TOOLBAR_GAP) + container.scrollTop,
      };
      setPosition((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      );
    };
    measure();
    container.addEventListener('scroll', measure, { passive: true });
    return () => container.removeEventListener('scroll', measure);
  });

  const title = (label: string, keys: string) =>
    emphasis.canFormat ? `${label} (${keys})` : emphasis.reason ? t(emphasis.reason) : label;
  const invalid = link !== null && link.value.trim() !== '' && !isSafeHref(link.value.trim());

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={t('Text formatting')}
      className="pointer-events-auto absolute z-40 flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-md"
      style={position ?? { visibility: 'hidden' }}
      // Keep focus, and the selection, in the text being edited — except for
      // the link field, which has to take focus to be typed into.
      onPointerDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {link ? (
        <>
          <input
            // biome-ignore lint/a11y/noAutofocus: the field opens on an explicit request and is the only thing to do next
            autoFocus
            type="url"
            aria-label={t('Link address')}
            aria-invalid={invalid}
            placeholder={t('https://… or #section')}
            value={link.value}
            onChange={(e) => onLinkChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!invalid) onLinkApply();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onLinkCancel();
              }
            }}
            title={invalid ? t('Only web, mail, phone, or in-document addresses') : undefined}
            className="h-8 w-64 rounded border border-border bg-transparent px-2 text-xs outline-none focus:border-foreground/40 aria-invalid:border-destructive"
          />
          <button
            type="button"
            aria-label={t('Apply link')}
            title={`${t('Apply')} (Enter)`}
            disabled={invalid}
            onClick={onLinkApply}
            className={TOOL_CLASS}
          >
            <Check className="size-3.5" />
          </button>
          {link.existing && (
            <button
              type="button"
              aria-label={t('Remove link')}
              title={t('Remove link')}
              onClick={() => {
                onLinkChange('');
                onLinkApply();
              }}
              className={TOOL_CLASS}
            >
              <Unlink className="size-3.5" />
            </button>
          )}
        </>
      ) : (
        <>
          {(
            [
              ['bold', 'Bold', '⌘B', Bold],
              ['italic', 'Italic', '⌘I', Italic],
              ['code', 'Code', '⌘E', Code],
            ] as const
          ).map(([mark, label, keys, Icon]) => {
            const styled = mark === 'bold' && emphasis.boldFromStyle;
            return (
              <button
                key={mark}
                type="button"
                aria-label={t(label)}
                aria-pressed={emphasis[mark]}
                title={
                  styled
                    ? t('Already bold — this element’s own style sets it')
                    : title(t(label), keys)
                }
                disabled={!emphasis.canFormat || styled}
                onClick={() => onFormat(mark)}
                className={TOOL_CLASS}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            aria-label={t('Link')}
            aria-pressed={emphasis.href !== null}
            title={
              emphasis.linkable
                ? `${t('Link')} (⌘K)`
                : emphasis.reason
                  ? t(emphasis.reason)
                  : t('Link')
            }
            disabled={!emphasis.linkable}
            onClick={onOpenLink}
            className={TOOL_CLASS}
          >
            <Link2 className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t('Clear formatting')}
            title={title(t('Clear formatting'), '⌘\\')}
            disabled={!emphasis.canFormat}
            onClick={onClear}
            className={TOOL_CLASS}
          >
            <RemoveFormatting className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function dirtyRuns(entry: Entry): number {
  return entry.editor.runs.filter(isRunChanged).length;
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

function selectionIn(entry: Entry): { run: Run; from: number; to: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const at = locate(entry.editor.clone, selection.getRangeAt(0));
  const run = at && entry.editor.runs.find((candidate) => candidate.el === at.run);
  return at && run ? { run, from: at.from, to: at.to } : null;
}

type Emphasis = {
  /** Words are selected, or the caret sits in a link — something the toolbar can act on. */
  actionable: boolean;
  canFormat: boolean;
  /** A link can be edited from a bare caret inside it, not only from a selection. */
  linkable: boolean;
  reason?: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  /** Bold because the element is styled bold, not because the words are marked. */
  boldFromStyle: boolean;
  href: string | null;
};

const PLAIN: Omit<Emphasis, 'actionable' | 'canFormat' | 'linkable' | 'reason'> = {
  bold: false,
  italic: false,
  code: false,
  boldFromStyle: false,
  href: null,
};

function emphasisAt(entry: Entry): Emphasis {
  const at = selectionIn(entry);
  if (!at) {
    return {
      ...PLAIN,
      actionable: false,
      canFormat: false,
      linkable: false,
      reason: 'Select words to format',
    };
  }
  if (!at.run.formattable) {
    return {
      ...PLAIN,
      actionable: at.from !== at.to,
      canFormat: false,
      linkable: false,
      reason: 'This text is passed in as a string — formatting needs text written in the document',
    };
  }
  const segments = readSegments(at.run.el);
  if (at.from === at.to) {
    const link = linkAt(segments, at.from);
    return {
      ...PLAIN,
      actionable: link !== null,
      canFormat: false,
      linkable: link !== null,
      reason: 'Select words to format',
      href: link?.href ?? null,
    };
  }
  const bold = hasMark(segments, at.from, at.to, 'bold');
  return {
    actionable: true,
    canFormat: true,
    linkable: true,
    bold,
    italic: hasMark(segments, at.from, at.to, 'italic'),
    code: hasMark(segments, at.from, at.to, 'code'),
    boldFromStyle: !bold && Number.parseInt(getComputedStyle(at.run.el).fontWeight, 10) >= 600,
    href: hrefOf(segments, at.from, at.to),
  };
}

/** What the document view's save card drives: page edits are saved and discarded from there. */
export type SaveOutcome = { ok: boolean; error?: string };

export type InspectorControls = {
  save: () => Promise<SaveOutcome>;
  discard: () => void;
};

type Props = {
  docId: string;
  /** The scroll container the pages live in. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The design panel shares the right dock; the panel opened last holds it. */
  panelHidden: boolean;
  /** An element was picked on the page — the dock should show its panel. */
  onPick: () => void;
  /** The reader came here to leave a comment: the element panel opens on the note. */
  commentFirst?: boolean;
  /** Waiting for the element a new comment is about. */
  picking?: boolean;
  onCancelPick?: () => void;
  /** The save card is showing, so the hint underneath it steps aside. */
  quiet: boolean;
  onExit: () => void;
  /** Set to a function that saves any unsaved text, then leaves edit mode. */
  exitRef: MutableRefObject<(() => void) | null>;
  controlsRef: MutableRefObject<InspectorControls | null>;
  onPendingChange: (count: number) => void;
};

export function Inspector({
  docId,
  containerRef,
  panelHidden,
  onPick,
  commentFirst = false,
  picking = false,
  onCancelPick,
  quiet,
  onExit,
  exitRef,
  controlsRef,
  onPendingChange,
}: Props) {
  const history = useHistory();
  const t = useT();
  const nextIdRef = useRef(1);
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
  const activeRef = useRef<Entry | null>(null);
  activeRef.current = active;
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef(new Map<HTMLElement, Entry>());
  const sessionStartRef = useRef<Segment[][]>([]);
  const firstClickRef = useRef<{ anchor: HTMLElement; at: At; time: number } | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useLayoutEffect(() => setContainer(containerRef.current), [containerRef]);

  const {
    count: styleCount,
    edits: styleEdits,
    change: changeStyle,
    pendingFor,
    discard: discardStyles,
    forget: forgetStyles,
    revert: revertStyles,
    repaint: repaintStyles,
  } = useStyleEdits(container);
  const [styleInfo, setStyleInfo] = useState<{ anchor: HTMLElement; value: StyleInfo } | null>(
    null,
  );

  const insideChrome = useCallback(
    (node: EventTarget | null) =>
      (panelRef.current?.contains(node as Node) ?? false) ||
      (toolbarRef.current?.contains(node as Node) ?? false),
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
        const shown = shownText(anchor);
        const editor = mountEditor(anchor, runs);
        if (!editor) {
          setStatus(
            t(
              'The text on the page does not line up with its source, so it cannot be edited here.',
            ),
          );
          return;
        }
        entry = {
          id: nextIdRef.current++,
          anchor,
          editor,
          line: resolved.line,
          ...(anchor.hasAttribute(PROP_ATTR)
            ? { prop: anchor.getAttribute(PROP_ATTR) as string }
            : {}),
          column: resolved.column,
          shown,
          pre: getComputedStyle(anchor).whiteSpace.startsWith('pre'),
          undo: [],
          redo: [],
          lastInsert: 0,
          caret: null,
        };
        entriesRef.current.set(anchor, entry);
      }
      sessionStartRef.current = snapshotRuns(entry.editor.runs);
      setStatus(null);
      setActive(entry);
      focusAt(entry.editor.clone, pointIn(entry.editor.clone, at), selectWord);
    },
    [t],
  );

  /** Puts an editor's runs back to a snapshot, wherever a reload has since moved it. */
  const applySnapshot = useCallback(
    (id: number, snapshot: Segment[][]) => {
      for (const entry of entriesRef.current.values()) {
        if (entry.id !== id) continue;
        restoreRuns(entry.editor.runs, snapshot);
        refresh();
        return;
      }
    },
    [refresh],
  );

  /**
   * Ends the typing session. The change stays on the page, unsaved, unless
   * reverted — and becomes one step in the view's history, beside design
   * changes. Inside the field, ⌘Z still steps through the typing itself.
   */
  const finish = useCallback(
    (entry: Entry, revert: boolean) => {
      const start = sessionStartRef.current;
      if (revert) restoreRuns(entry.editor.runs, start);
      const end = snapshotRuns(entry.editor.runs);
      const changed = !revert && JSON.stringify(end) !== JSON.stringify(start);
      if (changed) {
        const { id } = entry;
        history.record({
          undo: () => applySnapshot(id, start),
          redo: () => applySnapshot(id, end),
        });
      }
      // An editor a history step points at stays, even when it now reads as
      // the source does: undo and redo need it to put the words back.
      if (dirtyRuns(entry) === 0 && !changed) drop(entry);
      else entry.editor.clone.blur();
      setActive((current) => (current === entry ? null : current));
      refresh();
    },
    [drop, refresh, history, applySnapshot],
  );

  const discard = useCallback(() => {
    for (const entry of [...entriesRef.current.values()]) drop(entry);
    discardStyles();
    setActive(null);
    refresh();
    setStatus(t('Discarded unsaved edits'));
  }, [drop, refresh, discardStyles, t]);

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

  /**
   * Bold or italic on the selected words. Only text written between tags can
   * carry it — a prop or an array entry is a string in source, and a string
   * has nowhere to put a `<strong>`.
   */
  const reformat = useCallback(
    (run: Run, from: number, to: number, change: (segments: Segment[]) => Segment[]) => {
      if (!active) return;
      active.undo.push(snapshotRuns(active.editor.runs));
      active.redo = [];
      active.lastInsert = 0;
      writeSegments(run.el, change(readSegments(run.el)));
      active.editor.clone.focus({ preventScroll: true });
      selectInRun(run.el, from, to);
      refresh();
    },
    [active, refresh],
  );

  const format = useCallback(
    (mark: Mark) => {
      if (!active) return;
      const at = selectionIn(active);
      if (!at || at.from === at.to || !at.run.formattable) return;
      if (mark === 'bold' && emphasisAt(active).boldFromStyle) return;
      reformat(at.run, at.from, at.to, (segments) => toggleMark(segments, at.from, at.to, mark));
    },
    [active, reformat],
  );

  const clear = useCallback(() => {
    if (!active) return;
    const at = selectionIn(active);
    if (!at || at.from === at.to || !at.run.formattable) return;
    reformat(at.run, at.from, at.to, (segments) => clearFormatting(segments, at.from, at.to));
  }, [active, reformat]);

  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  useEffect(() => {
    void active;
    setLinkDraft(null);
  }, [active]);

  /** Opens the link field over the selection, or over the whole link the caret is in. */
  const openLink = useCallback(() => {
    if (!active) return;
    const at = selectionIn(active);
    if (!at?.run.formattable) return;
    const segments = readSegments(at.run.el);
    let { from, to } = at;
    if (from === to) {
      const link = linkAt(segments, from);
      if (!link) return;
      ({ from, to } = link);
    }
    const href = hrefOf(segments, from, to);
    setLinkDraft({ run: at.run, from, to, value: href ?? '', existing: href !== null });
  }, [active]);

  const applyLink = useCallback(() => {
    if (!linkDraft) return;
    const href = linkDraft.value.trim();
    if (href !== '' && !isSafeHref(href)) return;
    const { run, from, to } = linkDraft;
    setLinkDraft(null);
    reformat(run, from, to, (segments) => setHref(segments, from, to, href || null));
  }, [linkDraft, reformat]);

  const cancelLink = useCallback(() => {
    if (!active || !linkDraft) return;
    const { run, from, to } = linkDraft;
    setLinkDraft(null);
    active.editor.clone.focus({ preventScroll: true });
    selectInRun(run.el, from, to);
  }, [active, linkDraft]);

  const [emphasis, setEmphasis] = useState<Emphasis | null>(null);
  useEffect(() => {
    if (!active) {
      setEmphasis(null);
      return;
    }
    const update = () => {
      const at = selectionIn(active);
      if (at) active.caret = { run: active.editor.runs.indexOf(at.run), from: at.from, to: at.to };
      setEmphasis(emphasisAt(active));
    };
    update();
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [active]);

  const save = useCallback(async (): Promise<SaveOutcome> => {
    if (active) finish(active, false);
    // Editors undo brought back to the source's words have nothing to write.
    for (const entry of [...entriesRef.current.values()]) {
      if (dirtyRuns(entry) === 0) drop(entry);
    }
    const entries = [...entriesRef.current.values()];
    const edits: Array<Record<string, unknown>> = [];
    const owners: Entry[] = [];
    for (const entry of entries) {
      for (const run of entry.editor.runs) {
        if (!isRunChanged(run)) continue;
        const segments = cleanSegments(readSegments(run.el), run.expected);
        edits.push({
          line: entry.line,
          column: entry.column,
          index: run.index,
          expected: run.expected,
          shown: entry.shown,
          ...(entry.prop ? { prop: entry.prop } : {}),
          text: cleanRun(runText(run.el), run.expected),
          ...(run.formattable ? { segments } : {}),
        });
        owners.push(entry);
      }
    }
    const styles = styleEdits();
    if (edits.length === 0 && styles.length === 0) return { ok: true };

    setBusy(true);
    try {
      // Text and style go in one request, so the file is read, spliced and
      // written once — two requests would each start from the file before
      // the other, and the second would put back what the first changed.
      const res = await fetch('/__edit/batch', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          docId,
          texts: edits,
          styles: styles.map(({ line, column, tag, changes, expected }) => ({
            line,
            column,
            tag,
            changes,
            expected,
          })),
        }),
      });
      const body = (await res.json()) as {
        texts?: Outcome[];
        styles?: Outcome[];
        error?: string;
      };
      if (!res.ok || !body.texts || !body.styles) {
        const error = body.error ?? t('Save failed');
        setStatus(error);
        return { ok: false, error };
      }
      const results = body.texts;
      const styleResults = body.styles;
      const failures = [...results, ...styleResults].filter(
        (result): result is Extract<Outcome, { ok: false }> => !result.ok,
      );
      for (const entry of new Set(owners)) {
        const wrote = results.some((result, at) => result.ok && owners[at] === entry);
        if (wrote) settle(entry);
        else drop(entry);
      }
      const keys = styles.map(styleKey);
      forgetStyles(keys.filter((_, at) => styleResults[at]?.ok));
      revertStyles(keys.filter((_, at) => !styleResults[at]?.ok));
      refresh();
      setSelected(null);
      if (failures.length === 0) {
        setStatus(t('Saved to source'));
        return { ok: true };
      }
      const error = t('{failed} of {total} not saved — {reason}', {
        failed: failures.length,
        total: edits.length + styles.length,
        reason: failures[0]?.error ?? t('refused'),
      });
      setStatus(error);
      return { ok: false, error };
    } catch {
      setStatus(t('Save failed'));
      return { ok: false, error: t('Save failed') };
    } finally {
      setBusy(false);
    }
  }, [active, docId, drop, finish, refresh, settle, styleEdits, forgetStyles, revertStyles, t]);

  const leave = useCallback(async () => {
    if ((await save()).ok) onExit();
  }, [save, onExit]);

  useEffect(() => {
    exitRef.current = () => void leave();
    controlsRef.current = { save, discard };
    return () => {
      exitRef.current = null;
      controlsRef.current = null;
    };
  }, [exitRef, leave, controlsRef, save, discard]);

  const pendingCount = pending.length + styleCount;
  useEffect(() => {
    onPendingChange(pendingCount);
  }, [pendingCount, onPendingChange]);
  useEffect(() => () => onPendingChange(0), [onPendingChange]);

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
    if (pendingCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingCount]);

  // An external write — an agent, the design panel, another save — reloads the
  // document and replaces elements, clones and all. When the element at the
  // same source location still reads what it did when editing began, the
  // reload did not touch these words: the editor moves onto it with its unsaved
  // text, its undo history and its caret. Only when the words themselves
  // changed is the edit given up, and said so.
  useEffect(() => {
    if (!container) return;
    const observer = new MutationObserver(() => {
      const successor = (anchor: HTMLElement): HTMLElement | null => {
        if (anchor.isConnected) return anchor;
        const loc = anchor.getAttribute(LOC_ATTR);
        if (!loc) return null;
        // A component's root and the caption it prints share one call site;
        // the prop is what tells them apart.
        const prop = anchor.getAttribute(PROP_ATTR);
        const which = prop ? `[${PROP_ATTR}="${CSS.escape(prop)}"]` : `:not([${PROP_ATTR}])`;
        return container.querySelector<HTMLElement>(`[${LOC_ATTR}="${CSS.escape(loc)}"]${which}`);
      };

      let lost = 0;
      let replaced = false;
      for (const entry of [...entriesRef.current.values()]) {
        if (entry.anchor.isConnected) continue;
        replaced = true;
        const wasActive = activeRef.current === entry;
        const changed = dirtyRuns(entry) > 0;
        const snapshot = snapshotRuns(entry.editor.runs);
        entriesRef.current.delete(entry.anchor);
        entry.editor.restore();

        const next = successor(entry.anchor);
        const editor =
          next && shownText(next) === entry.shown
            ? mountEditor(
                next,
                entry.editor.runs.map((run) => ({
                  index: run.index,
                  value: run.expected,
                  formattable: run.formattable,
                  ...(isFormatted(run.expectedSegments) ? { segments: run.expectedSegments } : {}),
                })),
              )
            : null;
        if (!next || !editor) {
          if (changed) lost++;
          if (wasActive) setActive(null);
          continue;
        }
        restoreRuns(editor.runs, snapshot);
        const moved: Entry = { ...entry, anchor: next, editor };
        entriesRef.current.set(next, moved);
        if (wasActive) {
          setActive(moved);
          moved.editor.clone.focus({ preventScroll: true });
          const caret = entry.caret;
          const run = caret ? moved.editor.runs[caret.run] : undefined;
          if (caret && run) selectInRun(run.el, caret.from, caret.to);
        }
      }
      if (replaced) refresh();
      repaintStyles();
      if (lost > 0) {
        setStatus(
          lost > 1
            ? t('The document reloaded with new text here — {count} unsaved edits were lost', {
                count: lost,
              })
            : t('The document reloaded with new text here — {count} unsaved edit was lost', {
                count: lost,
              }),
        );
      }

      // A selection carries over the same way — otherwise a reload between
      // the two clicks of a double-click leaves the edit waiting on a node
      // that is gone.
      setSelected((prev) => {
        if (!prev || prev.anchor.isConnected) return prev;
        const anchor = successor(prev.anchor);
        return anchor ? { ...prev, anchor } : null;
      });
      setWantEdit((prev) => {
        if (!prev || prev.anchor.isConnected) return prev;
        const anchor = successor(prev.anchor);
        return anchor ? { ...prev, anchor } : null;
      });
      const first = firstClickRef.current;
      if (first && !first.anchor.isConnected) {
        const anchor = successor(first.anchor);
        firstClickRef.current = anchor ? { ...first, anchor } : null;
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [container, refresh, repaintStyles, t]);

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
        onPickRef.current();
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
      onPickRef.current();
      setStatus(null);
      setNote('');
    };
    // On the window, not the pane: the first click opens the element panel,
    // and in two-up or grid a sheet near the right edge can have the panel
    // open right under the pointer — the second click then lands on it, and a
    // listener on the pane would never hear the double-click at all.
    const onDblClick = (e: MouseEvent) => {
      const first = firstClickRef.current;
      firstClickRef.current = null;
      if (first && Date.now() - first.time < DOUBLE_CLICK_MS) {
        e.preventDefault();
        setWantEdit({ anchor: first.anchor, at: first.at, selectWord: true });
        return;
      }
      if (!container.contains(e.target as Node) || insideChrome(e.target)) return;
      if (entryAt(e.target)) return;
      const target = targetFrom(e.target as Element);
      if (!target?.anchor.contains(e.target as Node)) return;
      e.preventDefault();
      setSelected((prev) => (prev?.anchor === target.anchor ? prev : target));
      onPickRef.current();
      setWantEdit({
        anchor: target.anchor,
        at: atIn(target.anchor, e.clientX, e.clientY),
        selectWord: true,
      });
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!active || active.editor.clone.contains(e.target as Node)) return;
      if (toolbarRef.current?.contains(e.target as Node)) return;
      finish(active, false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      // The link field handles its own Enter and Escape.
      if (toolbarRef.current?.contains(e.target as Node)) return;
      if (e.key === 'Escape') {
        if (active) {
          e.preventDefault();
          e.stopPropagation();
          finish(active, true);
          return;
        }
        if (picking && onCancelPick) {
          onCancelPick();
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
    window.addEventListener('dblclick', onDblClick, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      container.removeEventListener('pointermove', onMove, true);
      container.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onDblClick, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [
    container,
    insideChrome,
    entryAt,
    active,
    selected,
    begin,
    finish,
    leave,
    picking,
    onCancelPick,
  ]);

  // While a comment waits for its element, the page says so under the pointer.
  useEffect(() => {
    if (!container || !picking) return;
    container.style.cursor = 'crosshair';
    return () => {
      container.style.cursor = '';
    };
  }, [container, picking]);

  // Typing is applied by hand to the run under the caret — see inline-edit.ts
  // for why the browser is not allowed to. IME composition is the exception:
  // it cannot be cancelled, so it runs natively and is checked afterwards.
  useEffect(() => {
    if (!active) return;
    const { clone, runs } = active.editor;
    let beforeComposition: { html: Node; snapshot: Segment[][] } | null = null;

    const record = (before: Segment[][], coalesce: boolean) => {
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
      to.push(snapshotRuns(runs));
      restoreRuns(runs, texts);
      active.lastInsert = 0;
      const last = runs[runs.length - 1];
      if (last) placeCaret(last.el, runLength(last.el));
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
        // Enter keeps the change. Shift+Enter breaks the line — a `<br />` in
        // source, so only in text written between tags; a string passed in as
        // a prop has nowhere to put one. A code block keeps real newlines.
        if (!active.pre && type === 'insertParagraph') {
          finish(active, false);
          return;
        }
        if (!active.pre && !selectionIn(active)?.run.formattable) return;
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
      const before = snapshotRuns(runs);
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
      } else if (key === 'b' || key === 'i' || key === 'e') {
        e.preventDefault();
        format(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'code');
      } else if (key === 'k') {
        e.preventDefault();
        openLink();
      } else if (key === '\\') {
        e.preventDefault();
        clear();
      } else if (key === 'u') {
        e.preventDefault();
      }
    };
    const onCompositionStart = () => {
      beforeComposition = { html: clone.cloneNode(true), snapshot: snapshotRuns(runs) };
    };
    const onCompositionEnd = () => {
      const snapshot = beforeComposition;
      beforeComposition = null;
      if (runs.every((run) => clone.contains(run.el))) {
        if (snapshot) record(snapshot.snapshot, false);
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
      setStatus(t('Type inside one run of text — the markup between runs stays as written.'));
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
  }, [active, finish, refresh, format, openLink, clear, t]);

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
            text: shownText(selected.anchor).slice(0, 120),
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
      shown: shownText(selected.anchor).slice(0, 400),
      ...(selected.prop ? { prop: selected.prop } : {}),
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
        const visible = shownText(selected.anchor);
        const runs = (body.parts ?? []).filter((part) => part.kind === 'text');
        const belongs =
          runs.length > 0 &&
          runs.every((part) => part.kind === 'text' && visible.includes(normalize(part.value)));
        setResolution({
          anchor: selected.anchor,
          value:
            body.editable && !belongs
              ? { ...body, editable: false, reason: 'source text does not match this element' }
              : body,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus(t('could not read source'));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, docId, t]);

  // The Format section reads the element's own `style` from source: the page
  // shows the value, only source can say whether it is a token, a shared
  // style object's, or code.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const params = new URLSearchParams({
      docId,
      line: String(selected.line),
      column: String(selected.column),
      tag: selected.tag,
    });
    fetch(`/__edit/style?${params}`)
      .then((res) => res.json())
      .then((body: StyleInfo & { error?: string }) => {
        if (cancelled) return;
        setStyleInfo({
          anchor: selected.anchor,
          value: body.error ? { editable: false, reason: body.error } : body,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStyleInfo({
            anchor: selected.anchor,
            value: { editable: false, reason: 'could not read source' },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected, docId]);

  useEffect(() => {
    if (!wantEdit || !target || selected?.anchor !== wantEdit.anchor) return;
    setWantEdit(null);
    if (!target.editable) {
      setStatus(target.reason ? t(target.reason) : t('This text cannot be edited here.'));
      return;
    }
    begin(wantEdit.anchor, wantEdit.at, wantEdit.selectWord, target);
  }, [wantEdit, target, selected, begin, t]);

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
        setStatus(t('Marked in source — run /apply-comments'));
      } else {
        setStatus(body.error ?? t('Could not add comment'));
      }
    } finally {
      setBusy(false);
    }
  };

  const kind = kindOf(selected?.tag ?? '');
  const editingHere = active !== null && active.anchor === selected?.anchor;
  const startEdit = () => {
    if (!selected) return;
    if (entriesRef.current.has(selected.anchor)) begin(selected.anchor, null, false);
    else setWantEdit({ anchor: selected.anchor, at: null, selectWord: false });
  };
  // Every other element the selected one's source prints — a `.map()` row, a
  // block split across pages. A style change lands on all of them, so the
  // page shows them before it happens rather than the panel saying so.
  const twins =
    container && selected
      ? elementsAt(container, selected).filter(
          (el) => el !== selected.anchor && !el.hasAttribute(EDITING_ATTR),
        )
      : [];
  const KindIcon = kind.icon;
  const loc = selected
    ? `${target?.line ?? selected.line}:${target?.column ?? selected.column}`
    : '';

  const visible = (anchor: HTMLElement | null | undefined) =>
    anchor ? (entriesRef.current.get(anchor)?.editor.clone ?? anchor) : null;
  const selectedEl = visible(selected?.anchor);
  const hint = active
    ? t('Enter to keep · Shift+Enter for a new line · Esc to revert')
    : picking
      ? t('Click the element to comment on · Esc to cancel')
      : selected && target && !target.editable
        ? t('Esc to deselect')
        : selected
          ? t('Double-click or Enter to edit text · Esc to deselect')
          : t('Click to select · double-click to edit · Esc to leave');

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
            {twins.map((twin, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: twins share one loc; order is stable
              <Frame key={at} anchor={twin} container={container} variant="twin" />
            ))}
            <Frame anchor={selectedEl} container={container} variant="selected" />
          </div>
          {/* Only while there is something to act on: a row of disabled
              buttons over every caret covers the line above for nothing. */}
          {active && emphasis && (emphasis.actionable || linkDraft) && (
            <TextToolbar
              anchor={active.editor.clone}
              container={container}
              emphasis={emphasis}
              link={linkDraft}
              onFormat={format}
              onOpenLink={openLink}
              onClear={clear}
              onLinkChange={(value) => setLinkDraft((prev) => (prev ? { ...prev, value } : prev))}
              onLinkApply={applyLink}
              onLinkCancel={cancelLink}
              toolbarRef={toolbarRef}
            />
          )}
          {!quiet && (
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
        <PanelShell
          label={t('Element')}
          panelRef={panelRef}
          header={
            <>
              <KindIcon aria-hidden className="size-3.5 flex-none text-muted-foreground" />
              <span className="truncate font-medium text-xs">{t(kind.label, kind.vars)}</span>
              {twins.length > 0 && (
                <span
                  title={t('{count} elements print from this line of source', {
                    count: twins.length + 1,
                  })}
                  className="flex flex-none items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  <Copy aria-hidden className="size-3" />×{twins.length + 1}
                </span>
              )}
            </>
          }
          actions={
            <PanelIconButton label={t('Close')} onClick={() => setSelected(null)}>
              <X className="size-3.5" />
            </PanelIconButton>
          }
        >
          <FormatSection
            // A new element is a new set of fields: a half-typed number must
            // not commit onto whatever is selected next.
            key={`${selected.line}:${selected.column}`}
            anchor={selected.anchor}
            info={styleInfo?.anchor === selected.anchor ? styleInfo.value : null}
            pending={pendingFor(selected)}
            onChange={(prop, value, shown) => changeStyle(selected, prop, value, shown)}
          />
          <Section
            title={t('Text')}
            action={
              editingHere ? (
                <PanelIconButton label={t('Done')} onClick={() => active && finish(active, false)}>
                  <Check className="size-3.5" />
                </PanelIconButton>
              ) : null
            }
          >
            {target === null ? (
              <div className="h-0.5 overflow-hidden rounded bg-muted">
                <div className="h-full w-1/3 animate-pulse bg-foreground/20" />
              </div>
            ) : target.fields && !target.editable ? (
              // Data, not words in the source: the place to change it is the
              // cell, so that is what the panel shows.
              <FieldSource names={target.fields.names} file={target.fields.file} />
            ) : (
              // The words themselves, as the way in: clicking them opens them
              // on the page. Markup the editor leaves alone reads as a chip.
              <button
                type="button"
                disabled={!target.editable}
                aria-pressed={editingHere}
                aria-label={target.editable ? t('Edit on page') : undefined}
                title={
                  target.editable
                    ? `${t('Edit on page')} (Enter)`
                    : target.reason
                      ? t(target.reason)
                      : t('Not editable here.')
                }
                onClick={startEdit}
                className="group relative block max-h-28 w-full overflow-hidden rounded border border-border px-2 py-1.5 pr-7 text-left text-xs leading-relaxed transition-colors hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-foreground/60 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:border-border aria-pressed:border-foreground/60 aria-pressed:bg-accent/50"
              >
                {editingHere && active
                  ? shownText(active.editor.clone)
                  : target.parts.map((part, at) =>
                      part.kind === 'text' ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
                        <span key={at}>{part.value}</span>
                      ) : (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
                          key={at}
                          className="mx-0.5 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground"
                        >
                          {part.label}
                        </span>
                      ),
                    )}
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 flex text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-disabled:opacity-60"
                >
                  {target.editable ? <Pencil className="size-3" /> : <Lock className="size-3" />}
                </span>
              </button>
            )}
            {target?.fields && target.editable && (
              <FieldSource names={target.fields.names} file={target.fields.file} />
            )}
          </Section>
          <CollapsibleSection
            // Remounted per element while commenting, so each pick opens on
            // the note with the caret in it.
            key={commentFirst ? loc : 'comment'}
            title={t('Comment for the agent')}
            defaultOpen={commentFirst}
          >
            <textarea
              // biome-ignore lint/a11y/noAutofocus: the reader asked to comment and then picked this element
              autoFocus={commentFirst}
              aria-label={t('Comment for the agent')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveComment();
              }}
              rows={3}
              placeholder={t('make this bold, shorten to one line…')}
              className="w-full resize-y rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
            <button
              type="button"
              onClick={saveComment}
              disabled={busy || note.trim() === ''}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              <MessageSquarePlus className="size-3" />
              {t('Mark comment')}
            </button>
          </CollapsibleSection>
          <CollapsibleSection title={t('Source')} summary={loc}>
            <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1.5 text-[11px]">
              <dt className="text-muted-foreground">{t('Element')}</dt>
              <dd className="font-mono">&lt;{selected.tag}&gt;</dd>
              <dt className="text-muted-foreground">{t('Location')}</dt>
              <dd className="font-mono">{loc}</dd>
            </dl>
          </CollapsibleSection>
        </PanelShell>
      )}
    </>
  );
}

import {
  type Context,
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LABEL_ATTR, LABEL_ID_ATTR, useDocLabel, useLabelVocabulary } from '../lib/labels';

/** Stands in for a number the scan has not produced yet, or never will. */
const UNNUMBERED = '\u2022';

export type CollectedNote = { id: string; content: ReactNode };

type Collector = {
  /** Registration order, which is document order. */
  ids: string[];
  /**
   * Note bodies live outside React state on purpose. A `ReactNode` is a new
   * object on every render, so storing one in state would make every commit
   * look like a change — register, re-render, register — and never settle.
   * Ids are stable, so only they drive a re-render; the bodies are read fresh
   * from here in whatever render follows.
   */
  contents: Map<string, ReactNode>;
  register: (id: string, content: ReactNode) => void;
  unregister: (id: string) => void;
};

// Same globalThis treatment as the page context: a document imports the
// published bundle while the viewer runs the source copy, and a context created
// twice registers into one instance and reads from the other.
const GLOBAL_KEY = '__open_doc_footnote_context__';
type GlobalWithCtx = typeof globalThis & { [GLOBAL_KEY]?: Context<Collector | null> };
const g = globalThis as GlobalWithCtx;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = createContext<Collector | null>(null);
}
const FootnoteContext = g[GLOBAL_KEY];

/**
 * Collects the footnotes a fixed page renders, so `<Footnotes />` can print
 * them at its foot. Flow sections never use this: their notes are lifted out of
 * the blocks before measurement, because the space they take decides where the
 * page breaks land.
 */
export function FootnoteCollector({ children }: { children?: ReactNode }) {
  const contents = useRef<Map<string, ReactNode>>(new Map()).current;
  const [ids, setIds] = useState<string[]>([]);

  const value = useMemo<Collector>(
    () => ({
      ids,
      contents,
      register: (id, content) => {
        contents.set(id, content);
        setIds((current) => (current.includes(id) ? current : [...current, id]));
      },
      unregister: (id) => {
        contents.delete(id);
        setIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : current));
      },
    }),
    [ids, contents],
  );

  return <FootnoteContext.Provider value={value}>{children}</FootnoteContext.Provider>;
}

export const FOOTNOTE_MARKER_FLAG = '__odFootnote';

export type FootnoteProps = {
  /** Stable id, so `<Ref to>` can point at the note. Generated when omitted. */
  id?: string;
  children?: ReactNode;
};

export function markerStyle(): CSSProperties {
  return {
    fontSize: '0.7em',
    lineHeight: 0,
    verticalAlign: 'super',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--od-accent)',
    padding: '0 1px',
  };
}

/**
 * The superscript in the text. Its position in the document decides the number.
 *
 * The placeholder is the one the printed note uses, and deliberately not an
 * empty string: the two describe the same unresolved state, a note whose number
 * never arrives has to be visible in both places rather than silently blank,
 * and the packer measures this glyph — an empty marker is narrower than the
 * digit that replaces it.
 */
export function FootnoteMarker({ id }: { id: string }) {
  const entry = useDocLabel(id);
  return (
    <sup {...{ [LABEL_ATTR]: 'footnote', [LABEL_ID_ATTR]: id }} style={markerStyle()}>
      {entry?.number ?? UNNUMBERED}
    </sup>
  );
}

/**
 * A note anchored to this point in the text. Inside a `flow()` section the
 * framework lifts it to the foot of whatever page the marker lands on; on a
 * fixed page, put a `<Footnotes />` where you want them printed.
 */
export function Footnote({ id, children }: FootnoteProps) {
  const generated = useId();
  const noteId = id ?? generated;
  const collector = useContext(FootnoteContext);
  const latest = useRef<Collector | null>(null);

  // Runs after every commit so the body stays current; only a new id changes
  // state, so this settles instead of looping.
  useEffect(() => {
    latest.current = collector;
    collector?.register(noteId, children);
  });

  useEffect(() => () => latest.current?.unregister(noteId), [noteId]);

  return <FootnoteMarker id={noteId} />;
}

(Footnote as unknown as Record<string, boolean>)[FOOTNOTE_MARKER_FLAG] = true;

export type FootnotesProps = {
  /** Notes to print. Omitted on a fixed page, where they are collected from it. */
  notes?: CollectedNote[];
  style?: CSSProperties;
  className?: string;
};

/** Outside the area's box, so measurement has to add it back by hand. */
export const FOOTNOTE_AREA_MARGIN_TOP = 12;

export const FOOTNOTE_ROW_ATTR = 'data-od-footnote-row';

export function footnoteAreaStyle(): CSSProperties {
  return {
    borderTop: '1px solid var(--od-rule)',
    paddingTop: 6,
    marginTop: FOOTNOTE_AREA_MARGIN_TOP,
    fontSize: 'var(--od-size-caption)',
    lineHeight: 1.45,
    color: 'var(--od-muted)',
  };
}

/** One note's row. Shared with the measurement pass so the reserved space is real. */
export function FootnoteRow({ id, content }: CollectedNote) {
  const entry = useDocLabel(id);
  return (
    <div {...{ [FOOTNOTE_ROW_ATTR]: '' }} style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
      <span
        style={{
          flex: 'none',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--od-accent)',
        }}
      >
        {entry?.number ?? UNNUMBERED}
      </span>
      <span style={{ minWidth: 0 }}>{content}</span>
    </div>
  );
}

export function Footnotes({ notes, style, className }: FootnotesProps) {
  const collector = useContext(FootnoteContext);
  const vocabulary = useLabelVocabulary();
  const list =
    notes ?? collector?.ids.map((id) => ({ id, content: collector.contents.get(id) })) ?? [];
  if (list.length === 0) return null;

  return (
    <div data-od-footnotes="" className={className} style={{ ...footnoteAreaStyle(), ...style }}>
      {vocabulary.footnotes ? (
        <div style={{ fontWeight: 600, marginBottom: 3 }}>{vocabulary.footnotes}</div>
      ) : null}
      {list.map((note) => (
        <FootnoteRow key={note.id} id={note.id} content={note.content} />
      ))}
    </div>
  );
}

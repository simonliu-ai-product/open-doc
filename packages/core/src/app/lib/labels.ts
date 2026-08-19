import { useSyncExternalStore } from 'react';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';

export type LabelKind = 'figure' | 'table' | 'footnote';

export type LabelEntry = {
  /** Author-supplied id for `<Ref to>`, or a generated one. */
  id: string;
  kind: LabelKind;
  /** 1-based, counted per kind across the whole document. */
  number: number;
  /** Caption text, for a list of figures. */
  text: string;
  /** 1-based page the item sits on. */
  page: number;
};

export const LABEL_ATTR = 'data-od-label';
export const LABEL_ID_ATTR = 'data-od-label-id';
export const LABEL_TEXT_ATTR = 'data-od-label-text';

/**
 * The words wrapped around a number. Numbering is structural; what it is
 * *called* is a document's own business — `圖 3` and `Figure 3` are the same
 * entry. Set it once in `meta.labels`.
 */
export type LabelVocabulary = {
  figure: string;
  table: string;
  /** Heading above a page's footnotes. Empty string renders no heading. */
  footnotes: string;
  /** Page suffix for a cross-reference. `{page}` is replaced. */
  onPage: string;
};

export const defaultVocabulary: LabelVocabulary = {
  figure: 'Figure',
  table: 'Table',
  footnotes: '',
  onPage: ' (p. {page})',
};

export type LabelSnapshot = {
  entries: LabelEntry[];
  vocabulary: LabelVocabulary;
};

const EMPTY: LabelSnapshot = { entries: [], vocabulary: defaultVocabulary };

const KINDS: LabelKind[] = ['figure', 'table', 'footnote'];

function isKind(value: string | null): value is LabelKind {
  return value !== null && (KINDS as string[]).includes(value);
}

/**
 * Walks rendered page frames and numbers everything labelled, in document
 * order. Numbering is a scan for the same reason the outline is: only the
 * rendered pages know what ended up where, and a flow section's page breaks are
 * decided by measurement, not by the author.
 */
export function collectLabels(root: ParentNode): LabelEntry[] {
  const entries: LabelEntry[] = [];
  const counters: Record<LabelKind, number> = { figure: 0, table: 0, footnote: 0 };
  const frames = Array.from(root.querySelectorAll<HTMLElement>(`[${PAGE_ATTR}]`));

  frames.forEach((frame, fallbackIndex) => {
    const declared = Number(frame.getAttribute(PAGE_INDEX_ATTR));
    const page = (Number.isFinite(declared) ? declared : fallbackIndex) + 1;

    for (const el of Array.from(frame.querySelectorAll<HTMLElement>(`[${LABEL_ATTR}]`))) {
      const kind = el.getAttribute(LABEL_ATTR);
      if (!isKind(kind)) continue;
      const id = el.getAttribute(LABEL_ID_ATTR);
      if (!id) continue;
      // A footnote's marker and the note at the foot of the page carry the same
      // id; the marker is what fixes its position in the sequence.
      if (entries.some((entry) => entry.id === id)) continue;
      counters[kind] += 1;
      entries.push({
        id,
        kind,
        number: counters[kind],
        text: (el.getAttribute(LABEL_TEXT_ATTR) ?? el.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        page,
      });
    }
  });

  return entries;
}

// Shared through globalThis for the same reason as the outline store: the
// viewer writes from the source copy of this module while a document's
// `<Figure>` reads from the published bundle.
const GLOBAL_KEY = '__open_doc_labels_store__';
type LabelStore = { snapshot: LabelSnapshot; listeners: Set<() => void> };
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: LabelStore };
const g = globalThis as GlobalWithStore;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = { snapshot: EMPTY, listeners: new Set() };
}
const store = g[GLOBAL_KEY];

function sameEntries(a: LabelEntry[], b: LabelEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.kind === other.kind &&
      entry.number === other.number &&
      entry.text === other.text &&
      entry.page === other.page
    );
  });
}

function sameVocabulary(a: LabelVocabulary, b: LabelVocabulary): boolean {
  return (
    a.figure === b.figure &&
    a.table === b.table &&
    a.footnotes === b.footnotes &&
    a.onPage === b.onPage
  );
}

export function setLabels(entries: LabelEntry[], vocabulary?: Partial<LabelVocabulary>): void {
  const next: LabelSnapshot = {
    entries,
    vocabulary: { ...defaultVocabulary, ...vocabulary },
  };
  if (
    sameEntries(store.snapshot.entries, next.entries) &&
    sameVocabulary(store.snapshot.vocabulary, next.vocabulary)
  ) {
    return;
  }
  store.snapshot = next;
  for (const listener of store.listeners) listener();
}

export function getLabels(): LabelSnapshot {
  return store.snapshot;
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function useLabelSnapshot(): LabelSnapshot {
  return useSyncExternalStore(subscribe, getLabels, getLabels);
}

/** The document's numbered items of one kind, in order. Empty on the first render pass. */
export function useDocLabels(kind: LabelKind): LabelEntry[] {
  return useLabelSnapshot().entries.filter((entry) => entry.kind === kind);
}

/** One numbered item by id, once the scan has run. */
export function useDocLabel(id: string): LabelEntry | null {
  return useLabelSnapshot().entries.find((entry) => entry.id === id) ?? null;
}

export function useLabelVocabulary(): LabelVocabulary {
  return useLabelSnapshot().vocabulary;
}

export function formatOnPage(vocabulary: LabelVocabulary, page: number): string {
  return vocabulary.onPage.replace('{page}', String(page));
}

import { useSyncExternalStore } from 'react';

export type OutlineEntry = {
  id: string;
  text: string;
  level: number;
  /** 1-based page the heading sits on. */
  page: number;
};

const HEADING_SELECTOR = 'h1, h2, h3, [data-od-heading]';

export const PAGE_ATTR = 'data-od-page';
export const PAGE_INDEX_ATTR = 'data-od-page-index';

function levelOf(el: Element): number {
  const declared = el.getAttribute('data-od-level');
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n)) return Math.min(3, Math.max(1, Math.round(n)));
  }
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1') return 1;
  if (tag === 'h2') return 2;
  if (tag === 'h3') return 3;
  return 2;
}

function textOf(el: Element): string {
  const labelled = el.getAttribute('data-od-heading');
  if (labelled && labelled !== 'true' && labelled.trim() !== '') return labelled.trim();
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Walks rendered page frames and returns their headings in document order.
 * Headings inside a rendered table of contents are skipped so a TOC never
 * lists itself, and every collected heading gets a stable `id` so the sidebar
 * and in-document TOC can anchor to it.
 */
export function collectOutline(root: ParentNode): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const frames = Array.from(root.querySelectorAll<HTMLElement>(`[${PAGE_ATTR}]`));
  frames.forEach((frame, fallbackIndex) => {
    const declared = Number(frame.getAttribute(PAGE_INDEX_ATTR));
    const page = (Number.isFinite(declared) ? declared : fallbackIndex) + 1;
    const headings = Array.from(frame.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
    for (const el of headings) {
      if (el.closest('[data-od-toc]')) continue;
      if (el.getAttribute('data-od-outline') === 'skip') continue;
      const text = textOf(el);
      if (!text) continue;
      const id = el.id || `od-h-${entries.length + 1}`;
      if (!el.id) el.id = id;
      entries.push({ id, text, level: levelOf(el), page });
    }
  });
  return entries;
}

/**
 * A PDF's bookmarks and heading tags are built from the accessibility tree,
 * which knows nothing of the outline's rules: it would list the cover title,
 * "Contents", every h4, and the long text of a heading the author shortened.
 * This marks the copy so the tree says what the outline says — every listed
 * heading as a heading at its outline level and with its outline text, every
 * other heading as plain text.
 */
export function exposeOutline(root: ParentNode): void {
  const listed = new Set(collectOutline(root).map((entry) => entry.id));
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [data-od-heading]'),
  )) {
    if (el.id && listed.has(el.id)) {
      el.setAttribute('role', 'heading');
      el.setAttribute('aria-level', String(levelOf(el)));
      el.setAttribute('aria-label', textOf(el));
    } else {
      el.setAttribute('role', 'none');
    }
  }
}

// Shared through globalThis for the same reason as the page context: the
// viewer writes the outline from the source copy of this module, while a
// document's `<TableOfContents>` reads it from the published bundle.
const GLOBAL_KEY = '__open_doc_outline_store__';
type OutlineStore = { snapshot: OutlineEntry[]; listeners: Set<() => void> };
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: OutlineStore };
const g = globalThis as GlobalWithStore;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = { snapshot: [], listeners: new Set() };
}
const store = g[GLOBAL_KEY];

function sameOutline(a: OutlineEntry[], b: OutlineEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.text === other.text &&
      entry.level === other.level &&
      entry.page === other.page
    );
  });
}

export function setOutline(entries: OutlineEntry[]): void {
  if (sameOutline(store.snapshot, entries)) return;
  store.snapshot = entries;
  for (const listener of store.listeners) listener();
}

export function getOutline(): OutlineEntry[] {
  return store.snapshot;
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

/**
 * The document's headings, filled in after the pages render. Empty on the first
 * pass — a `<TableOfContents>` renders its rows on the second, once the scan
 * has run.
 */
export function useDocOutline(): OutlineEntry[] {
  return useSyncExternalStore(subscribe, getOutline, getOutline);
}

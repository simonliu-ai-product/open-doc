import { createElement, type ReactNode, useSyncExternalStore } from 'react';

/** One row of a document's `records` — usually a line of an imported `.csv`. */
export type DataRecord = Record<string, unknown>;

// Shared through globalThis for the same reason as the outline store: the
// viewer and the exporters set the record from the source copy of this module,
// while a document's `useRecord()` and `<Field>` read it from the published
// bundle. Two stores would mean pages that never change record.
const GLOBAL_KEY = '__open_doc_record_store__';
type RecordStore = {
  records: DataRecord[];
  index: number;
  listeners: Set<() => void>;
};
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: RecordStore };
const g = globalThis as GlobalWithStore;
if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { records: [], index: 0, listeners: new Set() };
const store = g[GLOBAL_KEY];

const notify = () => {
  for (const listener of store.listeners) listener();
};

/** The rows the open document prints from, or none — the viewer sets this as a document loads. */
export function setRecords(records: DataRecord[] | undefined, index = 0): void {
  const next = Array.isArray(records) ? records : [];
  const at = Math.min(Math.max(0, index), Math.max(0, next.length - 1));
  if (store.records === next && store.index === at) return;
  store.records = next;
  store.index = at;
  notify();
}

export function setRecordIndex(index: number): void {
  const at = Math.min(Math.max(0, index), Math.max(0, store.records.length - 1));
  if (store.index === at) return;
  store.index = at;
  notify();
}

export function getRecordState(): { records: DataRecord[]; index: number } {
  return { records: store.records, index: store.index };
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

const getIndex = () => store.index;
const getCount = () => store.records.length;
const getCurrent = (): DataRecord | undefined => store.records[store.index];

export function useRecordIndex(): number {
  return useSyncExternalStore(subscribe, getIndex, getIndex);
}

export function useRecordCount(): number {
  return useSyncExternalStore(subscribe, getCount, getCount);
}

/**
 * The row this copy of the document is printed for. A document that exports
 * `records` is laid out once per row; every page reads the same one. Outside a
 * document with records — a card in the document list — it is `undefined`.
 */
export function useRecord<T extends DataRecord = DataRecord>(): T | undefined {
  return useSyncExternalStore(subscribe, getCurrent, getCurrent) as T | undefined;
}

export type FieldProps = {
  /** The column to print. */
  name: string;
  /** Printed when the row has no value for it. */
  fallback?: ReactNode;
};

/**
 * One value of the current row, as text. Where no row is set — a document
 * card, a theme preview — it prints the column's name in guillemets, so the
 * layout still shows what goes where.
 */
export function Field({ name, fallback }: FieldProps) {
  const record = useRecord();
  if (!record) return createElement('span', { style: { opacity: 0.55 } }, `‹${name}›`);
  const value = record[name];
  if (value === null || value === undefined || value === '') {
    return fallback === undefined ? null : createElement('span', null, fallback);
  }
  return createElement('span', null, String(value));
}

/** How a row is named in the viewer's picker: the chosen column, else the first non-empty one. */
export function recordLabel(record: DataRecord | undefined, index: number, key?: string): string {
  if (!record) return String(index + 1);
  const value = key ? record[key] : Object.values(record).find((v) => v !== '' && v != null);
  return value === undefined || value === null || value === '' ? String(index + 1) : String(value);
}

// Characters no file system takes in a name, and the separators.
const UNSAFE = /[\\/:*?"<>|\p{Cc}]+/gu;

/**
 * A file name for one row: `{column}` takes the row's value and `{#}` its
 * 1-based number, padded to the width of the count. A pattern-free name gets
 * the number appended, so every row still lands in its own file.
 */
export function recordFileName(
  pattern: string,
  record: DataRecord | undefined,
  index: number,
  count: number,
): string {
  const number = String(index + 1).padStart(String(count).length, '0');
  const filled = pattern.replace(/\{([^{}]+)\}/g, (_, key: string) =>
    key === '#' ? number : String(record?.[key.trim()] ?? ''),
  );
  const named = /\{[^{}]+\}/.test(pattern) ? filled : `${filled}-${number}`;
  return (
    named
      .replace(UNSAFE, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.-]+|[\s.-]+$/g, '')
      .slice(0, 120) || number
  );
}

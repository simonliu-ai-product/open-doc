import { collectLabels, getLabels, type LabelSnapshot, setLabels } from './labels';
import { collectOutline, getOutline, type OutlineEntry, setOutline } from './outline';
import type { DocMeta } from './sdk';

export type ScanSnapshot = { outline: OutlineEntry[]; labels: LabelSnapshot };

/**
 * Reads everything the rendered pages know that the source does not: which
 * headings exist and where they landed, and what number each figure, table, and
 * footnote ended up with. One call, because the two scans must always describe
 * the same copy of the document — the viewer's pages, or an exporter's private
 * one.
 */
export function scanDocument(root: ParentNode, meta?: DocMeta): void {
  setOutline(collectOutline(root));
  setLabels(collectLabels(root), meta?.labels);
}

export function captureScan(): ScanSnapshot {
  return { outline: getOutline(), labels: getLabels() };
}

export function restoreScan(snapshot: ScanSnapshot): void {
  setOutline(snapshot.outline);
  setLabels(snapshot.labels.entries, snapshot.labels.vocabulary);
}

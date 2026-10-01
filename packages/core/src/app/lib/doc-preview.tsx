import { createElement, type ReactNode } from 'react';
import { FlowPage } from '../components/flow-page';
import { type DocEntry, isFlowSection } from './flow';
import type { DocModule } from './sdk';

/**
 * Page 1 of a document without running the flow measurement — a thumbnail only
 * needs what fits above the fold, and the page shell clips the rest.
 */
export function coverContent(doc: DocModule | null | undefined): ReactNode {
  const entry = (doc?.default as DocEntry[] | undefined)?.[0];
  if (!entry) return null;
  if (!isFlowSection(entry)) return createElement(entry);
  return createElement(FlowPage, {
    section: entry,
    design: doc?.design,
    blockIndices: entry.blocks.map((_, index) => index),
  });
}

import { createElement, type ReactNode, useEffect, useMemo, useState } from 'react';
import { FlowPage } from '../components/flow-page';
import type { DesignSystem } from './design';
import { type DocEntry, type FlowSection, isFlowSection, paginateBlocks } from './flow';
import { type MeasurableSection, measureFlowSections } from './flow-measure';
import { extractSectionFootnotes, notesForPage, type PreparedSection } from './footnotes';
import type { DocModule, PageGeometry } from './sdk';

export type ExpandedPage = {
  key: string;
  content: ReactNode;
};

type Plan = {
  /** Section index → block indices per page. */
  bySection: number[][][];
  overflowing: Array<{ section: number; block: number }>;
};

const EMPTY_PLAN: Plan = { bySection: [], overflowing: [] };

/** A plan is only current for the sections it was measured from. */
type Measured = { plan: Plan; sections: FlowSection[] | null };

const NOT_MEASURED: Measured = { plan: EMPTY_PLAN, sections: null };

function entriesOf(doc: DocModule | null): DocEntry[] {
  return (doc?.default ?? []) as DocEntry[];
}

/**
 * Turns the authored entry list into the pages actually rendered: fixed page
 * components pass through, flow sections expand into as many pages as their
 * measured content needs.
 */
export function useDocPages(
  doc: DocModule | null,
  geometry: PageGeometry,
): { pages: ExpandedPage[]; measuring: boolean; overflowing: Plan['overflowing'] } {
  const entries = useMemo(() => entriesOf(doc), [doc]);
  const sections = useMemo(() => entries.filter(isFlowSection), [entries]);
  const design = doc?.design as DesignSystem | undefined;

  // Footnotes come out of the blocks before anything is measured: what they
  // cost at the foot of a page is part of that page's budget.
  const prepared = useMemo<PreparedSection[]>(
    () => sections.map((section, index) => extractSectionFootnotes(section.blocks, index)),
    [sections],
  );
  const measurable = useMemo<MeasurableSection[]>(
    () =>
      sections.map((section, index) => ({
        blocks: prepared[index].blocks,
        notesByBlock: prepared[index].notesByBlock,
        ...(section.padding !== undefined ? { padding: section.padding } : {}),
      })),
    [sections, prepared],
  );

  const [state, setState] = useState<Measured>(NOT_MEASURED);
  // Derived, not stored: a `measuring` flag set from an effect stays false for
  // one commit after the document loads, and anything reading the page list in
  // that window — the outline scan, the headless bridge — sees a whole flow
  // section as one unpaginated page.
  const measuring = sections.length > 0 && state.sections !== sections;

  useEffect(() => {
    if (sections.length === 0) {
      setState({ plan: EMPTY_PLAN, sections });
      return;
    }
    let cancelled = false;
    measureFlowSections(measurable, { geometry, design })
      .then((measurements) => {
        if (cancelled) return;
        const bySection: number[][][] = [];
        const overflowing: Plan['overflowing'] = [];
        measurements.forEach((measurement, sectionIndex) => {
          const result = paginateBlocks(measurement.metrics, measurement.available, {
            footnoteOverhead: measurement.footnoteOverhead,
          });
          bySection.push(result.pages);
          for (const block of result.overflowing) {
            overflowing.push({ section: sectionIndex, block });
          }
        });
        setState({ plan: { bySection, overflowing }, sections });
      })
      .catch(() => {
        if (!cancelled) setState({ plan: EMPTY_PLAN, sections });
      });
    return () => {
      cancelled = true;
    };
  }, [sections, measurable, geometry, design]);

  const plan = state.plan;

  const pages = useMemo(() => {
    const out: ExpandedPage[] = [];
    let sectionIndex = -1;

    entries.forEach((entry, entryIndex) => {
      if (!isFlowSection(entry)) {
        const Page = entry;
        out.push({ key: `p${entryIndex}`, content: createElement(Page) });
        return;
      }
      sectionIndex++;
      const section = entry as FlowSection;
      const ready = prepared[sectionIndex];
      const blocks = ready?.blocks ?? section.blocks;
      // Before measurement lands, render the section as a single page so the
      // viewer shows something rather than flashing empty.
      const chunks = plan.bySection[sectionIndex] ?? [blocks.map((_, i) => i)];
      chunks.forEach((blockIndices, pageIndex) => {
        out.push({
          key: `f${entryIndex}-${pageIndex}`,
          content: createElement(FlowPage, {
            section,
            design,
            blockIndices,
            blocks,
            notes: ready ? notesForPage(ready.notesByBlock, blockIndices) : [],
          }),
        });
      });
    });

    return out;
  }, [entries, plan, prepared, design]);

  return { pages, measuring, overflowing: plan.overflowing };
}

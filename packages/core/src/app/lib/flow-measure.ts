import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FLOW_BLOCK_ATTR, FlowBlock } from '../components/flow-page';
import { FOOTNOTE_AREA_MARGIN_TOP, FOOTNOTE_ROW_ATTR, Footnotes } from '../components/footnote';
import { type DesignSystem, designToCssVars } from './design';
import type { BlockMetrics } from './flow';
import type { ExtractedNote } from './footnotes';
import { nextFrame, waitForFonts } from './print-ready';
import type { PageGeometry } from './sdk';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4']);

/** A flow section reduced to what measurement needs: blocks, and their notes. */
export type MeasurableSection = {
  blocks: ReactNode[];
  /** Index-aligned with `blocks`. */
  notesByBlock: ExtractedNote[][];
  padding?: number;
};

function metricsFor(el: HTMLElement, height: number, footnoteHeight: number): BlockMetrics {
  const inner = el.firstElementChild;
  const tag = inner?.tagName ?? '';
  const declaredKeepNext = inner?.getAttribute('data-od-keep-with-next');
  const declaredKeepPrev = inner?.getAttribute('data-od-keep-with-previous');
  const declaredBreak = inner?.getAttribute('data-od-break-before');

  return {
    height,
    footnoteHeight,
    // A heading alone at the bottom of a page is the most visible layout error
    // in a report, so headings glue to whatever follows them by default.
    keepWithNext: declaredKeepNext !== null ? declaredKeepNext !== 'false' : HEADING_TAGS.has(tag),
    keepWithPrevious: declaredKeepPrev !== null && declaredKeepPrev !== 'false',
    breakBefore: declaredBreak !== null && declaredBreak !== 'false',
  };
}

export type FlowMeasurement = {
  metrics: BlockMetrics[];
  /** Usable height of one page for this section. */
  available: number;
  /** What a page's footnote area costs before its first note. */
  footnoteOverhead: number;
};

/**
 * How much vertical space each node claims, measured from where the next one
 * starts — which is what already accounts for collapsed margins.
 *
 * Offsets are taken relative to the container's own box, not `offsetTop`: every
 * container shares one positioned host, so `offsetTop` is host-relative while
 * the container's height is not, and mixing the two silently measures the last
 * node of every container after the first as zero.
 */
function stackedHeights(container: HTMLElement, selector: string): number[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
  const origin = container.getBoundingClientRect();
  const tops = nodes.map((node) => node.getBoundingClientRect().top - origin.top);
  return nodes.map((_, index) =>
    Math.max(0, (index + 1 < tops.length ? tops[index + 1] : origin.height) - tops[index]),
  );
}

/**
 * Renders each section's blocks offscreen at the real page width and reads back
 * their stacked heights. Measuring the live DOM is the only way to know how a
 * paragraph wraps or how tall a table grew.
 *
 * Footnotes are measured in the same pass, in the component that prints them,
 * because the space they claim at the foot of a page is space the packer must
 * not hand to body content.
 */
export async function measureFlowSections(
  sections: MeasurableSection[],
  opts: { geometry: PageGeometry; design?: DesignSystem },
): Promise<FlowMeasurement[]> {
  if (sections.length === 0) return [];

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    pointerEvents: 'none',
    visibility: 'hidden',
  });
  document.body.appendChild(host);

  const designVars = opts.design ? designToCssVars(opts.design) : null;
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const blockContainers: HTMLElement[] = [];
  const noteContainers: Array<HTMLElement | null> = [];

  const paddingOf = (section: MeasurableSection) => section.padding ?? opts.design?.margin ?? 76;

  const makeContainer = (width: number): HTMLElement => {
    const container = document.createElement('div');
    container.style.width = `${width}px`;
    container.style.fontFamily = 'var(--od-font-body)';
    container.style.fontSize = 'var(--od-size-body)';
    container.style.lineHeight = 'var(--od-leading)';
    if (designVars) {
      for (const [k, v] of Object.entries(designVars)) container.style.setProperty(k, v);
    }
    host.appendChild(container);
    return container;
  };

  try {
    for (const section of sections) {
      const width = opts.geometry.width - paddingOf(section) * 2;

      const blocks = makeContainer(width);
      blockContainers.push(blocks);
      const blockRoot = createRoot(blocks);
      blockRoot.render(
        section.blocks.map((block, index) =>
          createElement(FlowBlock, { key: index }, block),
        ) as unknown as Parameters<typeof blockRoot.render>[0],
      );
      roots.push(blockRoot);

      const allNotes = section.notesByBlock.flat();
      if (allNotes.length === 0) {
        noteContainers.push(null);
        continue;
      }
      const notes = makeContainer(width);
      noteContainers.push(notes);
      const noteRoot = createRoot(notes);
      noteRoot.render(createElement(Footnotes, { notes: allNotes }));
      roots.push(noteRoot);
    }

    await nextFrame();
    await waitForFonts();
    await nextFrame();

    return sections.map((section, sectionIndex) => {
      const padding = paddingOf(section);
      const blocks = blockContainers[sectionIndex];
      const blockHeights = stackedHeights(blocks, `:scope > [${FLOW_BLOCK_ATTR}]`);

      const noteContainer = noteContainers[sectionIndex];
      let rowHeights: number[] = [];
      let footnoteOverhead = 0;
      if (noteContainer) {
        rowHeights = stackedHeights(noteContainer, `[${FOOTNOTE_ROW_ATTR}]`);
        const area = noteContainer.getBoundingClientRect().height;
        const rows = rowHeights.reduce((sum, height) => sum + height, 0);
        footnoteOverhead = Math.max(0, area - rows) + FOOTNOTE_AREA_MARGIN_TOP;
      }

      let noteCursor = 0;
      const nodes = Array.from(
        blocks.querySelectorAll<HTMLElement>(`:scope > [${FLOW_BLOCK_ATTR}]`),
      );
      const metrics = nodes.map((node, index) => {
        const count = section.notesByBlock[index]?.length ?? 0;
        let notesHeight = 0;
        for (let i = 0; i < count; i++) notesHeight += rowHeights[noteCursor + i] ?? 0;
        noteCursor += count;
        return metricsFor(node, blockHeights[index] ?? 0, notesHeight);
      });

      return {
        metrics,
        available: opts.geometry.height - padding * 2,
        footnoteOverhead,
      };
    });
  } finally {
    for (const root of roots) root.unmount();
    host.remove();
  }
}

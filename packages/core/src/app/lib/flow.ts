import { Children, type ComponentType, Fragment, isValidElement, type ReactNode } from 'react';
import type { DocEntry, FlowSection } from './sdk';

export type { DocEntry, FlowSection };

/**
 * Flattens fragments so `flow(<>…</>)` yields one block per element the author
 * wrote, not a single block containing the whole fragment.
 */
function toBlocks(node: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    if (child.type === Fragment) {
      out.push(...toBlocks((child.props as { children?: ReactNode }).children));
      continue;
    }
    out.push(child);
  }
  return out;
}

/**
 * Wraps continuous content so the framework paginates it, instead of the author
 * hand-splitting sections into fixed pages. Each direct child is one atomic
 * block — a heading, a paragraph, a table — that never straddles a page break.
 */
export function flow(
  children: ReactNode,
  opts: {
    header?: ComponentType;
    footer?: ComponentType;
    padding?: number;
    columns?: 1 | 2 | 3;
    columnGap?: number;
  } = {},
): FlowSection {
  return { __odFlow: true, blocks: toBlocks(children), ...opts };
}

export function isFlowSection(entry: DocEntry): entry is FlowSection {
  return typeof entry === 'object' && entry !== null && (entry as FlowSection).__odFlow === true;
}

export type BlockSlice = {
  index: number;
  rowStart?: number;
  rowEnd?: number;
};

export type BlockMetrics = {
  height: number;
  /** Height this block's footnotes add to the foot of whatever page it lands on. */
  footnoteHeight?: number;
  /** A heading must not be the last block on a page. */
  keepWithNext?: boolean;
  /** A caption must not open a page without the figure it belongs to. */
  keepWithPrevious?: boolean;
  /** Always start a new page before this block. */
  breakBefore?: boolean;
  /** When present, this block is a table that can split between rows across page breaks. */
  splittable?: {
    headerHeight: number;
    footerHeight: number;
    rowHeights: number[];
  };
};

export type PaginationResult = {
  /** Block indices per page, in order. */
  pages: number[][];
  /** Detailed block slices per page, carrying row ranges when a table splits across pages. */
  slices: BlockSlice[][];
  /** Blocks taller than one page — they stay whole and overflow. */
  overflowing: number[];
};

export type PaginateOptions = {
  /** Rule and padding a page's footnote area costs before its first note. */
  footnoteOverhead?: number;
};

/**
 * Greedy top-to-bottom packing: fill a page until the next block would cross
 * the bottom edge, then push that block — plus anything glued to it — onto the
 * next page. Blocks are atomic unless marked `splittable`, in which case rows
 * pack into the remaining space and continue on the next sheet with the header
 * repeated.
 *
 * Footnotes are packed from the same budget: a block that carries notes brings
 * their height with it, because those notes print at the foot of whichever page
 * the block lands on.
 */
export function paginateBlocks(
  blocks: BlockMetrics[],
  available: number,
  opts: PaginateOptions = {},
): PaginationResult {
  const overhead = opts.footnoteOverhead ?? 0;
  const slices: BlockSlice[][] = [];
  const overflowing: number[] = [];
  let current: BlockSlice[] = [];
  let used = 0;
  let notes = 0;

  const sliceHeight = (slice: BlockSlice): number => {
    const block = blocks[slice.index];
    if (!block) return 0;
    if (slice.rowStart !== undefined && slice.rowEnd !== undefined && block.splittable) {
      let rows = 0;
      for (let r = slice.rowStart; r < slice.rowEnd; r++) {
        rows += block.splittable.rowHeights[r] ?? 0;
      }
      const isLast = slice.rowEnd >= block.splittable.rowHeights.length;
      return block.splittable.headerHeight + rows + (isLast ? block.splittable.footerHeight : 0);
    }
    return block.height;
  };

  const heightOf = (items: BlockSlice[]) => items.reduce((sum, item) => sum + sliceHeight(item), 0);
  const notesOf = (items: BlockSlice[]) =>
    items.reduce(
      (sum, item) =>
        sum +
        (item.rowStart === undefined || item.rowStart === 0
          ? (blocks[item.index]?.footnoteHeight ?? 0)
          : 0),
      0,
    );
  /** A page with no notes pays nothing; the first note also pays for the rule. */
  const reserve = (total: number) => (total > 0 ? total + overhead : 0);

  const closePage = () => {
    if (current.length === 0) return;
    slices.push(current);
    current = [];
    used = 0;
    notes = 0;
  };

  blocks.forEach((block, index) => {
    const own = block.footnoteHeight ?? 0;

    if (block.breakBefore) closePage();

    const split = block.splittable;
    const canSplit = split && split.rowHeights.length > 1;

    if (!canSplit && block.height + reserve(own) > available) {
      overflowing.push(index);
    }

    if (current.length > 0 && used + block.height + reserve(notes + own) > available) {
      // Everything glued to this block travels with it: trailing headings
      // (keep-with-next) and, when this block is a caption, its figure.
      let splitAt = current.length;
      while (splitAt > 0 && blocks[current[splitAt - 1].index]?.keepWithNext) splitAt--;
      if (block.keepWithPrevious && splitAt === current.length) splitAt--;

      if (canSplit) {
        const firstRowCost = split.headerHeight + (split.rowHeights[0] ?? 0);
        if (used + firstRowCost + reserve(notes + own) > available) {
          if (splitAt > 0 && splitAt < current.length) {
            const moved = current.slice(splitAt);
            slices.push(current.slice(0, splitAt));
            current = moved;
            used = heightOf(moved);
            notes = notesOf(moved);
          } else {
            closePage();
          }
        }
      } else {
        if (splitAt > 0 && splitAt < current.length) {
          const moved = current.slice(splitAt);
          slices.push(current.slice(0, splitAt));
          current = moved;
          used = heightOf(moved);
          notes = notesOf(moved);
        } else {
          closePage();
        }
      }
    }

    if (canSplit && used + block.height + reserve(notes + own) > available) {
      let rowCursor = 0;
      const totalRows = split.rowHeights.length;
      let firstSlice = true;
      while (rowCursor < totalRows) {
        const sliceNotes = firstSlice ? own : 0;
        const budget = available - used - reserve(notes + sliceNotes) - split.headerHeight;
        let rowEnd = rowCursor;
        let rowSum = 0;
        while (rowEnd < totalRows) {
          const rHeight = split.rowHeights[rowEnd] ?? 0;
          const tail = rowEnd + 1 === totalRows ? split.footerHeight : 0;
          if (rowSum + rHeight + tail <= budget || (rowEnd === rowCursor && current.length === 0)) {
            rowSum += rHeight;
            rowEnd++;
          } else {
            break;
          }
        }
        if (rowEnd === rowCursor) {
          closePage();
          continue;
        }
        const slice: BlockSlice = { index, rowStart: rowCursor, rowEnd };
        current.push(slice);
        used += sliceHeight(slice);
        notes += sliceNotes;
        firstSlice = false;
        rowCursor = rowEnd;
        if (rowCursor < totalRows) {
          closePage();
        }
      }
      return;
    }

    current.push({ index });
    used += block.height;
    notes += own;
  });

  closePage();
  const pages = slices.map((page) => page.map((s) => s.index));
  return { pages, slices, overflowing };
}

/** Blocks of the first flow section, for thumbnails that skip measurement. */
export function firstFlowBlocks(entries: DocEntry[], limit = 12): ReactNode[] {
  const first = entries.find(isFlowSection);
  return first ? first.blocks.slice(0, limit) : [];
}

import type { OutlineEntry } from './outline';

export type BudgetSection = {
  title: string;
  level: number;
  /** 1-based sheet the section's heading is on. */
  startPage: number;
  /** Last sheet it reaches. */
  endPage: number;
  /** Sheets it fills, from its heading to the next section's (or to the end of the last sheet's content). */
  pages: number;
};

export type PageBudget = {
  maxPages: number;
  pageCount: number;
  /** Sheets past the budget; 0 when it fits. */
  over: number;
  /** How full the last sheet is, 0–1. A nearly empty last sheet is the cheapest one to lose. */
  lastPageFill: number;
  /** Roughly how many sheets of body must go: `over`, less the last sheet's slack. */
  toCut: number;
  /** Top-rank sections in document order. */
  sections: BudgetSection[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * What it takes to bring a document down to `maxPages` sheets, and where its
 * length is. Sections are the outline's top rank; content before the first
 * heading (a cover, a contents page) is its own `(front matter)` entry.
 */
export function pageBudget(
  maxPages: number,
  pageCount: number,
  fills: number[],
  outline: OutlineEntry[],
  offsets: Record<string, number> = {},
): PageBudget {
  const fillOf = (page: number) => fills[page - 1] ?? 1;
  const lastPageFill = pageCount > 0 ? fillOf(pageCount) : 0;
  const over = Math.max(0, pageCount - maxPages);

  const top = outline.length > 0 ? Math.min(...outline.map((entry) => entry.level)) : 0;
  const heads = outline.filter((entry) => entry.level === top);
  // A position in sheets from the top of the document: page 3, halfway down, is 2.5.
  const at = (head: OutlineEntry) => head.page - 1 + (offsets[head.id] ?? 0);
  const end = pageCount - 1 + lastPageFill;
  const sections: BudgetSection[] = [];

  if (heads.length > 0 && at(heads[0]) > 0) {
    sections.push({
      title: '(front matter)',
      level: 0,
      startPage: 1,
      endPage: heads[0].page - (offsets[heads[0].id] ? 0 : 1) || 1,
      pages: round(at(heads[0])),
    });
  }
  heads.forEach((head, i) => {
    const next = heads[i + 1];
    const until = next ? at(next) : end;
    sections.push({
      title: head.text,
      level: head.level,
      startPage: head.page,
      endPage: next ? Math.max(head.page, Math.ceil(until)) : pageCount,
      pages: round(Math.max(until - at(head), 0)),
    });
  });

  return {
    maxPages,
    pageCount,
    over,
    lastPageFill,
    toCut: over === 0 ? 0 : round(Math.max(over - 1 + lastPageFill, 0)),
    sections,
  };
}

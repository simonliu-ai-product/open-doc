import { useCallback, useMemo, useState } from 'react';

/**
 * How the viewer lays the sheets out. Every mode keeps every page mounted, in
 * order, as a direct child of one scrolling grid — the page counter, page jump,
 * the outline, find and the inspector all locate a sheet by its index there, so
 * none of them has to know which mode is on.
 */
export const VIEW_MODES = ['continuous', 'two-up', 'grid'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

const STORAGE_PREFIX = 'open-doc:view-mode:';

function isViewMode(value: unknown): value is ViewMode {
  return VIEW_MODES.some((mode) => mode === value);
}

function readViewMode(docId: string | undefined): ViewMode {
  if (!docId) return 'continuous';
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + docId);
    return isViewMode(stored) ? stored : 'continuous';
  } catch {
    return 'continuous';
  }
}

/**
 * The layout the reader last used for this document.
 *
 * The route keeps its state when it moves from one document to another, so the
 * choice is held together with the document it was made for; anything else
 * reads what that document last stored.
 */
export function useViewMode(docId: string | undefined): [ViewMode, (mode: ViewMode) => void] {
  const [chosen, setChosen] = useState<{ docId: string | undefined; mode: ViewMode } | null>(null);
  const stored = useMemo(() => readViewMode(docId), [docId]);
  const mode = chosen && chosen.docId === docId ? chosen.mode : stored;

  const choose = useCallback(
    (next: ViewMode) => {
      setChosen({ docId, mode: next });
      if (!docId) return;
      try {
        localStorage.setItem(STORAGE_PREFIX + docId, next);
      } catch {
        /* Blocked storage forgets the choice on reload; the choice itself stands. */
      }
    },
    [docId],
  );

  return [mode, choose];
}

/**
 * Sheets per grid row: as many as the pane holds at the current zoom, and never
 * more than there are pages, or a short document's only row would sit off-centre
 * beside empty columns.
 */
export function gridColumns(
  sheetWidth: number,
  availableWidth: number,
  gap: number,
  pageCount: number,
): number {
  const fit = Math.floor((availableWidth + gap) / (sheetWidth + gap));
  return Math.max(1, Math.min(fit, pageCount));
}

type Box = { top: number; height: number };

/**
 * Where the line being read sits, as a fraction of the viewport's height. A
 * full-size page is taller than the viewport, so intersection ratios never cross
 * a useful threshold; the row under this line is the one being read.
 */
export const READING_LINE = 1 / 3;

/**
 * The page the reader is on, from each sheet's box in scroll coordinates: the
 * first page of the row under the reading line.
 *
 * A page the reader chose — page jump, a thumbnail, the outline, a find hit —
 * stays current while it is in that row or wholly on screen. Without that, a
 * jump to the right-hand page of a spread reads back as the left one, and a jump
 * into a grid's last row, which can never scroll up to the line, reads back as
 * a row above it.
 */
export function pageInView(sheets: readonly Box[], view: Box, chosen: number | null): number {
  const line = view.top + view.height * READING_LINE;
  let rowTop = Number.NEGATIVE_INFINITY;
  for (const sheet of sheets) {
    if (sheet.top <= line && sheet.top > rowTop) rowTop = sheet.top;
  }

  const pick = chosen === null ? undefined : sheets[chosen - 1];
  if (chosen !== null && pick) {
    const onScreen = pick.top >= view.top && pick.top + pick.height <= view.top + view.height;
    if (onScreen || pick.top === rowTop) return chosen;
  }

  return Math.max(1, sheets.findIndex((sheet) => sheet.top === rowTop) + 1);
}

/**
 * How the viewer lays the sheets out. Every mode keeps all pages in the one
 * scroll container, so the page counter, page jump, the outline, find and the
 * inspector overlay work the same in each — there is no single-sheet mode,
 * which would need its own navigation path through all of them.
 */
export const VIEW_MODES = ['continuous', 'spread', 'grid'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * How many sheets side by side the zoom fits to. Fit width in two-up fits the
 * spread, not one of its pages; in grid it fits a row of three, which is what
 * keeps a chapter readable at a glance rather than a strip of postage stamps.
 */
export function sheetsAcross(mode: ViewMode): number {
  return mode === 'continuous' ? 1 : mode === 'spread' ? 2 : 3;
}

/**
 * The scale at which the mode's row of sheets exactly fills `width`. The gaps
 * between sheets are fixed pixels, not scaled with the pages, so they come off
 * the width before the sheets share what is left — counting them as page width
 * would leave the row a little too wide, and a grid of three would wrap to two.
 */
export function fitWidthScale(
  mode: ViewMode,
  width: number,
  pageWidth: number,
  gap: number,
): number {
  const across = sheetsAcross(mode);
  return Math.max(0, width - (across - 1) * gap) / (across * pageWidth);
}

/**
 * The page the reader is on: the first sheet of the lowest row whose top has
 * passed the marker. In two-up that is the left page of the spread in view —
 * the one a reader starts on — not the right one that shares its row.
 *
 * `prefer` is a page the reader just asked for. Jumping to page 3 in two-up
 * brings the 2–3 spread into view, and reporting 2 would read as the jump
 * having missed; while that page is in the row in view, it is the answer.
 */
export function pageAtMarker(tops: number[], marker: number, prefer?: number | null): number {
  let rowTop = Number.NEGATIVE_INFINITY;
  tops.forEach((top) => {
    if (top <= marker && top > rowTop) rowTop = top;
  });
  const index = tops.indexOf(rowTop);
  if (index < 0) return 1;
  if (prefer && tops[prefer - 1] === rowTop) return prefer;
  return index + 1;
}

const key = (docId: string) => `open-doc:view:${docId}`;

/** The mode last used for this document, so coming back resumes the same reading. */
export function readViewMode(docId: string | undefined): ViewMode {
  if (!docId) return 'continuous';
  try {
    const stored = localStorage.getItem(key(docId));
    return (VIEW_MODES as readonly string[]).includes(stored ?? '')
      ? (stored as ViewMode)
      : 'continuous';
  } catch {
    return 'continuous';
  }
}

export function writeViewMode(docId: string | undefined, mode: ViewMode): void {
  if (!docId) return;
  try {
    if (mode === 'continuous') localStorage.removeItem(key(docId));
    else localStorage.setItem(key(docId), mode);
  } catch {}
}

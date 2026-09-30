/**
 * Which pages a download covers.
 *
 * The custom field takes what a print dialog takes — `2`, `1-3`, `2,5,7-9` —
 * because that is the notation people already have in their fingers. Everything
 * here is 1-based on the way in and 0-based on the way out, which is where this
 * kind of code usually goes wrong: the reader says "page 1" and the array
 * wants index 0.
 */

export type PageSelection =
  | { kind: 'all' }
  | { kind: 'current' }
  | { kind: 'custom'; text: string };

/**
 * Zero-based indices, ascending, no duplicates.
 *
 * An unparseable or empty custom range returns null rather than an empty list:
 * "I could not read that" and "you asked for no pages" are different answers,
 * and only one of them should be allowed to start a download.
 */
export function resolveSelection(
  selection: PageSelection,
  total: number,
  currentPage: number,
): number[] | null {
  if (total <= 0) return null;
  if (selection.kind === 'all') return Array.from({ length: total }, (_, i) => i);
  if (selection.kind === 'current') {
    const index = clamp(currentPage, 1, total) - 1;
    return [index];
  }
  return parseRange(selection.text, total);
}

/** `2,5,7-9` → [1,4,6,7,8]. Null when nothing in the text names a real page. */
export function parseRange(text: string, total: number): number[] | null {
  if (text.trim() === '') return null;

  const wanted = new Set<number>();
  let sawSomething = false;

  for (const chunk of text.split(/[,，\s]+/)) {
    if (chunk === '') continue;
    /* Full-width digits and dashes: a Chinese keyboard produces them without
       the typist noticing, and rejecting them reads as the field being broken. */
    const plain = chunk
      .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
      .replace(/[–—ー－]/g, '-');

    const span = /^(\d+)-(\d+)$/.exec(plain);
    if (span) {
      const from = Number(span[1]);
      const to = Number(span[2]);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      /* `5-2` is a range someone typed backwards, not an empty one. */
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      for (let page = Math.max(1, lo); page <= Math.min(total, hi); page++) {
        wanted.add(page - 1);
        sawSomething = true;
      }
      continue;
    }

    if (/^\d+$/.test(plain)) {
      const page = Number(plain);
      if (page >= 1 && page <= total) {
        wanted.add(page - 1);
        sawSomething = true;
      }
    }
  }

  if (!sawSomething || wanted.size === 0) return null;
  return [...wanted].sort((a, b) => a - b);
}

export function describeSelection(
  selection: PageSelection,
  total: number,
  currentPage: number,
): { count: number; valid: boolean } {
  const pages = resolveSelection(selection, total, currentPage);
  return { count: pages?.length ?? 0, valid: pages !== null };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

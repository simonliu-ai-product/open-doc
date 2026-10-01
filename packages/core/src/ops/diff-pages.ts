/**
 * The pure half of `open-doc diff`: which sheet of the old version answers to
 * which sheet of the new one, and what changed in a sheet's text. Kept free of
 * Node and the DOM so both can be tested on their own.
 */

export type PagePair = {
  /** 0-based index in the old version, or null for a page that is new. */
  before: number | null;
  /** 0-based index in the new version, or null for a page that went away. */
  after: number | null;
};

export type LineChange = { op: 'same' | 'add' | 'remove'; text: string };

/** Longest common subsequence over two lists, as pairs of matching indices. */
function lcs<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): Array<[number, number]> {
  const rows = a.length;
  const cols = b.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      const row = table[i] as number[];
      const below = table[i + 1] as number[];
      row[j] = same(a[i] as T, b[j] as T)
        ? (below[j + 1] ?? 0) + 1
        : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (same(a[i] as T, b[j] as T)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Pairs the sheets of two versions. Pages whose text is unchanged anchor the
 * alignment, so a page inserted in the middle shows as one new page rather than
 * as every page after it having changed. Between two anchors the remaining
 * pages pair up in order; whichever side has more keeps the rest as added or
 * removed.
 */
export function alignPages(before: string[], after: string[]): PagePair[] {
  const anchors = lcs(before, after, (x, y) => x === y);
  const pairs: PagePair[] = [];
  let i = 0;
  let j = 0;
  const fill = (untilI: number, untilJ: number) => {
    while (i < untilI && j < untilJ) pairs.push({ before: i++, after: j++ });
    while (i < untilI) pairs.push({ before: i++, after: null });
    while (j < untilJ) pairs.push({ before: null, after: j++ });
  };
  for (const [ai, aj] of anchors) {
    fill(ai, aj);
    pairs.push({ before: i++, after: j++ });
  }
  fill(before.length, after.length);
  return pairs;
}

export function textLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
}

/** A line-level diff, in reading order. */
export function diffLines(before: string[], after: string[]): LineChange[] {
  const anchors = lcs(before, after, (x, y) => x === y);
  const out: LineChange[] = [];
  let i = 0;
  let j = 0;
  for (const [ai, aj] of [...anchors, [before.length, after.length] as [number, number]]) {
    while (i < ai) out.push({ op: 'remove', text: before[i++] ?? '' });
    while (j < aj) out.push({ op: 'add', text: after[j++] ?? '' });
    if (i < before.length && j < after.length && ai < before.length) {
      out.push({ op: 'same', text: before[i] ?? '' });
      i++;
      j++;
    }
  }
  return out;
}

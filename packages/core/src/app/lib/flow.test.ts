import { describe, expect, it } from 'vitest';
import { type BlockMetrics, paginateBlocks } from './flow.ts';

const b = (height: number, extra: Partial<BlockMetrics> = {}): BlockMetrics => ({
  height,
  ...extra,
});

describe('paginateBlocks', () => {
  it('fills a page before starting the next', () => {
    const { pages } = paginateBlocks([b(300), b(300), b(300), b(300)], 1000);
    expect(pages).toEqual([[0, 1, 2], [3]]);
  });

  it('keeps everything on one page when it fits', () => {
    const { pages } = paginateBlocks([b(100), b(100)], 1000);
    expect(pages).toEqual([[0, 1]]);
  });

  it('never leaves a heading as the last block on a page', () => {
    // The heading fits at the bottom, but its body does not — both move.
    const { pages } = paginateBlocks([b(400), b(400), b(60, { keepWithNext: true }), b(300)], 1000);
    expect(pages).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('moves a run of stacked headings together', () => {
    const { pages } = paginateBlocks(
      [b(800), b(50, { keepWithNext: true }), b(50, { keepWithNext: true }), b(300)],
      1000,
    );
    expect(pages).toEqual([[0], [1, 2, 3]]);
  });

  it('pulls a figure along with its caption', () => {
    const { pages } = paginateBlocks([b(300), b(600), b(120, { keepWithPrevious: true })], 1000);
    expect(pages).toEqual([[0], [1, 2]]);
  });

  it('honours an explicit page break', () => {
    const { pages } = paginateBlocks([b(100), b(100, { breakBefore: true }), b(100)], 1000);
    expect(pages).toEqual([[0], [1, 2]]);
  });

  it('gives an oversized block its own page and reports it', () => {
    const { pages, overflowing } = paginateBlocks([b(200), b(1400), b(200)], 1000);
    expect(pages).toEqual([[0], [1], [2]]);
    expect(overflowing).toEqual([1]);
  });

  it('does not strand a page when every block wants to keep with the next', () => {
    const { pages } = paginateBlocks(
      [b(600, { keepWithNext: true }), b(600, { keepWithNext: true }), b(600)],
      1000,
    );
    expect(pages).toEqual([[0], [1], [2]]);
  });

  it('returns no pages for no blocks', () => {
    expect(paginateBlocks([], 1000)).toEqual({ pages: [], overflowing: [] });
  });
});

describe('paginateBlocks with footnotes', () => {
  const block = (height: number, footnoteHeight = 0): BlockMetrics => ({ height, footnoteHeight });

  it('gives a page less body room when its blocks carry notes', () => {
    // Three 300px blocks fit 1000px on their own.
    expect(paginateBlocks([block(300), block(300), block(300)], 1000).pages).toEqual([[0, 1, 2]]);

    // Add 100px of notes to the first block plus 20px of area chrome and the
    // third no longer fits: notes print on the page their marker landed on.
    const withNotes = paginateBlocks([block(300, 100), block(300), block(300)], 1000, {
      footnoteOverhead: 20,
    });
    expect(withNotes.pages).toEqual([[0, 1], [2]]);
  });

  it('charges the area chrome once per page, not once per note', () => {
    const blocks = [block(300, 50), block(300, 50), block(300)];
    // 900 body + 100 notes + 20 chrome = 1020 > 1000.
    expect(paginateBlocks(blocks, 1000, { footnoteOverhead: 20 }).pages).toEqual([[0, 1], [2]]);
    // Without the chrome it is exactly 1000 and all three stay together.
    expect(paginateBlocks(blocks, 1000, { footnoteOverhead: 0 }).pages).toEqual([[0, 1, 2]]);
  });

  it('recomputes the notes budget for blocks that move to the next page', () => {
    const blocks: BlockMetrics[] = [
      { height: 300, footnoteHeight: 100 },
      { height: 100, keepWithNext: true },
      { height: 700 },
    ];
    const result = paginateBlocks(blocks, 1000, { footnoteOverhead: 20 });
    // The heading travels with the block it introduces, and its page's budget
    // is recomputed without the first block's notes.
    expect(result.pages).toEqual([[0], [1, 2]]);
  });

  it('flags a block whose own notes make it taller than a page', () => {
    const result = paginateBlocks([block(900, 200)], 1000, { footnoteOverhead: 20 });
    expect(result.overflowing).toEqual([0]);
  });

  it('leaves documents without notes packing exactly as before', () => {
    const blocks = [block(400), block(400), block(400)];
    expect(paginateBlocks(blocks, 1000, { footnoteOverhead: 20 }).pages).toEqual([[0, 1], [2]]);
  });
});

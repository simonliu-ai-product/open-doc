import { describe, expect, it } from 'vitest';
import { alignPages, diffLines, textLines } from './diff-pages.ts';

describe('alignPages', () => {
  it('pairs pages one to one when nothing moved', () => {
    expect(alignPages(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual([
      { before: 0, after: 0 },
      { before: 1, after: 1 },
      { before: 2, after: 2 },
    ]);
  });

  it('shows a page inserted in the middle as one new page, not every page after it', () => {
    expect(alignPages(['cover', 'one', 'two'], ['cover', 'new', 'one', 'two'])).toEqual([
      { before: 0, after: 0 },
      { before: null, after: 1 },
      { before: 1, after: 2 },
      { before: 2, after: 3 },
    ]);
  });

  it('shows a page that went away as removed', () => {
    expect(alignPages(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { before: 0, after: 0 },
      { before: 1, after: null },
      { before: 2, after: 1 },
    ]);
  });

  it('pairs edited pages in order between the unchanged ones', () => {
    expect(alignPages(['a', 'b1', 'c1', 'd'], ['a', 'b2', 'c2', 'x', 'd'])).toEqual([
      { before: 0, after: 0 },
      { before: 1, after: 1 },
      { before: 2, after: 2 },
      { before: null, after: 3 },
      { before: 3, after: 4 },
    ]);
  });

  it('copes with a version that has no pages', () => {
    expect(alignPages([], ['a'])).toEqual([{ before: null, after: 0 }]);
    expect(alignPages(['a'], [])).toEqual([{ before: 0, after: null }]);
  });
});

describe('diffLines', () => {
  it('marks what was added and removed around what stayed', () => {
    expect(diffLines(['title', 'old line', 'end'], ['title', 'new line', 'end'])).toEqual([
      { op: 'same', text: 'title' },
      { op: 'remove', text: 'old line' },
      { op: 'add', text: 'new line' },
      { op: 'same', text: 'end' },
    ]);
  });

  it('handles changes at either end', () => {
    expect(diffLines(['a'], ['z', 'a', 'b'])).toEqual([
      { op: 'add', text: 'z' },
      { op: 'same', text: 'a' },
      { op: 'add', text: 'b' },
    ]);
  });
});

describe('textLines', () => {
  it('collapses whitespace and drops blank lines', () => {
    expect(textLines('  A  heading \n\n body   text\n')).toEqual(['A heading', 'body text']);
  });
});

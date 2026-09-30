/**
 * Page ranges, where off-by-one lives.
 *
 * The reader types "1" and means the first page; the array wants index 0. Every
 * assertion here is about that seam, plus the two answers that must stay
 * distinct: "nothing you typed names a page" and "you selected no pages". Only
 * one of them should ever start a download, and neither should download
 * everything by accident.
 */

import { describe, expect, it } from 'vitest';
import { describeSelection, parseRange, resolveSelection } from './page-range';

describe('parseRange', () => {
  it('reads single pages, one-based', () => {
    expect(parseRange('1', 5)).toEqual([0]);
    expect(parseRange('3', 5)).toEqual([2]);
  });

  it('reads spans, inclusive at both ends', () => {
    expect(parseRange('1-3', 5)).toEqual([0, 1, 2]);
    expect(parseRange('4-5', 5)).toEqual([3, 4]);
  });

  it('reads a mixed list, sorted and deduplicated', () => {
    expect(parseRange('5,1,2-3,1', 9)).toEqual([0, 1, 2, 4]);
  });

  /* A range typed backwards is a range, not a mistake worth refusing. */
  it('accepts a span written the wrong way round', () => {
    expect(parseRange('5-2', 9)).toEqual([1, 2, 3, 4]);
  });

  /* 中文鍵盤打出來的全形數字和破折號，使用者不會察覺自己打的是全形。 */
  it('accepts full-width digits and dashes', () => {
    expect(parseRange('１-３', 5)).toEqual([0, 1, 2]);
    expect(parseRange('２，４', 5)).toEqual([1, 3]);
  });

  it('clips to the document rather than inventing pages', () => {
    expect(parseRange('3-99', 5)).toEqual([2, 3, 4]);
    expect(parseRange('0-2', 5)).toEqual([0, 1]);
  });

  /*
   * The important negative: nothing usable must be null, never an empty array.
   * An empty array flowing on would start a download of no pages.
   */
  it('returns null when nothing names a real page', () => {
    expect(parseRange('', 5)).toBeNull();
    expect(parseRange('   ', 5)).toBeNull();
    expect(parseRange('abc', 5)).toBeNull();
    expect(parseRange('9', 5)).toBeNull();
    expect(parseRange('-', 5)).toBeNull();
  });
});

describe('resolveSelection', () => {
  it('all covers the document', () => {
    expect(resolveSelection({ kind: 'all' }, 3, 2)).toEqual([0, 1, 2]);
  });

  it('current is the page being read, one-based in and zero-based out', () => {
    expect(resolveSelection({ kind: 'current' }, 5, 1)).toEqual([0]);
    expect(resolveSelection({ kind: 'current' }, 5, 4)).toEqual([3]);
  });

  /* currentPage can lag the document while it reflows; it must not index past. */
  it('clamps a current page outside the document', () => {
    expect(resolveSelection({ kind: 'current' }, 3, 99)).toEqual([2]);
    expect(resolveSelection({ kind: 'current' }, 3, 0)).toEqual([0]);
  });

  it('has nothing to give for an empty document', () => {
    expect(resolveSelection({ kind: 'all' }, 0, 1)).toBeNull();
  });
});

describe('describeSelection', () => {
  it('counts what the button is about to do', () => {
    expect(describeSelection({ kind: 'all' }, 4, 1)).toEqual({ count: 4, valid: true });
    expect(describeSelection({ kind: 'current' }, 4, 2)).toEqual({ count: 1, valid: true });
    expect(describeSelection({ kind: 'custom', text: '2-3' }, 4, 1)).toEqual({
      count: 2,
      valid: true,
    });
  });

  it('reports an unreadable range as invalid, not as zero pages', () => {
    expect(describeSelection({ kind: 'custom', text: 'nope' }, 4, 1)).toEqual({
      count: 0,
      valid: false,
    });
  });
});

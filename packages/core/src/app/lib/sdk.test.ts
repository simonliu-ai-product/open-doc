import { describe, expect, it } from 'vitest';
import { PAGE_SIZE_NAMES, PAGE_SIZES, resolvePageGeometry } from './sdk.ts';

describe('resolvePageGeometry', () => {
  it('defaults to portrait A4', () => {
    expect(resolvePageGeometry()).toEqual({
      width: PAGE_SIZES.A4.width,
      height: PAGE_SIZES.A4.height,
      css: '210mm 297mm',
    });
  });

  it('offers A4, B4 and A3 and nothing else', () => {
    expect([...PAGE_SIZE_NAMES]).toEqual(['A4', 'B4', 'A3']);
    expect(Object.keys(PAGE_SIZES)).toEqual([...PAGE_SIZE_NAMES]);
  });

  it('swaps both the pixel axes and the @page descriptor for landscape', () => {
    const geo = resolvePageGeometry({ pageSize: 'B4', orientation: 'landscape' });
    expect(geo.width).toBe(PAGE_SIZES.B4.height);
    expect(geo.height).toBe(PAGE_SIZES.B4.width);
    // Chromium drops `<mm> <mm> landscape` entirely — the axes must be swapped.
    expect(geo.css).toBe('364mm 257mm');
  });

  it('falls back to A4 for a page size that is no longer offered', () => {
    const geo = resolvePageGeometry({ pageSize: 'Letter' as never });
    expect(geo.width).toBe(PAGE_SIZES.A4.width);
  });
});

import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE_NAMES,
  PAGE_SIZES,
  paddingSides,
  resolvePageGeometry,
  sectionGeometry,
} from './sdk.ts';

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

describe('paddingSides', () => {
  it('spreads one number to all four sides and keeps sides given one by one', () => {
    expect(paddingSides(undefined, 76)).toEqual({ top: 76, right: 76, bottom: 76, left: 76 });
    expect(paddingSides(40, 76)).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
    const sides = { top: 96, right: 72, bottom: 120, left: 72 };
    expect(paddingSides(sides, 76)).toEqual(sides);
  });
});

describe('sectionGeometry', () => {
  it('turns the sheet for a section in the other orientation, and keeps it otherwise', () => {
    const a4 = resolvePageGeometry({ pageSize: 'A4' });
    const turned = sectionGeometry(a4, 'landscape');
    expect(turned).toEqual({ width: a4.height, height: a4.width, css: '297mm 210mm' });
    expect(sectionGeometry(a4, 'portrait')).toBe(a4);
    expect(sectionGeometry(a4, undefined)).toBe(a4);
    expect(sectionGeometry(turned, 'portrait')).toEqual(a4);
  });
});

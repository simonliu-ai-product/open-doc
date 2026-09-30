import { describe, expect, it } from 'vitest';
import { fitWidthScale, pageAtMarker, sheetsAcross } from './view-mode.ts';

describe('fitWidthScale', () => {
  it('fits one sheet, a spread, or a row of three into the width', () => {
    expect(sheetsAcross('continuous')).toBe(1);
    for (const mode of ['continuous', 'spread', 'grid'] as const) {
      const scale = fitWidthScale(mode, 960, 794, 24);
      const across = sheetsAcross(mode);
      // The row the viewer lays out — scaled sheets plus fixed gaps — fills it exactly.
      expect(across * 794 * scale + (across - 1) * 24).toBeCloseTo(960);
    }
  });
});

describe('pageAtMarker', () => {
  it('follows a single column', () => {
    expect(pageAtMarker([0, 1100, 2200], 1500)).toBe(2);
    expect(pageAtMarker([0, 1100, 2200], 10)).toBe(1);
  });

  it('reports the left page of the spread in view', () => {
    // Page 1 alone on the right, then 2–3, 4–5.
    const tops = [0, 1100, 1100, 2200, 2200];
    expect(pageAtMarker(tops, 1500)).toBe(2);
    expect(pageAtMarker(tops, 2300)).toBe(4);
  });

  it('reports the first sheet of the grid row in view', () => {
    const tops = [0, 0, 0, 300, 300, 300, 600];
    expect(pageAtMarker(tops, 450)).toBe(4);
    expect(pageAtMarker(tops, 650)).toBe(7);
  });

  it('keeps a page just jumped to while its row is in view', () => {
    const tops = [0, 1100, 1100, 2200, 2200];
    expect(pageAtMarker(tops, 1500, 3)).toBe(3);
    // Scrolled on to the next spread: the jump no longer describes the view.
    expect(pageAtMarker(tops, 2300, 3)).toBe(4);
  });

  it('falls back to the first page before anything has passed the marker', () => {
    expect(pageAtMarker([200, 1300], 100)).toBe(1);
    expect(pageAtMarker([], 100)).toBe(1);
  });
});

/**
 * Which page the counter names, and how many sheets share a grid row.
 *
 * Two-up and grid put several sheets on the same top, so "the sheet under the
 * reading line" stops being one sheet. These cases pin down what the counter
 * says then — plus the guarantee that a single column reads exactly as it did.
 */

import { describe, expect, it } from 'vitest';
import { gridColumns, pageInView, READING_LINE } from './view-mode';

const GAP = 24;
const GUTTER = 48;
const VIEW_HEIGHT = 900;
const LINE = VIEW_HEIGHT * READING_LINE;

function layout(count: number, columns: number, height: number) {
  const rowTop = (row: number) => GUTTER + row * (height + GAP);
  const sheets = Array.from({ length: count }, (_, index) => ({
    top: rowTop(Math.floor(index / columns)),
    height,
  }));
  return { sheets, rowTop };
}

const view = (top: number) => ({ top, height: VIEW_HEIGHT });

describe('gridColumns', () => {
  it('fits as many columns as the pane holds, gaps included', () => {
    // 4 × 238 + 3 × 24 = 1024; a fifth sheet would need 1286.
    expect(gridColumns(238, 1100, GAP, 30)).toBe(4);
    expect(gridColumns(238, 1024, GAP, 30)).toBe(4);
    expect(gridColumns(238, 1023, GAP, 30)).toBe(3);
  });

  it('never drops below one column, even in a pane narrower than a sheet', () => {
    expect(gridColumns(238, 100, GAP, 30)).toBe(1);
    expect(gridColumns(238, 0, GAP, 30)).toBe(1);
  });

  it('never opens more columns than there are pages', () => {
    expect(gridColumns(238, 5000, GAP, 3)).toBe(3);
  });
});

describe('pageInView', () => {
  it('reads a single column exactly as before: the last sheet above the line', () => {
    const { sheets, rowTop } = layout(10, 1, 1123);
    expect(pageInView(sheets, view(0), null)).toBe(1);
    expect(pageInView(sheets, view(rowTop(1) - LINE), null)).toBe(2);
    expect(pageInView(sheets, view(rowTop(1) - LINE - 1), null)).toBe(1);
    expect(pageInView(sheets, view(rowTop(5) - LINE + 500), null)).toBe(6);
  });

  it('names page 1 while the line is still above the first sheet', () => {
    const { sheets } = layout(3, 1, 1123);
    expect(pageInView(sheets, view(-LINE), null)).toBe(1);
  });

  it('names the first page of the row under the line when nothing was chosen', () => {
    const { sheets, rowTop } = layout(30, 4, 337);
    // The third row holds pages 9–12.
    expect(pageInView(sheets, view(rowTop(2) - LINE), null)).toBe(9);
  });

  it('keeps a chosen page that sits in the row under the line', () => {
    const { sheets, rowTop } = layout(30, 4, 337);
    expect(pageInView(sheets, view(rowTop(2) - LINE), 11)).toBe(11);
  });

  it('keeps a chosen page that is wholly on screen, even off the line', () => {
    const { sheets, rowTop } = layout(30, 4, 337);
    // Scrolled to the bottom: the last row (29–30) is on screen, but the line
    // can never reach it — it sits in the row above.
    const bottom = rowTop(7) + 337 + GUTTER * 1.5 - VIEW_HEIGHT;
    expect(pageInView(sheets, view(bottom), null)).toBe(25);
    expect(pageInView(sheets, view(bottom), 30)).toBe(30);
  });

  it('lets go of a chosen page once it is neither on the line nor on screen', () => {
    const { sheets, rowTop } = layout(30, 4, 337);
    expect(pageInView(sheets, view(rowTop(5) - LINE), 2)).toBe(21);
  });

  it('pairs a spread that opens on a right-hand page', () => {
    // Page 1 alone, then 2–3 and 4–5 side by side.
    const sheets = [48, 861, 861, 1674, 1674].map((top) => ({ top, height: 789 }));
    expect(pageInView(sheets, view(861 - LINE), null)).toBe(2);
    expect(pageInView(sheets, view(861 - LINE), 3)).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import type { OutlineEntry } from './outline';
import { pageBudget } from './page-budget';

const h = (text: string, page: number, level = 1): OutlineEntry => ({
  id: text,
  text,
  level,
  page,
});

describe('pageBudget', () => {
  it('reports nothing to cut when the document fits', () => {
    const budget = pageBudget(4, 3, [1, 1, 0.5], [h('Intro', 1)]);
    expect(budget).toMatchObject({ over: 0, toCut: 0, lastPageFill: 0.5 });
  });

  it('counts a nearly empty last sheet as cheap to lose', () => {
    const budget = pageBudget(10, 11, [...Array(10).fill(1), 0.2], [h('A', 1)]);
    expect(budget.over).toBe(1);
    expect(budget.toCut).toBe(0.2);
  });

  it('splits the length by top-rank section, with front matter first', () => {
    const outline = [h('Summary', 3), h('Detail', 3, 2), h('Method', 4), h('Results', 7)];
    const budget = pageBudget(6, 8, [1, 1, 1, 1, 1, 1, 1, 0.5], outline);
    expect(budget.sections).toEqual([
      { title: '(front matter)', level: 0, startPage: 1, endPage: 2, pages: 2 },
      { title: 'Summary', level: 1, startPage: 3, endPage: 3, pages: 1 },
      { title: 'Method', level: 1, startPage: 4, endPage: 6, pages: 3 },
      { title: 'Results', level: 1, startPage: 7, endPage: 8, pages: 1.5 },
    ]);
    expect(budget.toCut).toBe(1.5);
  });

  it('gives sections that share a sheet no length of their own', () => {
    const budget = pageBudget(1, 1, [0.8], [h('One', 1), h('Two', 1)]);
    expect(budget.sections.map((s) => s.pages)).toEqual([0, 0.8]);
  });
});

describe('pageBudget with heading offsets', () => {
  it('measures sections that share a sheet by where their headings sit', () => {
    const outline = [h('One', 2), h('Two', 2), h('Three', 3)];
    const budget = pageBudget(2, 3, [1, 1, 0.5], outline, { One: 0.1, Two: 0.6, Three: 0 });
    expect(budget.sections).toEqual([
      { title: '(front matter)', level: 0, startPage: 1, endPage: 2, pages: 1.1 },
      { title: 'One', level: 1, startPage: 2, endPage: 2, pages: 0.5 },
      { title: 'Two', level: 1, startPage: 2, endPage: 2, pages: 0.4 },
      { title: 'Three', level: 1, startPage: 3, endPage: 3, pages: 0.5 },
    ]);
  });
});

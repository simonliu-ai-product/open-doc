import { describe, expect, it } from 'vitest';
import { formatChartValue, layoutChart, niceTicks, toNumber } from './chart';

const DATA = [
  { month: 'Jan', cost: 120, budget: 100 },
  { month: 'Feb', cost: 80, budget: 100 },
  { month: 'Mar', cost: 150, budget: 120 },
];

describe('niceTicks', () => {
  it('steps by 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(0, 150)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0, 0.87)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(-30, 70)).toEqual([-40, -20, 0, 20, 40, 60, 80]);
  });

  it('opens a flat range so there is still an axis to draw', () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
  });
});

describe('values', () => {
  it('reads CSV cells and typed numbers alike', () => {
    expect(toNumber('1,204')).toBe(1204);
    expect(toNumber(3.5)).toBe(3.5);
    expect(toNumber('')).toBeNull();
    expect(toNumber('n/a')).toBeNull();
  });

  it('formats like DataTable', () => {
    expect(formatChartValue(0.123, 'percent')).toBe('12.3%');
    expect(formatChartValue(1234.6, 'integer')).toBe((1235).toLocaleString());
    expect(formatChartValue(7, (v) => `${v} ms`)).toBe('7 ms');
  });
});

describe('layoutChart', () => {
  const base = { data: DATA, x: 'month', width: 400, height: 200 } as const;

  it('stands bars on zero and keeps them inside the plot', () => {
    const chart = layoutChart({ ...base, type: 'bar', y: ['cost'] });
    expect(chart.bars).toHaveLength(3);
    const floor = chart.plot.y + chart.plot.height;
    for (const bar of chart.bars) {
      expect(bar.y).toBeGreaterThanOrEqual(chart.plot.y);
      expect(bar.y + bar.height).toBeCloseTo(floor, 1);
    }
    // The tallest value draws the tallest bar.
    const tallest = chart.bars.reduce((a, b) => (b.height > a.height ? b : a));
    expect(tallest.value).toBe(150);
    expect(chart.ticks[0]?.value).toBe(0);
  });

  it('groups series side by side, or stacks them', () => {
    const grouped = layoutChart({ ...base, type: 'bar', y: ['cost', 'budget'] });
    const [jan, janBudget] = grouped.bars;
    expect(janBudget && jan && janBudget.x).toBeGreaterThan(jan?.x ?? 0);
    expect(grouped.legend.map((item) => item.name)).toEqual(['cost', 'budget']);

    const stacked = layoutChart({ ...base, type: 'bar', y: ['cost', 'budget'], stacked: true });
    const [a, b] = stacked.bars;
    expect(a?.x).toBe(b?.x);
    expect(b && a && b.y + b.height).toBeCloseTo(a?.y ?? 0, 1);
    // The axis has room for the stacked total, 270.
    expect(stacked.ticks[stacked.ticks.length - 1]?.value).toBeGreaterThanOrEqual(270);
  });

  it('draws one line per series through the band centres', () => {
    const chart = layoutChart({
      ...base,
      type: 'line',
      y: ['cost', 'budget'],
      labels: { cost: 'Cost', budget: 'Budget' },
    });
    expect(chart.lines).toHaveLength(2);
    expect(chart.lines[0]?.points.map((p) => p.x)).toEqual(chart.categories.map((c) => c.x));
    expect(chart.legend.map((item) => item.name)).toEqual(['Cost', 'Budget']);
  });

  it('thins category labels that would collide', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ day: `Day ${i + 1}`, n: i }));
    const chart = layoutChart({
      type: 'bar',
      data: many,
      x: 'day',
      y: ['n'],
      width: 300,
      height: 160,
    });
    expect(chart.categories.length).toBeLessThan(40);
    const xs = chart.categories.map((c) => c.x);
    for (let i = 1; i < xs.length; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThan(30);
  });

  it('cuts a pie into shares that add up to the whole', () => {
    const chart = layoutChart({ ...base, type: 'pie', y: ['cost'], values: true });
    expect(chart.slices).toHaveLength(3);
    expect(chart.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 6);
    expect(chart.legend[0]?.name).toContain('Jan');
    expect(chart.values.map((v) => v.text)).toEqual(['34.3%', '22.9%', '42.9%']);
  });

  it('draws a single-slice pie as a full circle', () => {
    const chart = layoutChart({ ...base, type: 'pie', data: [DATA[0] ?? {}], y: ['cost'] });
    expect(chart.slices[0]?.path).toMatch(/ a.* a/);
  });
});

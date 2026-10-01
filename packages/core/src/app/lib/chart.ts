/**
 * Chart geometry, kept pure so it can be tested without a DOM.
 *
 * A chart is laid out synchronously from its data into a fixed box — no
 * measuring pass, no async load — because the flow packer measures the page
 * as it first renders, and a chart that settled a tick later would settle
 * after the page break was decided. Text widths come from the same estimate
 * the diagram compiler uses, for the same reason.
 */

import { measureText } from '../../diagram/layout';

export type ChartType = 'bar' | 'line' | 'pie';

export type ChartFormat = 'number' | 'integer' | 'percent' | ((value: number) => string);

export type ChartSpec = {
  type: ChartType;
  data: Array<Record<string, unknown>>;
  x: string;
  y: string[];
  /** Legend names per `y` key. */
  labels?: Record<string, string>;
  stacked?: boolean;
  format?: ChartFormat;
  width: number;
  height: number;
  /** Print each value on its bar, point or slice. */
  values?: boolean;
};

export type Rect = { x: number; y: number; width: number; height: number };
export type Tick = { value: number; at: number; label: string };
export type CategoryLabel = { text: string; x: number };
export type LegendItem = { name: string; series: number; x: number; y: number };
export type ValueLabel = { text: string; x: number; y: number; anchor: 'middle' | 'start' };
export type Bar = Rect & { series: number; value: number };
export type Line = { series: number; points: Array<{ x: number; y: number; value: number }> };
export type Slice = { series: number; path: string; share: number; name: string };

export type ChartLayout = {
  width: number;
  height: number;
  plot: Rect;
  /** Where zero sits on the value axis, when the axis has one. */
  baseline: number | null;
  ticks: Tick[];
  categories: CategoryLabel[];
  bars: Bar[];
  lines: Line[];
  slices: Slice[];
  legend: LegendItem[];
  values: ValueLabel[];
};

export const CHART_FONT_SIZE = 10;
const LEGEND_SWATCH = 9;
const LEGEND_GAP = 14;

/** A number read the way a CSV cell or a typed literal would hold it. */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatChartValue(value: number, format: ChartFormat | undefined): string {
  if (typeof format === 'function') return format(value);
  if (format === 'integer') return Math.round(value).toLocaleString();
  if (format === 'percent')
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Round tick values over a range — 0, 20, 40 rather than 0, 17.3, 34.6 —
 * stepping by 1, 2 or 5 times a power of ten.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    if (min === 0) return [0, 1];
    const pad = Math.abs(min) * 0.5;
    return niceTicks(Math.min(0, min - pad), Math.max(0, max + pad), count);
  }
  const span = max - min;
  const rough = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Rounded to the step's precision, so 0.1 + 0.2 never prints as 0.30000000000000004.
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  for (let value = first; value <= last + step / 2; value += step) {
    ticks.push(Number(value.toFixed(digits)));
  }
  return ticks;
}

function seriesName(spec: ChartSpec, key: string): string {
  return spec.labels?.[key] ?? key;
}

function legendRow(names: string[], left: number, top: number): LegendItem[] {
  let x = left;
  return names.map((name, series) => {
    const item = { name, series, x, y: top };
    x += LEGEND_SWATCH + 5 + measureText(name, CHART_FONT_SIZE) + LEGEND_GAP;
    return item;
  });
}

function slicePath(cx: number, cy: number, r: number, from: number, to: number): string {
  // A slice that is the whole pie is a circle; an arc from a point to itself draws nothing.
  if (to - from >= Math.PI * 2 - 1e-9) {
    return `M${cx - r},${cy} a${r},${r} 0 1 0 ${r * 2},0 a${r},${r} 0 1 0 ${-r * 2},0 Z`;
  }
  const point = (angle: number) => ({
    x: cx + r * Math.sin(angle),
    y: cy - r * Math.cos(angle),
  });
  const start = point(from);
  const end = point(to);
  const large = to - from > Math.PI ? 1 : 0;
  return (
    `M${cx},${cy} L${round(start.x)},${round(start.y)} ` +
    `A${r},${r} 0 ${large} 1 ${round(end.x)},${round(end.y)} Z`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function layoutPie(spec: ChartSpec): ChartLayout {
  const key = spec.y[0] ?? '';
  const rows = spec.data
    .map((row) => ({ name: String(row[spec.x] ?? ''), value: toNumber(row[key]) ?? 0 }))
    .filter((row) => row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  const r = Math.max(10, Math.min(spec.height / 2 - 6, spec.width * 0.25));
  const cx = r + 6;
  const cy = spec.height / 2;
  const slices: Slice[] = [];
  const values: ValueLabel[] = [];
  let angle = 0;
  rows.forEach((row, series) => {
    const share = total > 0 ? row.value / total : 0;
    const next = angle + share * Math.PI * 2;
    slices.push({ series, path: slicePath(cx, cy, r, angle, next), share, name: row.name });
    if (spec.values && share >= 0.06) {
      const mid = (angle + next) / 2;
      values.push({
        text: formatChartValue(share, 'percent'),
        x: round(cx + r * 0.62 * Math.sin(mid)),
        y: round(cy - r * 0.62 * Math.cos(mid) + CHART_FONT_SIZE * 0.35),
        anchor: 'middle',
      });
    }
    angle = next;
  });

  // The legend reads down the side: name and share, one per slice.
  const legendLeft = cx + r + 24;
  const lineHeight = CHART_FONT_SIZE * 1.8;
  const legendTop = cy - (rows.length * lineHeight) / 2 + lineHeight / 2;
  const legend = slices.map((slice, series) => ({
    name: `${slice.name}　${formatChartValue(slice.share, 'percent')}`,
    series,
    x: legendLeft,
    y: round(legendTop + series * lineHeight),
  }));

  return {
    width: spec.width,
    height: spec.height,
    plot: { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
    baseline: null,
    ticks: [],
    categories: [],
    bars: [],
    lines: [],
    slices,
    legend,
    values,
  };
}

export function layoutChart(spec: ChartSpec): ChartLayout {
  if (spec.type === 'pie') return layoutPie(spec);

  const names = spec.y.map((key) => seriesName(spec, key));
  const categories = spec.data.map((row) => String(row[spec.x] ?? ''));
  const matrix = spec.data.map((row) => spec.y.map((key) => toNumber(row[key])));

  // The value range, with stacked bars summed per category. Bars always stand
  // on zero; a line keeps zero in view unless its values sit far above it.
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const values of matrix) {
    if (spec.type === 'bar' && spec.stacked) {
      const up = values.reduce<number>((sum, v) => sum + Math.max(0, v ?? 0), 0);
      const down = values.reduce<number>((sum, v) => sum + Math.min(0, v ?? 0), 0);
      lo = Math.min(lo, down);
      hi = Math.max(hi, up);
    } else {
      for (const v of values) {
        if (v === null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (spec.type === 'bar' || (lo >= 0 && lo <= hi * 0.5)) lo = Math.min(0, lo);
  if (spec.type === 'bar') hi = Math.max(0, hi);

  const tickValues = niceTicks(lo, hi);
  const min = tickValues[0] ?? 0;
  const max = tickValues[tickValues.length - 1] ?? 1;
  const tickLabels = tickValues.map((value) => formatChartValue(value, spec.format));

  const legendHeight = spec.y.length > 1 ? CHART_FONT_SIZE * 2.2 : 0;
  const top = 6 + legendHeight + (spec.values ? CHART_FONT_SIZE : 0);
  // The width estimate runs a little short for digits in most faces; the
  // margin errs wide so the longest tick label never clips at the edge.
  const left =
    Math.ceil(Math.max(...tickLabels.map((t) => measureText(t, CHART_FONT_SIZE))) * 1.2) + 12;
  const bottom = CHART_FONT_SIZE * 2;
  const right = 6;
  const plot: Rect = {
    x: left,
    y: top,
    width: Math.max(10, spec.width - left - right),
    height: Math.max(10, spec.height - top - bottom),
  };
  const yOf = (value: number) =>
    round(plot.y + plot.height - ((value - min) / (max - min)) * plot.height);

  const ticks = tickValues.map((value, i) => ({
    value,
    at: yOf(value),
    label: tickLabels[i] ?? '',
  }));

  const band = plot.width / Math.max(1, categories.length);
  // Labels that would collide thin out to every k-th, rather than overlap.
  const widest = Math.max(0, ...categories.map((c) => measureText(c, CHART_FONT_SIZE)));
  const every = Math.max(1, Math.ceil((widest + 6) / band));
  const categoryLabels = categories
    .map((text, i) => ({ text, x: round(plot.x + band * (i + 0.5)) }))
    .filter((_, i) => i % every === 0);

  const bars: Bar[] = [];
  const lines: Line[] = [];
  const values: ValueLabel[] = [];

  if (spec.type === 'bar') {
    const group = band * 0.68;
    const each = spec.stacked ? group : group / Math.max(1, spec.y.length);
    matrix.forEach((row, i) => {
      const start = plot.x + band * i + (band - group) / 2;
      let up = 0;
      let down = 0;
      row.forEach((value, series) => {
        if (value === null) return;
        let from: number;
        let to: number;
        if (spec.stacked) {
          from = value >= 0 ? up : down;
          to = from + value;
          if (value >= 0) up = to;
          else down = to;
        } else {
          from = 0;
          to = value;
        }
        const y1 = yOf(Math.max(from, to));
        const y2 = yOf(Math.min(from, to));
        const x = round(spec.stacked ? start : start + each * series);
        const width = round(Math.max(1, each - (spec.stacked ? 0 : 2)));
        bars.push({ x, y: y1, width, height: round(Math.max(0, y2 - y1)), series, value });
        if (spec.values && !spec.stacked) {
          values.push({
            text: formatChartValue(value, spec.format),
            x: round(x + width / 2),
            y: round(value >= 0 ? y1 - 3 : y2 + CHART_FONT_SIZE + 2),
            anchor: 'middle',
          });
        }
      });
      if (spec.values && spec.stacked) {
        values.push({
          text: formatChartValue(up + down, spec.format),
          x: round(start + group / 2),
          y: round(yOf(up) - 3),
          anchor: 'middle',
        });
      }
    });
  } else {
    spec.y.forEach((_, series) => {
      const points = matrix.flatMap((row, i) => {
        const value = row[series];
        return value === null || value === undefined
          ? []
          : [{ x: round(plot.x + band * (i + 0.5)), y: yOf(value), value }];
      });
      lines.push({ series, points });
      if (spec.values) {
        for (const point of points) {
          values.push({
            text: formatChartValue(point.value, spec.format),
            x: point.x,
            y: round(point.y - 6),
            anchor: 'middle',
          });
        }
      }
    });
  }

  return {
    width: spec.width,
    height: spec.height,
    plot,
    baseline: min <= 0 && max >= 0 ? yOf(0) : null,
    ticks,
    categories: categoryLabels,
    bars,
    lines,
    slices: [],
    legend: spec.y.length > 1 ? legendRow(names, plot.x, 6 + CHART_FONT_SIZE * 0.8) : [],
    values,
  };
}

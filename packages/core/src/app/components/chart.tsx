import type { CSSProperties, ReactNode } from 'react';
import { CHART_FONT_SIZE, type ChartFormat, type ChartType, layoutChart } from '../lib/chart';
import type { LabelKind } from '../lib/labels';
import { Figure } from './numbering';

export type ChartProps = {
  type?: ChartType;
  /** Rows as parsed from a `.csv`/`.tsv` import, or any array of objects. */
  data: Array<Record<string, unknown>>;
  /** The key holding each row's category — the x axis, or a slice's name. */
  x: string;
  /** The key, or keys, holding the values. One key per series; a pie reads the first. */
  y: string | string[];
  /** Legend names for the `y` keys. */
  labels?: Record<string, string>;
  /** Stack the series instead of grouping them (bar charts). */
  stacked?: boolean;
  /** How axis ticks and value labels print. */
  format?: ChartFormat;
  /** Print each value on its bar, point or slice. */
  values?: boolean;
  /** Series colours, in order. Defaults to the document's accent and tints of it. */
  colors?: string[];
  /** Drawn size in CSS px; the drawing scales down to the column if it is wider. */
  width?: number;
  height?: number;
  /** Caption text. Given one, the chart is numbered like any other figure. */
  caption?: ReactNode;
  captionText?: string;
  kind?: LabelKind;
  id?: string;
  style?: CSSProperties;
  className?: string;
};

const ACCENT = 'var(--od-accent, #2563eb)';
const TEXT = 'var(--od-text, #16181d)';
const MUTED = 'var(--od-muted, #6b7280)';
const RULE = 'var(--od-rule, #e5e7eb)';
const FONT = 'var(--od-font-body, sans-serif)';

/**
 * The accent first, then tints and shades of it and of the text colour, so a
 * chart takes on the document's palette and changes with it — the same reason
 * the diagram renderer draws in `--od-*` variables rather than its own colours.
 */
const SERIES = [
  ACCENT,
  `color-mix(in srgb, ${ACCENT} 45%, #ffffff)`,
  `color-mix(in srgb, ${TEXT} 55%, #ffffff)`,
  `color-mix(in srgb, ${ACCENT} 70%, #000000)`,
  `color-mix(in srgb, ${TEXT} 28%, #ffffff)`,
  `color-mix(in srgb, ${ACCENT} 22%, #ffffff)`,
];

function colorOf(series: number, colors: string[] | undefined): string {
  return colors?.[series] ?? SERIES[series % SERIES.length] ?? ACCENT;
}

/**
 * A bar, line or pie chart drawn from data, in the document's own colours and
 * type. It lays itself out synchronously into a fixed box, so it measures as
 * it prints; the Word export places it as a picture.
 */
export function Chart({
  type = 'bar',
  data,
  x,
  y,
  labels,
  stacked,
  format,
  values,
  colors,
  width = 560,
  height = type === 'pie' ? 220 : 260,
  caption,
  captionText,
  kind = 'figure',
  id,
  style,
  className,
}: ChartProps) {
  const keys = Array.isArray(y) ? y : [y];
  const chart = layoutChart({
    type,
    data,
    x,
    y: keys,
    width,
    height,
    ...(labels ? { labels } : {}),
    ...(stacked ? { stacked } : {}),
    ...(format ? { format } : {}),
    ...(values ? { values } : {}),
  });
  const text = { fontFamily: FONT, fontSize: CHART_FONT_SIZE } as const;
  const summary =
    captionText ?? (typeof caption === 'string' ? caption : `${type} chart of ${keys.join(', ')}`);

  const drawing = (
    <svg
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      width={chart.width}
      height={chart.height}
      role="img"
      aria-label={summary}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        margin: '0 auto',
        ...(caption ? undefined : style),
      }}
      className={caption ? undefined : className}
    >
      {chart.ticks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={chart.plot.x}
            x2={chart.plot.x + chart.plot.width}
            y1={tick.at}
            y2={tick.at}
            style={{ stroke: RULE }}
            strokeWidth={1}
          />
          <text
            x={chart.plot.x - 6}
            y={tick.at + CHART_FONT_SIZE * 0.35}
            textAnchor="end"
            style={{ ...text, fill: MUTED }}
          >
            {tick.label}
          </text>
        </g>
      ))}
      {chart.bars.map((bar) => (
        <rect
          key={`${bar.series}-${bar.x}-${bar.y}`}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          style={{ fill: colorOf(bar.series, colors) }}
        />
      ))}
      {chart.baseline !== null && chart.bars.length > 0 && (
        <line
          x1={chart.plot.x}
          x2={chart.plot.x + chart.plot.width}
          y1={chart.baseline}
          y2={chart.baseline}
          style={{ stroke: MUTED }}
          strokeWidth={1}
        />
      )}
      {chart.lines.map((line) => (
        <g key={line.series} style={{ stroke: colorOf(line.series, colors) }}>
          <polyline
            points={line.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {line.points.map((point) => (
            <circle
              key={point.x}
              cx={point.x}
              cy={point.y}
              r={3}
              strokeWidth={1.5}
              style={{ fill: 'var(--od-bg, #ffffff)' }}
            />
          ))}
        </g>
      ))}
      {chart.slices.map((slice) => (
        <path
          key={slice.series}
          d={slice.path}
          style={{ fill: colorOf(slice.series, colors), stroke: 'var(--od-bg, #ffffff)' }}
          strokeWidth={1.5}
        />
      ))}
      {chart.categories.map((category) => (
        <text
          key={category.x}
          x={category.x}
          y={chart.plot.y + chart.plot.height + CHART_FONT_SIZE * 1.5}
          textAnchor="middle"
          style={{ ...text, fill: MUTED }}
        >
          {category.text}
        </text>
      ))}
      {chart.values.map((value) => (
        <text
          key={`${value.x}-${value.y}-${value.text}`}
          x={value.x}
          y={value.y}
          textAnchor={value.anchor}
          style={{ ...text, fill: chart.slices.length > 0 ? '#ffffff' : TEXT }}
        >
          {value.text}
        </text>
      ))}
      {chart.legend.map((item) => (
        <g key={item.series}>
          <rect
            x={item.x}
            y={item.y - 8}
            width={9}
            height={9}
            rx={2}
            style={{ fill: colorOf(item.series, colors) }}
          />
          <text x={item.x + 14} y={item.y} style={{ ...text, fill: TEXT }}>
            {item.name}
          </text>
        </g>
      ))}
    </svg>
  );

  if (!caption) return drawing;

  return (
    <Figure
      {...(id ? { id } : {})}
      caption={caption}
      {...(captionText ? { captionText } : {})}
      kind={kind}
      className={className}
      {...(style ? { style } : {})}
    >
      {drawing}
    </Figure>
  );
}

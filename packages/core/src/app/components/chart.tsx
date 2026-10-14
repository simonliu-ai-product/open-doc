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
      {chart.ticks.map((tick) =>
        chart.horizontal ? (
          <g key={tick.value}>
            <line
              x1={tick.at}
              x2={tick.at}
              y1={chart.plot.y}
              y2={chart.plot.y + chart.plot.height}
              style={{ stroke: RULE }}
              strokeWidth={1}
            />
            <text
              x={tick.at}
              y={chart.plot.y + chart.plot.height + CHART_FONT_SIZE * 1.4}
              textAnchor="middle"
              style={{ ...text, fill: MUTED }}
            >
              {tick.label}
            </text>
          </g>
        ) : (
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
        ),
      )}
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
      {chart.baseline !== null &&
        chart.bars.length > 0 &&
        (chart.horizontal ? (
          <line
            x1={chart.baseline}
            x2={chart.baseline}
            y1={chart.plot.y}
            y2={chart.plot.y + chart.plot.height}
            style={{ stroke: MUTED }}
            strokeWidth={1}
          />
        ) : (
          <line
            x1={chart.plot.x}
            x2={chart.plot.x + chart.plot.width}
            y1={chart.baseline}
            y2={chart.baseline}
            style={{ stroke: MUTED }}
            strokeWidth={1}
          />
        ))}
      {chart.lines.map((line) => (
        <g key={line.series} style={{ stroke: colorOf(line.series, colors) }}>
          {line.areaPath && (
            <path
              d={line.areaPath}
              stroke="none"
              style={{
                fill: `color-mix(in srgb, ${colorOf(line.series, colors)} 20%, transparent)`,
              }}
            />
          )}
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
          key={`${category.x}-${category.y ?? 0}-${category.text}`}
          x={category.x}
          y={category.y ?? chart.plot.y + chart.plot.height + CHART_FONT_SIZE * 1.5}
          textAnchor={chart.horizontal ? 'end' : 'middle'}
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

export type SparklineProps = {
  /** Numeric values to plot in order. */
  data: number[];
  /** Line with subtle fill, or compact inline bars. Defaults to 'line'. */
  type?: 'line' | 'bar';
  width?: number;
  height?: number;
  color?: string;
  /** Highlight the final data point with a dot on line sparklines. Defaults to true. */
  showEndDot?: boolean;
  style?: CSSProperties;
  className?: string;
};

/**
 * A compact word-sized chart that sits inline inside a paragraph or table cell.
 */
export function Sparkline({
  data,
  type = 'line',
  width = 76,
  height = 20,
  color = ACCENT,
  showEndDot = true,
  style,
  className,
}: SparklineProps) {
  const nums = data.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pad = 2.5;
  const w = Math.max(4, width - pad * 2);
  const h = Math.max(4, height - pad * 2);

  if (type === 'bar') {
    const baseMin = Math.min(0, min);
    const baseMax = Math.max(0, max) || 1;
    const baseSpan = baseMax - baseMin || 1;
    const step = w / nums.length;
    const barW = Math.max(1.5, step * 0.72);
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
        className={className}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          overflow: 'visible',
          ...style,
        }}
      >
        {nums.map((val, idx) => {
          const bh = Math.max(1.5, (Math.abs(val) / baseSpan) * h);
          const x = pad + idx * step + (step - barW) / 2;
          const y = pad + h - bh;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: index is data order
            <rect key={idx} x={x} y={y} width={barW} height={bh} rx={1} style={{ fill: color }} />
          );
        })}
      </svg>
    );
  }

  const pts = nums.map((val, idx) => {
    const x = pad + (nums.length === 1 ? w / 2 : (idx / (nums.length - 1)) * w);
    const y = pad + h - ((val - min) / span) * h;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area =
    pts.length >= 2 && first && last
      ? `M${pts.map((p) => `${p.x},${p.y}`).join(' L')} L${last.x},${pad + h} L${first.x},${pad + h} Z`
      : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        overflow: 'visible',
        ...style,
      }}
    >
      {area && (
        <path
          d={area}
          stroke="none"
          style={{ fill: `color-mix(in srgb, ${color} 18%, transparent)` }}
        />
      )}
      <polyline
        points={poly}
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: color }}
      />
      {showEndDot && last && <circle cx={last.x} cy={last.y} r={2.2} style={{ fill: color }} />}
    </svg>
  );
}

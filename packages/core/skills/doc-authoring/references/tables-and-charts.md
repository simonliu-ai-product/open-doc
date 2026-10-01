# Tables, stats, and charts

Reports are mostly evidence. This file covers the three shapes evidence takes on a page.

## Tables

```tsx
const Th = ({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) => (
  <th
    style={{
      textAlign: align,
      fontFamily: 'var(--od-font-heading)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: 'var(--od-muted)',
      borderBottom: '1px solid var(--od-rule)',
      padding: '0 8px 6px',
    }}
  >
    {children}
  </th>
);

const Td = ({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) => (
  <td
    style={{
      textAlign: align,
      fontSize: 12,
      padding: '7px 8px',
      borderBottom: '1px solid var(--od-rule)',
      fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined,
    }}
  >
    {children}
  </td>
);

<table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
  <thead>
    <tr>
      <Th>Service</Th>
      <Th align="right">Requests</Th>
      <Th align="right">p99</Th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <Td>checkout-api</Td>
      <Td align="right">18,402,111</Td>
      <Td align="right">412 ms</Td>
    </tr>
  </tbody>
</table>
```

Rules:

- `borderCollapse: 'collapse'` + `tableLayout: 'fixed'`, always. Auto layout produces columns that shift when the copy changes.
- Numbers right-aligned with `fontVariantNumeric: 'tabular-nums'`. Text left-aligned. Never center either.
- Horizontal rules only. Vertical borders and zebra striping both add noise that print exaggerates.
- Cell font 11–12px, row padding 6–8px → a row costs ~26–30px. Budget accordingly (`references/pagination.md`).
- Portrait A4 tops out around **7 columns**; past that, either drop columns or transpose the table.
- One unit per column, declared in the header (`p99 (ms)`), not repeated in every cell.
- A caption goes **below** the table at `--od-size-caption`, muted, and must stay on the same page as the table.

### Long tables

Split by row groups across pages. Repeat the full header row and mark the continuation in the caption ("Table 3 (continued)"). Never let a header land on one page and its rows on the next.

## Stat rows

A row of 3–4 headline numbers under a section title. Define one component, instantiate it per stat — do **not** `map` over a data array (an explicit instance per stat keeps each number editable on its own):

```tsx
const Stat = ({ value, label, note }: { value: string; label: string; note?: string }) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontFamily: 'var(--od-font-heading)', fontSize: 30, fontWeight: 650, lineHeight: 1.1 }}>
      {value}
    </div>
    <div style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
    {note && <div style={{ fontSize: 10, color: 'var(--od-muted)', marginTop: 2 }}>{note}</div>}
  </div>
);

<div style={{ display: 'flex', gap: 24, borderTop: '1px solid var(--od-rule)', paddingTop: 14 }}>
  <Stat value="99.94%" label="Availability" note="target 99.9%" />
  <Stat value="412 ms" label="p99 latency" note="−18% QoQ" />
  <Stat value="$41.2k" label="Monthly spend" note="+6% QoQ" />
</div>
```

Every stat needs a comparison (target, prior period) — a number with nothing to compare against tells the reader nothing.

## Charts

For a bar, line or pie chart of data, use **`<Chart>`** — it draws from rows (an imported `.csv`, or an array literal), in the document's accent and tints of it, and numbers as a figure when given a caption:

```tsx
import costs from './data/costs.csv';

<Chart data={costs} x="month" y={['cost', 'budget']} labels={{ cost: '實際', budget: '預算' }}
       format="integer" caption="每月費用與預算" id="f-cost" />
<Chart type="line" data={costs} x="month" y="uptime" format="percent" values caption="可用率" />
<Chart type="pie" data={services} x="service" y="cost" values caption="費用占比" />
```

- `type`: `bar` (default), `line`, `pie`. `y` takes one key or several (one series each); a pie reads the first.
- `stacked` stacks bar series instead of grouping them; `values` prints each value on its bar, point or slice.
- `format`: `number`, `integer`, `percent`, or a function — the same vocabulary as `<DataTable>`.
- `width` / `height` are the drawn size in px (default 560 × 260); it scales down to the column.
- It lays out synchronously into a fixed box, so it paginates like any block. In Word it arrives as a picture.

Anything `<Chart>` doesn't draw — a sparkline in a stat row, an annotated timeline — write as **inline SVG** sized in absolute px:

```tsx
const Bars = () => {
  const data = [
    { label: 'Jan', value: 38 },
    { label: 'Feb', value: 52 },
    { label: 'Mar', value: 47 },
  ];
  const w = 642;
  const h = 180;
  const max = 60;
  const gap = 12;
  const barW = (w - gap * (data.length - 1)) / data.length;

  return (
    <svg width={w} height={h} role="img" aria-label="Monthly incidents">
      <title>Monthly incidents</title>
      {data.map((d, i) => {
        const barH = (d.value / max) * (h - 24);
        return (
          <g key={d.label}>
            <rect x={i * (barW + gap)} y={h - 24 - barH} width={barW} height={barH} fill="var(--od-accent)" rx={2} />
            <text x={i * (barW + gap) + barW / 2} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--od-muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
```

Rules:

- Size the SVG to the text block width (A4 @ 76px margins → 642) so it aligns with the prose.
- Vector only. SVG stays sharp in the PDF; a rasterized chart does not.
- Label directly on the chart — a separate legend forces the reader to look twice. If you must have a legend, put it on one line above the plot.
- Start bar axes at zero. Truncated axes in a report are a credibility problem, not a style choice.
- Two decimals maximum, units in the axis label or the caption.
- `data.map` inside one SVG is fine — the "explicit instance" rule is about repeated *page elements*, not path geometry.
- If the chart needs data the user has to supply, don't fabricate plausible numbers. Use `<ImagePlaceholder hint="Bar chart: monthly incidents, Jan–Sep, from the ops dashboard" height={180} />` and flag it at hand-off.

## Callouts

One box style, used sparingly (at most one or two per page):

```tsx
<div
  style={{
    borderLeft: '3px solid var(--od-accent)',
    background: '#f8fafc',
    padding: '12px 14px',
    borderRadius: 'var(--od-radius)',
    fontSize: 12,
  }}
>
  <strong style={{ display: 'block', marginBottom: 4 }}>Recommendation</strong>
  Move the checkout queue to its own cluster before the November peak.
</div>
```

Reserve callouts for recommendations, risks, and definitions. A page where everything is boxed emphasizes nothing.

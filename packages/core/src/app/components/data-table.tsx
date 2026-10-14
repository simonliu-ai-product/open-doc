import type { CSSProperties, ReactNode } from 'react';
import { LOC_PROP, sourceAttrs } from '../lib/source-loc';
import { useTableSlice } from './flow-page';
import { Figure } from './numbering';

export type DataAlign = 'left' | 'center' | 'right';

export type DataFormat =
  | 'text'
  | 'number'
  | 'integer'
  | 'percent'
  | 'currency'
  | 'delta'
  | ((value: unknown, row: Record<string, unknown>) => ReactNode);

export type DataSummaryOp =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | ((values: number[]) => ReactNode);

export type DataColumn = {
  key: string;
  label?: ReactNode;
  align?: DataAlign;
  format?: DataFormat;
  /** Column width. A number is px; `tableLayout: fixed` means these are honoured. */
  width?: number | string;
  /** Draws a proportional horizontal bar behind numeric cells in this column. */
  dataBar?: boolean;
  /** Aggregation for this column when `summaryRow` is enabled on the table. */
  summary?: DataSummaryOp | ReactNode;
};

export type DataTableProps = {
  /** Rows as parsed from a `.csv`/`.tsv` import, or any array of objects. */
  rows: Array<Record<string, unknown>>;
  /** Columns to print, in order. Derived from the first row when omitted. */
  columns?: Array<DataColumn | string>;
  /** Numbers the table and prints the caption above it. */
  caption?: ReactNode;
  /** Stable id for `<Ref to>`. Only meaningful alongside `caption`. */
  id?: string;
  /** Print at most this many rows, with a note about what was left out. */
  limit?: number;
  /** Tighter rows, for a dense appendix table. */
  compact?: boolean;
  /** Allows `flow()` to split this table across pages and repeat the `<thead>` on each sheet. */
  splittable?: boolean;
  /** Appends a summary footer row. Pass `true` to use column `summary` ops, or a record of values/ops. */
  summaryRow?: boolean | Record<string, DataSummaryOp | ReactNode>;
  /** Label printed in the first column of the summary row when not overridden. Defaults to 'Total'. */
  summaryLabel?: ReactNode;
  /** What an empty cell prints as. Defaults to an em dash. */
  emptyValue?: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Stamped in dev by the loc-tags plugin; see `lib/source-loc.ts`. */
  [LOC_PROP]?: string;
};

function normalizeColumn(column: DataColumn | string): DataColumn {
  return typeof column === 'string' ? { key: column } : column;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A column of numbers aligns right; anything mixed stays left. */
function inferAlign(rows: Array<Record<string, unknown>>, key: string): DataAlign {
  let seen = 0;
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined || value === '') continue;
    if (!isNumber(value)) return 'left';
    seen++;
  }
  return seen > 0 ? 'right' : 'left';
}

function formatValue(
  value: unknown,
  format: DataFormat | undefined,
  row: Record<string, unknown>,
  emptyValue: ReactNode,
): ReactNode {
  if (typeof format === 'function') return format(value, row);
  if (value === null || value === undefined || value === '') return emptyValue;

  if (isNumber(value)) {
    if (format === 'integer') return Math.round(value).toLocaleString();
    if (format === 'percent')
      return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    if (format === 'currency')
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    if (format === 'delta') {
      const sign = value > 0 ? '+' : '';
      const text = `${sign}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      const color = value > 0 ? '#15803d' : value < 0 ? '#b91c1c' : 'var(--od-muted)';
      return <span style={{ color, fontWeight: 500 }}>{text}</span>;
    }
    if (format === 'text') return String(value);
    // Grouping separators are what make a column of figures readable; the
    // fraction digits follow the data rather than padding every integer.
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return String(value);
}

function computeSummary(
  op: DataSummaryOp | ReactNode,
  values: number[],
  format: DataFormat | undefined,
  emptyValue: ReactNode,
): ReactNode {
  if (typeof op === 'function') return op(values);
  if (op === 'sum' || op === 'avg' || op === 'min' || op === 'max' || op === 'count') {
    if (values.length === 0) return emptyValue;
    let num = 0;
    if (op === 'count') num = values.length;
    else if (op === 'sum') num = values.reduce((a, b) => a + b, 0);
    else if (op === 'avg') num = values.reduce((a, b) => a + b, 0) / values.length;
    else if (op === 'min') num = Math.min(...values);
    else if (op === 'max') num = Math.max(...values);
    return formatValue(num, op === 'count' ? 'integer' : format, {}, emptyValue);
  }
  return op;
}

/**
 * A print-shaped table from data, so the numbers in a report come from a file
 * instead of being retyped into JSX. Alignment and grouping follow the column's
 * contents, which is the part people get wrong by hand.
 */
export function DataTable({
  rows,
  columns,
  caption,
  id,
  limit,
  compact = false,
  splittable = false,
  summaryRow,
  summaryLabel = 'Total',
  emptyValue = '—',
  style,
  className,
  [LOC_PROP]: loc,
}: DataTableProps) {
  const slice = useTableSlice();
  const resolved: DataColumn[] = (columns ?? Object.keys(rows[0] ?? {})).map(normalizeColumn);

  const limited = limit !== undefined ? rows.slice(0, limit) : rows;
  const hidden = rows.length - limited.length;

  const isContinued = splittable && slice !== null && slice.rowStart > 0;
  const isLastSlice = !splittable || slice === null || slice.rowEnd >= limited.length;
  const shown =
    splittable && slice !== null ? limited.slice(slice.rowStart, slice.rowEnd) : limited;

  const maxByCol = new Map<string, number>();
  for (const col of resolved) {
    if (!col.dataBar) continue;
    let max = 0;
    for (const row of limited) {
      const v = row[col.key];
      if (isNumber(v) && Math.abs(v) > max) max = Math.abs(v);
    }
    if (max > 0) maxByCol.set(col.key, max);
  }

  const cellPadding = compact ? '4px 8px' : '7px 8px';

  const table = (
    <table
      {...(caption ? {} : sourceAttrs(loc))}
      {...(splittable ? { 'data-od-splittable': '' } : {})}
      className={className}
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        margin: 0,
        ...style,
      }}
    >
      <thead>
        <tr>
          {resolved.map((column, index) => {
            const align = column.align ?? inferAlign(rows, column.key);
            const authored = columns?.[index];
            // Only a label written as a string can be edited where it prints;
            // a bare key would rename the column the data is read from.
            const labelled = typeof authored === 'object' && typeof authored.label === 'string';
            return (
              <th
                key={column.key}
                {...(labelled ? sourceAttrs(loc, `columns.${index}.label`) : {})}
                style={{
                  textAlign: align,
                  width: column.width,
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
                {column.label ?? column.key}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {shown.map((row, rowIndex) => (
          // Rows come from a file and carry no id of their own; their position
          // is what identifies them.
          // biome-ignore lint/suspicious/noArrayIndexKey: row order is the row's identity here
          <tr key={rowIndex}>
            {resolved.map((column) => {
              const align = column.align ?? inferAlign(rows, column.key);
              const val = row[column.key];
              const maxBar = maxByCol.get(column.key);
              const barRatio =
                maxBar && isNumber(val) ? Math.min(1, Math.max(0, Math.abs(val) / maxBar)) : 0;

              return (
                <td
                  key={column.key}
                  style={{
                    textAlign: align,
                    fontSize: compact ? 11 : 12,
                    padding: cellPadding,
                    borderBottom: '1px solid var(--od-rule)',
                    fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined,
                    overflowWrap: 'anywhere',
                    ...(barRatio > 0
                      ? {
                          backgroundImage: `linear-gradient(to right, color-mix(in srgb, var(--od-accent, #2563eb) 14%, transparent) ${(barRatio * 100).toFixed(1)}%, transparent ${(barRatio * 100).toFixed(1)}%)`,
                        }
                      : {}),
                  }}
                >
                  {formatValue(val, column.format, row, emptyValue)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      {isLastSlice && (summaryRow || hidden > 0) && (
        <tfoot>
          {summaryRow && (
            <tr>
              {resolved.map((column, colIndex) => {
                const align = column.align ?? inferAlign(rows, column.key);
                const explicit =
                  typeof summaryRow === 'object' ? summaryRow[column.key] : column.summary;
                let content: ReactNode = null;
                if (explicit !== undefined) {
                  if (explicit === 'count') {
                    const nonNull = limited.filter(
                      (r) =>
                        r[column.key] !== null &&
                        r[column.key] !== undefined &&
                        r[column.key] !== '',
                    ).length;
                    content = formatValue(nonNull, 'integer', {}, emptyValue);
                  } else {
                    const nums = limited.map((r) => r[column.key]).filter(isNumber);
                    content = computeSummary(explicit, nums, column.format, emptyValue);
                  }
                } else if (colIndex === 0) {
                  content = summaryLabel;
                }
                return (
                  <td
                    key={column.key}
                    style={{
                      textAlign: align,
                      fontSize: compact ? 11 : 12,
                      fontWeight: 600,
                      padding: cellPadding,
                      borderTop: '1.5px solid var(--od-text)',
                      borderBottom: '1px solid var(--od-rule)',
                      fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined,
                    }}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          )}
          {hidden > 0 && (
            <tr>
              <td
                colSpan={resolved.length}
                style={{
                  fontSize: 'var(--od-size-caption)',
                  color: 'var(--od-muted)',
                  padding: '6px 8px 0',
                }}
              >
                {hidden} more row{hidden === 1 ? '' : 's'} not shown
              </td>
            </tr>
          )}
        </tfoot>
      )}
    </table>
  );

  if (!caption) return table;

  const effectiveCaption =
    isContinued && typeof caption === 'string' ? `${caption} (cont.)` : caption;

  return (
    <Figure
      kind="table"
      caption={effectiveCaption}
      {...(id !== undefined && !isContinued ? { id } : {})}
      {...(isContinued ? { numbered: false } : {})}
      {...sourceAttrs(loc)}
    >
      {table}
    </Figure>
  );
}

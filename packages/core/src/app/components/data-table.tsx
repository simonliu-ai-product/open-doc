import type { CSSProperties, ReactNode } from 'react';
import { Figure } from './numbering';

export type DataAlign = 'left' | 'center' | 'right';

export type DataFormat =
  | 'text'
  | 'number'
  | 'integer'
  | 'percent'
  | ((value: unknown, row: Record<string, unknown>) => ReactNode);

export type DataColumn = {
  key: string;
  label?: ReactNode;
  align?: DataAlign;
  format?: DataFormat;
  /** Column width. A number is px; `tableLayout: fixed` means these are honoured. */
  width?: number | string;
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
  /** What an empty cell prints as. Defaults to an em dash. */
  emptyValue?: ReactNode;
  style?: CSSProperties;
  className?: string;
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
    if (format === 'text') return String(value);
    // Grouping separators are what make a column of figures readable; the
    // fraction digits follow the data rather than padding every integer.
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return String(value);
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
  emptyValue = '—',
  style,
  className,
}: DataTableProps) {
  const resolved: DataColumn[] = (columns ?? Object.keys(rows[0] ?? {})).map(normalizeColumn);

  const shown = limit !== undefined ? rows.slice(0, limit) : rows;
  const hidden = rows.length - shown.length;

  const cellPadding = compact ? '4px 8px' : '7px 8px';

  const table = (
    <table
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
          {resolved.map((column) => {
            const align = column.align ?? inferAlign(rows, column.key);
            return (
              <th
                key={column.key}
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
                  }}
                >
                  {formatValue(row[column.key], column.format, row, emptyValue)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      {hidden > 0 && (
        <tfoot>
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
        </tfoot>
      )}
    </table>
  );

  if (!caption) return table;

  return (
    <Figure kind="table" caption={caption} {...(id !== undefined ? { id } : {})}>
      {table}
    </Figure>
  );
}

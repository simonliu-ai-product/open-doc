import { Table2 } from 'lucide-react';
import { Fragment } from 'react';
import { useT } from '../../lib/i18n';
import { getRecordState, useRecordCount, useRecordIndex } from '../../lib/records';

/**
 * Where a value printed by `<Field>` comes from: the data file, the row shown,
 * and each column with what it holds for that row — the cell to edit to
 * change it, since the page prints the same source line for every row.
 */
export function FieldSource({ names, file }: { names: string[]; file: string | null }) {
  const t = useT();
  const index = useRecordIndex();
  const count = useRecordCount();
  const row = getRecordState().records[index];
  return (
    <div className="rounded border border-border text-xs">
      <div className="flex min-w-0 items-center gap-1.5 border-border border-b px-2 py-1.5 text-muted-foreground">
        <Table2 aria-hidden className="size-3.5 flex-none" />
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {file ? file.replace(/^\.\//, '') : t('Records')}
        </code>
        {count > 0 && (
          <span className="flex-none font-mono text-[10px] tabular-nums">
            {t('Row {row} of {count}', { row: index + 1, count })}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-2 py-1.5">
        {names.map((name) => (
          <Fragment key={name}>
            <dt className="font-mono text-[11px] text-muted-foreground">{name}</dt>
            <dd className="m-0 truncate">
              {row?.[name] === undefined || row[name] === '' ? '—' : String(row[name])}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

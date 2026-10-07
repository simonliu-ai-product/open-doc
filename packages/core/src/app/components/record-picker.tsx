import { ChevronDown, ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import { useT } from '../lib/i18n';
import {
  type DataRecord,
  recordLabel,
  setRecordIndex,
  useRecordCount,
  useRecordIndex,
} from '../lib/records';

const STEP_CLASS =
  'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60 disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * Which row the document is shown for, when it prints one copy per row. The
 * pages, the thumbnails and the Download menu all follow it.
 */
export function RecordPicker({
  records,
  labelKey,
}: {
  records: DataRecord[];
  /** `meta.recordLabel` — the column that names a row. */
  labelKey?: string;
}) {
  const t = useT();
  const index = useRecordIndex();
  const count = useRecordCount();
  if (count === 0) return null;

  return (
    <fieldset className="m-0 flex min-w-0 flex-none items-center gap-0.5 rounded-md border border-border p-0.5">
      <legend className="sr-only">{t('Record')}</legend>
      <button
        type="button"
        aria-label={t('Previous record')}
        title={t('Previous record')}
        disabled={index === 0}
        onClick={() => setRecordIndex(index - 1)}
        className={STEP_CLASS}
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <label className="relative flex h-7 min-w-0 items-center gap-1.5 rounded px-1.5 transition-colors hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground/60">
        <Table2 aria-hidden className="size-3.5 flex-none text-muted-foreground" />
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {index + 1}/{count}
        </span>
        <span className="max-w-40 truncate text-xs">
          {recordLabel(records[index], index, labelKey)}
        </span>
        <ChevronDown aria-hidden className="size-3 flex-none text-muted-foreground" />
        <select
          aria-label={t('Record')}
          value={index}
          onChange={(event) => setRecordIndex(Number(event.target.value))}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {records.map((record, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <option key={at} value={at}>
              {`${at + 1}. ${recordLabel(record, at, labelKey)}`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label={t('Next record')}
        title={t('Next record')}
        disabled={index >= count - 1}
        onClick={() => setRecordIndex(index + 1)}
        className={STEP_CLASS}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </fieldset>
  );
}

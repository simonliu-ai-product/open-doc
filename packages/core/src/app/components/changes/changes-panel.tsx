import { ChevronDown, ChevronUp, CircleCheck, FileText, GitCompare, Undo2, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useT } from '../../lib/i18n';
import { PanelIconButton, PanelShell } from '../panel/panel-shell';
import type { ChangeItem, ChangesState, Revision } from './use-changes';

/**
 * A source line as a reader sees it: tags and braces off, so the words are
 * what show. A line that is only markup reads as nothing and is left out.
 */
function readable(line: string): string {
  return line
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_LINES = 3;

function Lines({
  lines,
  kind,
  raw = false,
}: {
  lines: string[];
  kind: 'added' | 'removed';
  /** Show the source as written — for a change that is markup only, with no words to show. */
  raw?: boolean;
}) {
  const shown = raw
    ? lines.map((line) => line.trim()).filter(Boolean)
    : lines.map(readable).filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.slice(0, MAX_LINES).map((line, at) => (
        <p
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
          key={at}
          className={`line-clamp-2 break-words text-[11px] leading-snug ${raw ? 'font-mono' : ''} ${
            kind === 'removed' ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
          style={{
            textDecorationColor: kind === 'removed' ? 'var(--change-removed)' : undefined,
          }}
        >
          <span
            aria-hidden
            className="mr-1 font-mono"
            style={{ color: kind === 'removed' ? 'var(--change-removed)' : 'var(--change-added)' }}
          >
            {kind === 'removed' ? '−' : '+'}
          </span>
          {line}
        </p>
      ))}
      {shown.length > MAX_LINES && (
        <span className="pl-3 font-mono text-[10px] text-muted-foreground">
          +{shown.length - MAX_LINES}
        </span>
      )}
    </div>
  );
}

function markColor(item: ChangeItem): string {
  const { hunk } = item;
  if (hunk.newLines === 0) return 'var(--change-removed)';
  if (hunk.oldLines === 0) return 'var(--change-added)';
  return 'var(--change-changed)';
}

function Item({
  item,
  active,
  onSelect,
  onRevert,
}: {
  item: ChangeItem;
  active: boolean;
  onSelect: () => void;
  onRevert: () => Promise<string | null>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markupOnly = [...item.hunk.removed, ...item.hunk.added].every((line) => !readable(line));
  return (
    <li className="group relative">
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onSelect}
        className="flex w-full gap-2 rounded-md py-2 pr-9 pl-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-foreground/60 aria-[current]:bg-accent"
      >
        <span
          aria-hidden
          className="w-0.5 flex-none self-stretch rounded-full"
          style={{ background: markColor(item) }}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Lines lines={item.hunk.removed} kind="removed" raw={markupOnly} />
          <Lines lines={item.hunk.added} kind="added" raw={markupOnly} />
        </span>
      </button>
      {item.file.status !== 'added' && (
        <button
          type="button"
          aria-label={t('Revert this change')}
          title={t('Revert this change')}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(await onRevert());
            setBusy(false);
          }}
          className="absolute top-1.5 right-1 flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/60 disabled:opacity-50"
        >
          <Undo2 className="size-3.5" />
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="px-3 pb-2 text-[11px]"
          style={{ color: 'var(--change-removed)' }}
        >
          {t(error)}
        </p>
      )}
    </li>
  );
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="border-border border-b px-2 py-2 last:border-b-0">
      <h3 className="px-2 pb-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground text-xs">
      {icon}
      {children}
    </div>
  );
}

export type ChangesPanelProps = {
  state: ChangesState;
  items: ChangeItem[];
  placement: Map<string, number[]>;
  since: string;
  revisions: Revision[];
  activeId: string | null;
  onSince: (since: string) => void;
  onSelect: (item: ChangeItem) => void;
  onRevert: (item: ChangeItem) => Promise<string | null>;
  onClose: () => void;
};

/**
 * What changed since a revision, in reading order, each change a way to its
 * place on the page and a way back to how it was. The page carries the marks;
 * this is their index.
 */
export function ChangesPanel({
  state,
  items,
  placement,
  since,
  revisions,
  activeId,
  onSince,
  onSelect,
  onRevert,
  onClose,
}: ChangesPanelProps) {
  const t = useT();
  const result = state.status === 'ready' ? state.result : null;

  const onPage = items
    .filter((item) => (placement.get(item.hunk.id) ?? []).length > 0)
    .sort(
      (a, b) =>
        (placement.get(a.hunk.id)?.[0] ?? 0) - (placement.get(b.hunk.id)?.[0] ?? 0) ||
        a.hunk.newStart - b.hunk.newStart,
    );
  const elsewhere = items.filter((item) => !onPage.includes(item));
  const binary = result?.available ? result.files.filter((file) => file.binary) : [];
  const pages = [...new Set(onPage.map((item) => placement.get(item.hunk.id)?.[0] ?? 0))];

  const at = onPage.findIndex((item) => item.hunk.id === activeId);
  const step = (by: number) => {
    if (onPage.length === 0) return;
    const next = onPage[(at + by + onPage.length) % onPage.length];
    if (next) onSelect(next);
  };

  return (
    <PanelShell
      label={t('Changes')}
      header={
        <>
          <GitCompare aria-hidden className="size-3.5 flex-none text-muted-foreground" />
          <span className="truncate font-medium text-xs">{t('Changes')}</span>
          {items.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
              {items.length}
            </span>
          )}
        </>
      }
      actions={
        <>
          {onPage.length > 1 && (
            <>
              <PanelIconButton label={t('Previous change')} onClick={() => step(-1)}>
                <ChevronUp className="size-3.5" />
              </PanelIconButton>
              <PanelIconButton label={t('Next change')} onClick={() => step(at === -1 ? 0 : 1)}>
                <ChevronDown className="size-3.5" />
              </PanelIconButton>
            </>
          )}
          <PanelIconButton label={t('Close')} onClick={onClose}>
            <X className="size-3.5" />
          </PanelIconButton>
        </>
      }
      banner={
        result?.available !== false && (
          <div className="border-border border-b px-3 py-2">
            <label className="relative flex h-8 items-center rounded border border-border focus-within:border-foreground/40">
              <span className="pl-2 text-[11px] text-muted-foreground">{t('Since')}</span>
              <select
                aria-label={t('Compare with')}
                value={since}
                onChange={(e) => onSince(e.target.value)}
                className="h-8 min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-7 pl-1.5 text-xs outline-none"
              >
                <option value="HEAD">{t('Last commit')}</option>
                {revisions.map((revision) => (
                  <option key={revision.commit} value={revision.commit}>
                    {`${revision.short} · ${revision.subject} · ${revision.when}`}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
              />
            </label>
          </div>
        )
      }
    >
      {state.status === 'loading' ? (
        <div className="m-3 h-0.5 overflow-hidden rounded bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-foreground/20" />
        </div>
      ) : state.status === 'error' ? (
        <Empty icon={<GitCompare className="size-5" />}>{state.error}</Empty>
      ) : !state.result.available ? (
        <Empty icon={<GitCompare className="size-5" />}>
          {state.result.reason === 'no-git' ? (
            t('git is not installed')
          ) : (
            <>
              {t('Not a git repository')}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">git init</code>
            </>
          )}
        </Empty>
      ) : items.length === 0 && binary.length === 0 ? (
        <Empty icon={<CircleCheck className="size-5" />}>{t('No changes')}</Empty>
      ) : (
        <>
          {pages.map((page) => (
            <Group key={page} title={t('Page {page}', { page })}>
              {onPage
                .filter((item) => placement.get(item.hunk.id)?.[0] === page)
                .map((item) => (
                  <Item
                    key={item.hunk.id}
                    item={item}
                    active={item.hunk.id === activeId}
                    onSelect={() => onSelect(item)}
                    onRevert={() => onRevert(item)}
                  />
                ))}
            </Group>
          ))}
          {[...new Set(elsewhere.map((item) => item.file.path))].map((path) => (
            <Group
              key={path}
              title={
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  <FileText aria-hidden className="size-3" />
                  {path}
                </span>
              }
            >
              {elsewhere
                .filter((item) => item.file.path === path)
                .map((item) => (
                  <Item
                    key={item.hunk.id}
                    item={item}
                    active={item.hunk.id === activeId}
                    onSelect={() => onSelect(item)}
                    onRevert={() => onRevert(item)}
                  />
                ))}
            </Group>
          ))}
          {binary.length > 0 && (
            <Group title={t('Files')}>
              {binary.map((file) => (
                <li
                  key={file.path}
                  className="flex items-center gap-2 px-2 py-1.5 font-mono text-[11px] text-muted-foreground"
                >
                  <FileText aria-hidden className="size-3" />
                  {file.path}
                </li>
              ))}
            </Group>
          )}
        </>
      )}
    </PanelShell>
  );
}

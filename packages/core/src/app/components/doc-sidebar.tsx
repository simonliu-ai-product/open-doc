import { useEffect, useMemo, useRef, useState } from 'react';
import type { DesignSystem } from '../lib/design';
import { useT } from '../lib/i18n';
import type { OutlineEntry } from '../lib/outline';
import type { PageGeometry } from '../lib/sdk';
import type { ExpandedPage } from '../lib/use-doc-pages';
import { cn } from '../lib/utils';
import { DocAssets } from './doc-assets';
import { PageFrame } from './page-frame';

const THUMB_WIDTH = 150;

type Tab = 'pages' | 'outline' | 'assets';

type Props = {
  docId: string;
  pages: ExpandedPage[];
  geometry: PageGeometry;
  design?: DesignSystem;
  currentPage: number;
  entries: OutlineEntry[];
  activeId: string | null;
  onSelectPage: (page: number) => void;
  onSelectEntry: (entry: OutlineEntry) => void;
};

export function DocSidebar({
  docId,
  pages,
  geometry,
  design,
  currentPage,
  entries,
  activeId,
  onSelectPage,
  onSelectEntry,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('pages');
  const railRef = useRef<HTMLDivElement>(null);
  // The assets panel talks to the dev API, so it has nothing to show in a
  // static build.
  const tabs = useMemo<Tab[]>(
    () => (import.meta.env.DEV ? ['pages', 'outline', 'assets'] : ['pages', 'outline']),
    [],
  );

  // Follow the reader: keep the active thumbnail in view as the main pane scrolls.
  useEffect(() => {
    if (tab !== 'pages') return;
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>(`[data-thumb-page="${currentPage}"]`);
    if (!rail || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < rail.scrollTop || bottom > rail.scrollTop + rail.clientHeight) {
      rail.scrollTo({ top: top - rail.clientHeight / 3, behavior: 'smooth' });
    }
  }, [currentPage, tab]);

  return (
    <aside className="hidden w-56 flex-none flex-col bg-background md:flex">
      <div className="flex flex-none gap-1 p-2">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-[11px] capitalize transition-colors',
              tab === value
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            {t(value)}
          </button>
        ))}
      </div>

      {tab === 'assets' ? (
        <DocAssets docId={docId} />
      ) : tab === 'pages' ? (
        <div ref={railRef} className="flex-1 overflow-y-auto px-2 pb-6">
          <div className="flex flex-col gap-1">
            {pages.map((entry, index) => {
              const page = index + 1;
              return (
                <button
                  key={entry.key}
                  type="button"
                  data-thumb-page={page}
                  onClick={() => onSelectPage(page)}
                  aria-label={t('Page {page}', { page })}
                  aria-current={page === currentPage ? 'page' : undefined}
                  className={cn(
                    'group flex w-full items-start gap-2 rounded-md p-1.5 transition-colors',
                    page === currentPage ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                >
                  <span
                    className={cn(
                      'w-5 flex-none pt-0.5 text-right font-mono text-[10px] tabular-nums',
                      page === currentPage ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {String(page).padStart(2, '0')}
                  </span>
                  <div
                    className={cn(
                      'overflow-hidden rounded-sm ring-1 transition-shadow',
                      page === currentPage
                        ? 'ring-2 ring-foreground'
                        : 'ring-border group-hover:ring-foreground/40',
                    )}
                    style={{
                      width: THUMB_WIDTH,
                      height: geometry.height * (THUMB_WIDTH / geometry.width),
                    }}
                  >
                    <PageFrame
                      index={index}
                      total={pages.length}
                      geometry={geometry}
                      scale={THUMB_WIDTH / geometry.width}
                      design={design}
                      flat
                    >
                      {entry.content}
                    </PageFrame>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          {entries.length === 0 ? (
            <p className="px-2 py-1 text-muted-foreground text-xs leading-relaxed">
              {t('No headings yet.')}
            </p>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectEntry(entry)}
                className={cn(
                  'flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent',
                  entry.id === activeId
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
                style={{ paddingLeft: 8 + (entry.level - 1) * 12 }}
              >
                <span className="line-clamp-2 flex-1">{entry.text}</span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {entry.page}
                </span>
              </button>
            ))
          )}
        </nav>
      )}
    </aside>
  );
}

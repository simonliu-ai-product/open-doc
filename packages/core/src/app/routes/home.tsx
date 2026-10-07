import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Clock,
  Copy,
  FileText,
  Folder,
  FolderInput,
  Inbox,
  MoreHorizontal,
  Palette,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  CARD_GRID,
  CardText,
  EmptyState,
  PageHeader,
  useCardWidth,
} from '../components/browser/browser-ui';
import { NewDocumentDialog } from '../components/browser/new-document-dialog';
import { PageFrame } from '../components/page-frame';
import { DOC_DND_MIME } from '../components/sidebar/folder-item';
import { ALL_DOCS_ID, DRAFT_ID } from '../components/sidebar/sidebar';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/menu';
import { coverContent } from '../lib/doc-preview';
import { docCreatedAt, docIds, docThemes, docTitles } from '../lib/docs';
import { type Translate, useLocale, useT } from '../lib/i18n';
import { pageLang, resolvePageGeometry } from '../lib/sdk';
import { findTheme } from '../lib/themes';
import { useDocModule } from '../lib/use-doc-module';
import type { HomeOutletContext } from './home-shell';

/** Sheet and date, the two facts that tell documents apart at a glance. */
function cardMeta(
  t: Translate,
  locale: string,
  pageSize: string,
  landscape: boolean,
  createdAt: number | undefined,
): string {
  const sheet = landscape ? t('{size} landscape', { size: pageSize }) : pageSize;
  if (!createdAt) return sheet;
  const date = new Date(createdAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return `${sheet} · ${date}`;
}

const SORTS = [
  { key: 'newest', label: 'Newest', icon: Clock },
  { key: 'oldest', label: 'Oldest', icon: Clock },
  { key: 'az', label: 'A–Z', icon: ArrowDownAZ },
  { key: 'za', label: 'Z–A', icon: ArrowUpAZ },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const SORT_STORAGE = 'open-doc:sort';

function readSort(): SortKey {
  try {
    const stored = localStorage.getItem(SORT_STORAGE);
    return SORTS.some((sort) => sort.key === stored) ? (stored as SortKey) : 'newest';
  } catch {
    return 'newest';
  }
}

const titleOf = (id: string) => docTitles[id] ?? id;

function compare(sort: SortKey) {
  return (a: string, b: string): number => {
    if (sort === 'az') return titleOf(a).localeCompare(titleOf(b));
    if (sort === 'za') return titleOf(b).localeCompare(titleOf(a));
    const at = docCreatedAt[a] ?? 0;
    const bt = docCreatedAt[b] ?? 0;
    if (at !== bt) return sort === 'newest' ? bt - at : at - bt;
    return a.localeCompare(b);
  };
}

export function Home() {
  const t = useT();
  const ctx = useOutletContext<HomeOutletContext>();
  const [error, setError] = useState<string | null>(null);
  const [sort, setSortState] = useState<SortKey>(readSort);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const inFolder =
    ctx.selectedId !== ALL_DOCS_ID && ctx.selectedId !== DRAFT_ID ? ctx.selectedId : null;
  const newButton = import.meta.env.DEV && (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-primary-foreground text-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/60"
    >
      <Plus className="size-3.5" />
      {t('New document')}
    </button>
  );

  const setSort = (next: SortKey) => {
    setSortState(next);
    try {
      localStorage.setItem(SORT_STORAGE, next);
    } catch {}
  };

  const folder = ctx.manifest.folders.find((f) => f.id === ctx.selectedId);
  const sourceIds =
    ctx.selectedId === ALL_DOCS_ID
      ? docIds
      : ctx.selectedId === DRAFT_ID
        ? ctx.draftDocs
        : (ctx.docsByFolder[ctx.selectedId] ?? []);
  const visibleIds = useMemo(() => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sourceIds
      .filter((id) => {
        const haystack = `${titleOf(id)} ${id}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .sort(compare(sort));
  }, [sourceIds, filter, sort]);
  const currentSort = SORTS.find((entry) => entry.key === sort) ?? SORTS[0];

  const heading =
    ctx.selectedId === ALL_DOCS_ID
      ? t('Documents')
      : ctx.selectedId === DRAFT_ID
        ? t('Unfiled')
        : (folder?.name ?? t('Documents'));

  return (
    <div>
      <PageHeader
        title={heading}
        icon={
          ctx.selectedId === ALL_DOCS_ID ? FileText : ctx.selectedId === DRAFT_ID ? Inbox : Folder
        }
        count={sourceIds.length}
        actions={
          sourceIds.length > 0 ? (
            <>
              <Menu
                placement="bottom-end"
                trigger={(props) => (
                  <button
                    type="button"
                    aria-label={t('Sort: {label}', { label: t(currentSort.label) })}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-accent aria-expanded:bg-accent"
                    {...props}
                  >
                    <currentSort.icon className="size-3.5 text-muted-foreground" />
                    {t(currentSort.label)}
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </button>
                )}
              >
                {(close) =>
                  SORTS.map((entry) => (
                    <MenuItem
                      key={entry.key}
                      active={entry.key === sort}
                      onClick={() => {
                        setSort(entry.key);
                        close();
                      }}
                    >
                      <entry.icon className="size-3.5" />
                      <span className="flex-1">{t(entry.label)}</span>
                      {entry.key === sort && <Check className="size-3.5" />}
                    </MenuItem>
                  ))
                }
              </Menu>
              <label className="flex h-8 w-56 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs focus-within:border-foreground focus-within:ring-2 focus-within:ring-primary/30">
                <Search className="size-3.5 flex-none text-muted-foreground" />
                <input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('Filter documents')}
                  aria-label={t('Filter documents')}
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                />
              </label>
              {newButton}
            </>
          ) : (
            newButton
          )
        }
      >
        {error && (
          <p
            role="alert"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs"
          >
            {error}
          </p>
        )}
      </PageHeader>

      {visibleIds.length === 0 && sourceIds.length > 0 ? (
        <EmptyState icon={Search} title={t('Nothing matches “{query}”', { query: filter.trim() })}>
          {t('Try another word from the title.')}
        </EmptyState>
      ) : visibleIds.length === 0 ? (
        <EmptyState icon={FileText} title={t('Nothing here yet')}>
          {ctx.selectedId === ALL_DOCS_ID
            ? t('Ask your agent to write a document, and it appears here.')
            : t('Drag a document onto this folder, or use Move to on its card.')}
          {newButton && <div className="mt-4 flex justify-center">{newButton}</div>}
        </EmptyState>
      ) : (
        <div className={CARD_GRID}>
          {visibleIds.map((id) => (
            <DocCard key={id} docId={id} ctx={ctx} onError={setError} />
          ))}
        </div>
      )}
      {import.meta.env.DEV && (
        <NewDocumentDialog open={creating} folderId={inFolder} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function DocCard({
  docId,
  ctx,
  onError,
}: {
  docId: string;
  ctx: HomeOutletContext;
  onError: (message: string | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [cardRef, cardWidth] = useCardWidth<HTMLDivElement>();
  const state = useDocModule(docId);
  const doc = state.doc;
  const geometry = resolvePageGeometry(doc?.meta);
  const scale = cardWidth / geometry.width;
  const cover = coverContent(doc);
  const theme = findTheme(docThemes[docId]);
  const title = doc?.meta?.title ?? docId;
  const currentFolder = ctx.manifest.assignments[docId];

  const run = async (action: () => Promise<unknown>) => {
    onError(null);
    try {
      await action();
    } catch (err) {
      onError(String((err as Error).message));
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dragging files a document — the card menu's "Move to" is the keyboard path
    <div
      ref={cardRef}
      className="group flex min-w-0 flex-col gap-2.5"
      draggable={import.meta.env.DEV}
      onDragStart={(e) => {
        if (!import.meta.env.DEV) return;
        e.dataTransfer.setData(DOC_DND_MIME, docId);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <Link to={`/d/${docId}`}>
        <div
          className="overflow-hidden rounded-md ring-1 ring-border transition-shadow group-hover:shadow-lg"
          style={{ width: cardWidth, height: geometry.height * scale }}
        >
          {cover ? (
            <PageFrame
              index={0}
              total={doc?.default?.length ?? 1}
              geometry={geometry}
              scale={scale}
              design={doc?.design}
              lang={pageLang(doc?.meta)}
              flat
            >
              {cover}
            </PageFrame>
          ) : (
            <div className="size-full bg-muted" />
          )}
        </div>
      </Link>

      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          <CardText
            title={
              <Link to={`/d/${docId}`} className="hover:underline">
                {title}
              </Link>
            }
            meta={cardMeta(
              t,
              locale,
              doc?.meta?.pageSize ?? 'A4',
              doc?.meta?.orientation === 'landscape',
              docCreatedAt[docId],
            )}
          />
          {theme && (
            <Link
              to={`/themes/${theme.id}`}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Palette className="size-2.5" />
              {theme.name}
            </Link>
          )}
        </div>

        {import.meta.env.DEV && (
          <Menu
            trigger={(props) => (
              <button
                type="button"
                aria-label={t('{name} options', { name: title })}
                className="flex size-7 flex-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
                {...props}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    const next = window.prompt(t('Document title'), title);
                    if (next && next !== title) void run(() => ctx.renameDoc(docId, next));
                  }}
                >
                  <PencilLine className="size-3.5" />
                  {t('Rename')}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    void run(async () => {
                      const newId = await ctx.duplicateDoc(docId);
                      navigate(`/d/${newId}`);
                    });
                  }}
                >
                  <Copy className="size-3.5" />
                  {t('Duplicate')}
                </MenuItem>

                <MenuSeparator />
                <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t('Move to')}
                </p>
                <MenuItem
                  active={!currentFolder}
                  onClick={() => {
                    close();
                    void run(() => ctx.assign(docId, null));
                  }}
                >
                  <FolderInput className="size-3.5" />
                  {t('Unfiled')}
                </MenuItem>
                {ctx.manifest.folders.map((folder) => (
                  <MenuItem
                    key={folder.id}
                    active={currentFolder === folder.id}
                    onClick={() => {
                      close();
                      void run(() => ctx.assign(docId, folder.id));
                    }}
                  >
                    <FolderInput className="size-3.5" />
                    {folder.name}
                  </MenuItem>
                ))}

                <MenuSeparator />
                <MenuItem
                  destructive
                  onClick={() => {
                    close();
                    if (
                      !window.confirm(
                        t('Delete "{title}"? This removes docs/{id}/ from disk.', {
                          title,
                          id: docId,
                        }),
                      )
                    )
                      return;
                    void run(() => ctx.deleteDoc(docId));
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t('Delete document')}
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
    </div>
  );
}

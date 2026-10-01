import appConfig from 'virtual:open-doc/config';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileCode2,
  FileImage,
  FileText,
  FileType2,
  Image,
  LayoutGrid,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Palette,
  Pencil,
  Plus,
  Rows3,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DesignPanel } from '../components/design-panel/design-panel';
import { DesignProvider } from '../components/design-panel/design-provider';
import { DocSearch } from '../components/doc-search';
import { DocSidebar } from '../components/doc-sidebar';
import { HistoryProvider } from '../components/history-provider';
import { Inspector, type InspectorControls } from '../components/inspector/inspector';
import { PageFrame } from '../components/page-frame';
import { EditSaveCard } from '../components/panel/edit-save-card';
import { ThemeToggle } from '../components/theme-toggle';
import { Menu, MenuItem } from '../components/ui/menu';
import { useAgentBridge } from '../lib/agent-bridge';
import { exportDocAsDocx } from '../lib/export-docx';
import { exportDocAsHtml } from '../lib/export-html';
import { exportDocAsImages } from '../lib/export-image';
import { exportDocAsPdf } from '../lib/export-pdf';
import { type OutlineEntry, useDocOutline } from '../lib/outline';
import {
  describeSelection,
  formatPages,
  type PageSelection,
  resolveSelection,
} from '../lib/page-range';
import { nextFrame, waitForFonts } from '../lib/print-ready';
import { scanDocument } from '../lib/scan';
import { resolvePageGeometry } from '../lib/sdk';
import { useDocModule } from '../lib/use-doc-module';
import { useDocPages } from '../lib/use-doc-pages';
import { cn } from '../lib/utils';
import {
  fitWidthScale as fitScale,
  pageAtMarker,
  readViewMode,
  type ViewMode,
  writeViewMode,
} from '../lib/view-mode';

type DownloadFormat = 'pdf' | 'html' | 'png' | 'svg' | 'docx';

const DOWNLOAD_LABEL: Record<DownloadFormat, string> = {
  pdf: 'PDF',
  html: 'HTML',
  png: 'PNG',
  svg: 'SVG',
  docx: 'Word',
};

/**
 * Grouped by what the file is for rather than listed by type: the reader is
 * choosing between "send it", "edit it" and "drop it in a slide", and the
 * extension on the right says what lands in their downloads folder.
 */
const DOWNLOAD_GROUPS = [
  {
    label: 'Print & share',
    formats: [
      {
        format: 'pdf' as const,
        label: 'PDF',
        hint: 'True page size, print-ready',
        ext: '.pdf',
        icon: FileText,
      },
      {
        format: 'html' as const,
        label: 'HTML',
        hint: 'One self-contained file',
        ext: '.html',
        icon: FileCode2,
      },
    ],
  },
  {
    label: 'Edit',
    formats: [
      {
        format: 'docx' as const,
        label: 'Word',
        hint: 'Editable; Word lays out the pages',
        ext: '.docx',
        icon: FileType2,
      },
    ],
  },
  {
    label: 'Images',
    formats: [
      {
        format: 'png' as const,
        label: 'PNG',
        hint: 'Pixels at 2×, for slides and chat',
        ext: '.png',
        icon: Image,
      },
      {
        format: 'svg' as const,
        label: 'SVG',
        hint: 'Vector, text stays text',
        ext: '.svg',
        icon: FileImage,
      },
    ],
  },
];

const GUTTER = 48;
/** Breathing room left above a heading the outline jumped to. */
const HEADING_TOP_INSET = 28;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const PAGE_GAP = 24;

const BACK_CLASS =
  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

/**
 * `config.home` leaves the router on purpose. A `<Link>` resolves inside the
 * app's basename, which is exactly wrong when the viewer is mounted under a
 * larger site and "back" means that site.
 *
 * With no `home` and no document browser there is nowhere to go: `/` renders
 * "not found". A control that leads nowhere is worse than no control, and a
 * host that mounts the viewer this way is providing its own way back.
 */
const HeaderBackLink = () => {
  if (appConfig.home !== undefined) {
    return (
      <a href={appConfig.home} className={BACK_CLASS} aria-label="Back to workspace">
        <ArrowLeft className="size-4" />
      </a>
    );
  }
  if (!appConfig.build.showDocBrowser) return null;
  return (
    <Link to="/" className={BACK_CLASS} aria-label="Back to documents">
      <ArrowLeft className="size-4" />
    </Link>
  );
};

const EDITING_KEY = 'open-doc:editing';

function readEditing(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(EDITING_KEY) === '1';
  } catch {
    return false;
  }
}

export function Doc() {
  const { docId } = useParams<{ docId: string }>();
  const state = useDocModule(docId);
  const doc = state.doc;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const [zoomMode, setZoomMode] = useState<'auto' | 'fit-width' | 'fit-page'>('auto');
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [download, setDownload] = useState<{ format: DownloadFormat; percent: number } | null>(
    null,
  );
  const [downloaded, setDownloaded] = useState<DownloadFormat | null>(null);
  const [selection, setSelection] = useState<PageSelection>({ kind: 'all' });
  const [customRange, setCustomRange] = useState('');
  const [designOpen, setDesignOpen] = useState(false);
  const [editing, setEditingState] = useState(readEditing);
  // The dev server reloads every open viewer when a document is added or
  // removed anywhere in the workspace. Edit mode is per tab and survives that.
  const setEditing = useCallback((next: boolean) => {
    setEditingState(next);
    try {
      if (next) sessionStorage.setItem(EDITING_KEY, '1');
      else sessionStorage.removeItem(EDITING_KEY);
    } catch {}
  }, []);
  const leaveEditRef = useRef<(() => void) | null>(null);
  const editControlsRef = useRef<InspectorControls | null>(null);
  const [textPending, setTextPending] = useState(0);
  const [cardShown, setCardShown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readViewMode(docId));
  // The page the reader was on when the layout changed, to put back in view.
  const keepPageRef = useRef<number | null>(null);
  // The page last jumped to, reported while it shares the row in view.
  const jumpedRef = useRef<number | null>(null);

  const geometry = useMemo(() => resolvePageGeometry(doc?.meta), [doc?.meta]);
  const { pages, measuring, overflowing } = useDocPages(doc, geometry);
  const outline = useDocOutline();

  useAgentBridge({ docId: docId ?? '', doc, pages, geometry, measuring, oversized: overflowing });

  const clamp = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
  // Every fit is of the unit the mode lays side by side — a sheet, a spread,
  // a row of the grid — so zoom and view mode compose instead of fighting.
  const widthFit = fitScale(viewMode, available.width, geometry.width, PAGE_GAP);
  const fitWidthScale = available.width ? clamp(widthFit) : 1;
  // Fit page is bounded by both axes so the whole unit lands inside the pane.
  const fitPageScale = available.height
    ? clamp(Math.min(widthFit, available.height / geometry.height))
    : 1;
  // Auto keeps a page at its true size unless the window is too narrow to hold
  // it; the explicit fit modes may go past 100%.
  const scale =
    manualScale ??
    (zoomMode === 'fit-width'
      ? fitWidthScale
      : zoomMode === 'fit-page'
        ? fitPageScale
        : Math.min(1, fitWidthScale));

  // biome-ignore lint/correctness/useExhaustiveDependencies: state.status re-runs this once the scroll container mounts — during loading the ref is null and nothing measures.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth - GUTTER * 2;
      const height = el.clientHeight - GUTTER * 2;
      if (width > 0 && height > 0) setAvailable({ width, height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [geometry.width, geometry.height, state.status]);

  // Headings only exist once the pages are in the DOM at their final metrics,
  // so the scan waits for fonts — a late-loading face reflows headings and
  // would otherwise strand the outline on stale text.
  useEffect(() => {
    if (state.status !== 'ready' || measuring) return;
    let cancelled = false;
    (async () => {
      await nextFrame();
      await waitForFonts();
      await nextFrame();
      const root = pagesRef.current;
      if (cancelled || !root) return;
      scanDocument(root, doc?.meta);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, doc, measuring]);

  // A full-size page is taller than the viewport, so intersection ratios never
  // cross a useful threshold. Track the page that owns the top third of the
  // viewport instead — that's the sheet the reader is on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: zooming changes every page's offsetTop, so `scale` forces a re-measure of which page owns the marker.
  useEffect(() => {
    const root = scrollRef.current;
    const container = pagesRef.current;
    if (!root || !container || pages.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = root.scrollTop + root.clientHeight / 3;
      const frames = Array.from(container.children) as HTMLElement[];
      setCurrentPage(
        pageAtMarker(
          frames.map((el) => el.offsetTop),
          marker,
          jumpedRef.current,
        ),
      );
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pages.length, scale, viewMode]);

  useEffect(() => setViewModeState(readViewMode(docId)), [docId]);

  const setViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    keepPageRef.current = currentPage;
    setViewModeState(mode);
    writeViewMode(docId, mode);
  };

  // Changing the layout moves every sheet. Without this the reader lands on
  // whatever page now sits where their scroll position happens to be.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per layout change, after the sheets have moved.
  useLayoutEffect(() => {
    const page = keepPageRef.current;
    keepPageRef.current = null;
    const root = scrollRef.current;
    const frame = pagesRef.current?.children[page === null ? -1 : page - 1] as
      | HTMLElement
      | undefined;
    if (!root || !frame) return;
    // Keep the gutter above the sheet, as a fresh document opens with, rather
    // than butting its top edge against the toolbar.
    root.scrollTop = Math.max(0, frame.offsetTop - GUTTER);
  }, [viewMode]);

  const scrollToPage = useCallback((page: number) => {
    jumpedRef.current = page;
    const frame = pagesRef.current?.children[page - 1];
    frame?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Land the heading near the top of the reading pane, not centred — the reader
  // wants what follows the heading, and centring buries half of it.
  const scrollToEntry = useCallback((entry: OutlineEntry) => {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`);
    if (root && target) {
      const offset = target.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top: root.scrollTop + offset - HEADING_TOP_INSET, behavior: 'smooth' });
      return;
    }
    const frame = pagesRef.current?.children[entry.page - 1];
    frame?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const activeOutlineId = useMemo(() => {
    const onPage = outline.filter((entry) => entry.page === currentPage);
    return onPage[0]?.id ?? null;
  }, [outline, currentPage]);

  const runDownload = async (format: DownloadFormat) => {
    if (!doc || !docId || download) return;

    /*
     * The pages are chosen here, once, and every exporter is handed the subset
     * rather than the whole document plus a range to obey. An exporter that has
     * to remember to filter is an exporter that will one day forget.
     */
    const wanted = resolveSelection(
      selection.kind === 'custom' ? { kind: 'custom', text: customRange } : selection,
      pages.length,
      currentPage,
    );
    if (!wanted) return;
    const chosen = wanted.map((index) => pages[index]).filter((page) => page !== undefined);
    if (chosen.length === 0) return;

    setDownload({ format, percent: 0 });
    try {
      if (format === 'pdf') {
        await exportDocAsPdf(doc, docId, chosen, (progress) =>
          setDownload({ format, percent: progress.percent }),
        );
      } else if (format === 'html') {
        await exportDocAsHtml(doc, docId, chosen);
      } else if (format === 'docx') {
        await exportDocAsDocx(doc, docId, chosen);
      } else {
        await exportDocAsImages(doc, docId, chosen, format, (progress) =>
          setDownload({ format, percent: progress.percent }),
        );
      }
      setDownloaded(format);
      setTimeout(() => setDownloaded(null), 2000);
    } finally {
      setDownload(null);
    }
  };

  /* What the menu is about to do, so nobody has to count commas themselves. */
  const chosenPages = describeSelection(
    selection.kind === 'custom' ? { kind: 'custom', text: customRange } : selection,
    pages.length,
    currentPage,
  );

  const zoom = (delta: number) => {
    setManualScale((prev) =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(((prev ?? scale) + delta).toFixed(2)))),
    );
  };

  const fitTo = (mode: 'fit-width' | 'fit-page') => {
    setManualScale(null);
    setZoomMode(mode);
  };

  const setZoom = (value: number) => {
    setZoomMode('auto');
    setManualScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2)))));
  };

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Tell the dev server where the reader is, so an agent can resolve "this
  // page" from node_modules/.open-doc/current.json. See vite/current-plugin.ts.
  useEffect(() => {
    if (!import.meta.hot) return;
    if (!docId || !doc || pages.length === 0) return;
    import.meta.hot.send('open-doc:current', {
      docId,
      pageIndex: currentPage - 1,
      totalPages: pages.length,
      docTitle: doc.meta?.title ?? docId,
    });
  }, [docId, doc, currentPage, pages.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (import.meta.env.DEV && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setDesignOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);

  if (state.status === 'error') {
    return (
      <Centered>
        <p className="font-medium text-sm">Could not load “{docId}”.</p>
        <p className="mt-1 text-muted-foreground text-xs">{state.error.message}</p>
        <BackLink />
      </Centered>
    );
  }

  if (state.status === 'loading' || !doc) {
    return (
      <Centered>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  const view = (
    <div ref={rootRef} className="flex h-screen flex-col bg-background text-foreground">
      {/* Equal `1fr` rails put the title at the true centre of the bar rather
          than the centre of what is left over, which is where a flex row would
          drop it — the control cluster is many times wider than the back link.
          The control rail keeps its automatic minimum — no `min-w-0` — so when
          it outgrows its share the title truncates and slides instead of being
          overlapped by it. */}
      {/* Three rails by job: where you are (back, title), how you are looking
          (page, zoom, layout, fullscreen), and what you do to the document
          (search, edit, design, download). The middle rail is `auto` between
          two equal `1fr` rails, so it sits at the true centre of the bar while
          the title truncates before anything is overlapped. */}
      <header className="grid h-12 flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-1">
          <HeaderBackLink />
          <h1 className="truncate font-medium text-sm">{doc.meta?.title ?? docId}</h1>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <PageJump page={currentPage} total={pages.length} onJump={scrollToPage} />
          <Divider />
          <ZoomControl
            scale={scale}
            fit={manualScale === null ? zoomMode : null}
            onStep={zoom}
            onSet={setZoom}
            onFit={fitTo}
          />
          <Divider />
          <fieldset className="flex items-center gap-0.5">
            <legend className="sr-only">Page layout</legend>
            <IconButton
              label="Continuous"
              active={viewMode === 'continuous'}
              onClick={() => setViewMode('continuous')}
            >
              <Rows3 className="size-3.5" />
            </IconButton>
            <IconButton
              label="Two-up"
              active={viewMode === 'spread'}
              onClick={() => setViewMode('spread')}
            >
              <BookOpen className="size-3.5" />
            </IconButton>
            <IconButton
              label="Grid"
              active={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="size-3.5" />
            </IconButton>
          </fieldset>
          <IconButton
            label={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          </IconButton>
        </div>

        <div className="flex items-center justify-end gap-2">
          <DocSearch scrollRef={scrollRef} pagesRef={pagesRef} onFoundPage={setCurrentPage} />

          {import.meta.env.DEV && (
            // Same two modes as open-slide: reading the document, or editing it
            // where it is printed. Leaving edit mode saves unsaved text first.
            <fieldset className="flex items-center gap-0.5 rounded-md border border-border px-1 py-0.5">
              <legend className="sr-only">Mode</legend>
              <IconButton
                label="Preview"
                active={!editing}
                onClick={() => (leaveEditRef.current ? leaveEditRef.current() : setEditing(false))}
              >
                <Eye className="size-3.5" />
              </IconButton>
              <IconButton label="Edit" active={editing} onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
              </IconButton>
            </fieldset>
          )}
          {import.meta.env.DEV && (
            <button
              type="button"
              aria-pressed={designOpen}
              aria-label="Design"
              aria-keyshortcuts="D"
              title="Design tokens (D)"
              onClick={() => setDesignOpen((open) => !open)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent',
                designOpen && 'bg-accent',
              )}
            >
              <Palette className="size-3.5" />
              Design
              <kbd
                aria-hidden
                className="hidden rounded-sm bg-foreground/10 px-1 font-mono text-[9.5px] text-muted-foreground md:inline"
              >
                D
              </kbd>
            </button>
          )}

          {/* The document browser normally carries this. A viewer mounted with
            `showDocBrowser: false` never shows that shell, and without it a
            reader has no way to change the theme at all. */}
          {!appConfig.build.showDocBrowser && <ThemeToggle />}

          <Menu
            className="w-[300px] p-1.5"
            trigger={(props) => (
              <button
                type="button"
                disabled={download !== null}
                className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground text-xs transition-opacity hover:opacity-90 disabled:opacity-70 aria-expanded:opacity-90"
                {...props}
              >
                {download ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : downloaded ? (
                  <Check className="size-3.5" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {download
                  ? `${DOWNLOAD_LABEL[download.format]} ${Math.round(download.percent)}%`
                  : 'Download'}
              </button>
            )}
          >
            {(close) => (
              <>
                {/* Which pages, before which format. A reader who picks PDF and
                    then discovers they exported forty pages has already waited
                    for all forty. */}
                <PageChoice
                  selection={selection}
                  custom={customRange}
                  currentPage={currentPage}
                  total={pages.length}
                  onSelection={setSelection}
                  onCustom={setCustomRange}
                />
                {DOWNLOAD_GROUPS.map((group) => (
                  <fieldset key={group.label}>
                    <legend className={MENU_LABEL}>{group.label}</legend>
                    {group.formats.map(({ format, label, hint, ext, icon: Icon }) => (
                      <MenuItem
                        key={format}
                        disabled={!chosenPages.valid}
                        onClick={() => {
                          close();
                          void runDownload(format);
                        }}
                      >
                        <Icon className="size-4 flex-none text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{label}</span>
                          <span className="block truncate text-[10.5px] text-muted-foreground">
                            {hint}
                          </span>
                        </span>
                        <span className="flex-none font-mono text-[10px] text-muted-foreground">
                          {ext}
                        </span>
                      </MenuItem>
                    ))}
                  </fieldset>
                ))}
              </>
            )}
          </Menu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <DocSidebar
          docId={docId ?? ''}
          pages={pages}
          geometry={geometry}
          design={doc.design}
          currentPage={currentPage}
          entries={outline}
          activeId={activeOutlineId}
          onSelectPage={scrollToPage}
          onSelectEntry={scrollToEntry}
        />
        <div className="relative flex min-w-0 flex-1">
          <div
            ref={scrollRef}
            data-od-viewer
            className="relative min-w-0 flex-1 overflow-auto bg-canvas"
          >
            <div
              ref={pagesRef}
              data-od-view={viewMode}
              className={cn(
                viewMode === 'continuous' && 'flex flex-col items-center',
                // Facing pages as a bound document is read: page 1 alone on
                // the right, then 2–3, 4–5.
                viewMode === 'spread' && 'grid justify-center [&>:first-child]:col-start-2',
                // A contact sheet: columns that line up, the last row starting
                // under the first sheet rather than centred in the gap.
                viewMode === 'grid' && 'grid content-start justify-center',
              )}
              style={{
                gap: PAGE_GAP,
                padding: `${GUTTER}px ${GUTTER}px ${GUTTER * 1.5}px`,
                ...(viewMode === 'spread'
                  ? { gridTemplateColumns: `repeat(2, ${geometry.width * scale}px)` }
                  : viewMode === 'grid'
                    ? { gridTemplateColumns: `repeat(auto-fill, ${geometry.width * scale}px)` }
                    : {}),
              }}
            >
              {pages.map((page, index) => (
                <PageFrame
                  key={page.key}
                  index={index}
                  total={pages.length}
                  geometry={geometry}
                  scale={scale}
                  design={doc.design}
                >
                  {page.content}
                </PageFrame>
              ))}
            </div>
          </div>
          {import.meta.env.DEV && docId && (
            <EditSaveCard
              textCount={textPending}
              controlsRef={editControlsRef}
              onShownChange={setCardShown}
            />
          )}
        </div>
        {editing && docId && (
          // Keyed by document: a selection, or an editor carried across a
          // reload by source location, must never follow into another
          // document where the same line:column is something else entirely.
          <Inspector
            key={docId}
            docId={docId}
            containerRef={scrollRef}
            panelHidden={designOpen}
            quiet={cardShown}
            onExit={() => setEditing(false)}
            exitRef={leaveEditRef}
            controlsRef={editControlsRef}
            onPendingChange={setTextPending}
          />
        )}
        {designOpen && <DesignPanel onClose={() => setDesignOpen(false)} />}
      </div>
    </div>
  );

  // The design panel writes back to source through the dev server, so it only
  // exists while `open-doc dev` is running. The history is per document: an
  // undo step from one must never replay onto another.
  if (!import.meta.env.DEV || !docId) return view;
  return (
    <HistoryProvider key={docId}>
      <DesignProvider docId={docId}>{view}</DesignProvider>
    </HistoryProvider>
  );
}

/**
 * 全部／此頁／自訂 —— 和列印對話框問的是同一件事，因為那是使用者已經會的問法。
 *
 * 自訂欄位只在被選中時出現。三個選項配一個永遠佔著位置的空欄位，會讓人以為那是
 * 必填的。
 */
const MENU_LABEL = 'px-2 pt-2 pb-1 text-[10px] text-muted-foreground uppercase tracking-wide';

function PageChoice({
  selection,
  custom,
  currentPage,
  total,
  onSelection,
  onCustom,
}: {
  selection: PageSelection;
  custom: string;
  currentPage: number;
  total: number;
  onSelection: (selection: PageSelection) => void;
  onCustom: (text: string) => void;
}) {
  const rangeRef = useRef<HTMLInputElement>(null);
  const options = [
    { kind: 'all' as const, label: 'All', count: total },
    { kind: 'current' as const, label: 'This page', count: currentPage },
    { kind: 'custom' as const, label: 'Range', count: null },
  ];
  const current =
    selection.kind === 'custom' ? { kind: 'custom' as const, text: custom } : selection;
  const pages = resolveSelection(current, total, currentPage);

  // Choosing a range is choosing to type one.
  useEffect(() => {
    if (selection.kind === 'custom') rangeRef.current?.focus();
  }, [selection.kind]);

  const summary =
    pages === null
      ? selection.kind === 'custom' && custom.trim() !== ''
        ? `No such pages — this document has ${total}`
        : `Type pages, like 1-3, 6`
      : selection.kind === 'all'
        ? `All ${total} page${total === 1 ? '' : 's'}`
        : `Page${pages.length === 1 ? '' : 's'} ${formatPages(pages)} · ${pages.length} page${pages.length === 1 ? '' : 's'}`;

  return (
    <fieldset className="border-border border-b pb-2">
      <legend className={MENU_LABEL}>Pages</legend>
      {/* One row of equal segments; labels never wrap, so a two-word option
          doesn't stand taller than its neighbours. */}
      <div
        role="radiogroup"
        aria-label="Pages to download"
        className="mx-1 grid grid-cols-3 gap-0.5 rounded-md bg-muted p-0.5"
      >
        {options.map((option) => {
          const active = selection.kind === option.kind;
          return (
            <button
              key={option.kind}
              type="button"
              aria-pressed={active}
              onClick={(event) => {
                event.stopPropagation();
                onSelection(
                  option.kind === 'custom'
                    ? { kind: 'custom', text: custom }
                    : { kind: option.kind },
                );
              }}
              className={cn(
                'flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground',
                active && 'bg-background text-foreground shadow-sm',
              )}
            >
              {option.label}
              {option.count !== null && (
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selection.kind === 'custom' && (
        <input
          ref={rangeRef}
          value={custom}
          onChange={(event) => onCustom(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="1-3, 6"
          aria-label="Page range"
          aria-invalid={pages === null && custom.trim() !== ''}
          aria-describedby="od-download-pages"
          className="mx-1 mt-1.5 h-7 w-[calc(100%-0.5rem)] rounded border border-border bg-background px-2 font-mono text-[11px] outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30 aria-invalid:border-foreground/60"
        />
      )}
      <p
        id="od-download-pages"
        aria-live="polite"
        className="px-2 pt-1.5 text-[10.5px] text-muted-foreground"
      >
        {summary}
      </p>
    </fieldset>
  );
}

/**
 * 頁碼既是顯示也是輸入。
 *
 * 只在編輯時才變成受控欄位：一直受控的話，讀者捲動時每一次頁碼更新都會把游標推
 * 回去，打到一半的數字就消失了。
 */
function PageJump({
  page,
  total,
  onJump,
}: {
  page: number;
  total: number;
  onJump: (page: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const wanted = Number(raw.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)));
    setDraft(null);
    if (!Number.isFinite(wanted) || wanted < 1) return;
    onJump(Math.min(total, Math.round(wanted)));
  };

  return (
    <span className="flex items-center whitespace-nowrap font-mono text-muted-foreground text-xs tabular-nums">
      {/* A bordered field, not bare digits: a number that looks like a label
          reads as one, and nobody thinks to type into it. */}
      <input
        value={draft ?? String(page)}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setDraft(String(page));
          event.target.select();
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        aria-label={`Page number, ${total} pages`}
        title="Go to page"
        inputMode="numeric"
        className={FIELD_CLASS}
        style={{ width: `${Math.max(2, String(total).length) + 2}ch` }}
      />
      <span className="px-1">/</span>
      <span>{total}</span>
    </span>
  );
}

const FIELD_CLASS =
  'h-6 rounded border border-border bg-background px-1 text-center text-foreground outline-none transition-colors hover:border-muted-foreground/50 focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30';

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

/**
 * The zoom as a field you can type into, with the fits and common sizes one
 * menu away. It replaces a read-only percentage beside three icon buttons —
 * fit width, fit page, and actual size — the last of which did exactly what
 * clicking the percentage already did.
 */
function ZoomControl({
  scale,
  fit,
  onStep,
  onSet,
  onFit,
}: {
  scale: number;
  /** The fit in force, or null once the reader has set a size by hand. */
  fit: 'auto' | 'fit-width' | 'fit-page' | null;
  onStep: (delta: number) => void;
  onSet: (scale: number) => void;
  onFit: (mode: 'fit-width' | 'fit-page') => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const percent = Math.round(scale * 100);

  const commit = (raw: string) => {
    setDraft(null);
    const digits = raw.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10));
    const wanted = Number.parseFloat(digits.replace(/[%\s]/g, ''));
    if (Number.isFinite(wanted) && wanted > 0) onSet(wanted / 100);
  };

  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="Zoom out" onClick={() => onStep(-0.1)}>
        <Minus className="size-3.5" />
      </IconButton>
      <input
        value={draft ?? `${percent}%`}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setDraft(String(percent));
          requestAnimationFrame(() => event.target.select());
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        aria-label="Zoom level, percent"
        title="Type a zoom level"
        inputMode="decimal"
        className={cn(FIELD_CLASS, 'w-[6ch] font-mono text-xs tabular-nums')}
      />
      <IconButton label="Zoom in" onClick={() => onStep(0.1)}>
        <Plus className="size-3.5" />
      </IconButton>
      <Menu
        placement="bottom-start"
        trigger={(props) => (
          <button
            type="button"
            aria-label="Zoom options"
            title="Zoom options"
            className="flex h-6 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground"
            {...props}
          >
            <ChevronDown className="size-3.5" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              active={fit === 'fit-width'}
              onClick={() => {
                onFit('fit-width');
                close();
              }}
            >
              <MoveHorizontal className="size-3.5" />
              Fit width
            </MenuItem>
            <MenuItem
              active={fit === 'fit-page'}
              onClick={() => {
                onFit('fit-page');
                close();
              }}
            >
              <MoveVertical className="size-3.5" />
              Fit page
            </MenuItem>
            <div aria-hidden className="my-1 h-px bg-border" />
            {ZOOM_PRESETS.map((value) => (
              <MenuItem
                key={value}
                active={fit === null && percent === value}
                onClick={() => {
                  onSet(value / 100);
                  close();
                }}
              >
                <span className="w-3.5" />
                {value === 100 ? 'Actual size (100%)' : `${value}%`}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-screen place-items-center bg-background text-center text-foreground">
      <div>{children}</div>
    </div>
  );
}

function BackLink() {
  const className = 'mt-4 inline-block text-muted-foreground text-xs underline';
  return appConfig.home === undefined ? (
    <Link to="/" className={className}>
      Back to documents
    </Link>
  ) : (
    <a href={appConfig.home} className={className}>
      Back to workspace
    </a>
  );
}

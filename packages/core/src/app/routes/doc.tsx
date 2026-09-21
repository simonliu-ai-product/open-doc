import appConfig from 'virtual:open-doc/config';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  FileCode2,
  FileImage,
  FileText,
  GalleryVertical,
  Image,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  Maximize,
  Minimize,
  Minus,
  MousePointerClick,
  MoveHorizontal,
  MoveVertical,
  Palette,
  Percent,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DesignPanel } from '../components/design-panel/design-panel';
import { DesignProvider } from '../components/design-panel/design-provider';
import { DocSearch } from '../components/doc-search';
import { DocSidebar } from '../components/doc-sidebar';
import { Inspector } from '../components/inspector/inspector';
import { PageFrame } from '../components/page-frame';
import { ThemeToggle } from '../components/theme-toggle';
import { Menu, MenuItem } from '../components/ui/menu';
import { useAgentBridge } from '../lib/agent-bridge';
import { exportDocAsHtml } from '../lib/export-html';
import { exportDocAsImages } from '../lib/export-image';
import { exportDocAsPdf } from '../lib/export-pdf';
import { type OutlineEntry, useDocOutline } from '../lib/outline';
import { describeSelection, type PageSelection, resolveSelection } from '../lib/page-range';
import { nextFrame, waitForFonts } from '../lib/print-ready';
import { scanDocument } from '../lib/scan';
import { resolvePageGeometry } from '../lib/sdk';
import { useDocModule } from '../lib/use-doc-module';
import { useDocPages } from '../lib/use-doc-pages';
import { cn } from '../lib/utils';
import {
  gridColumns,
  pageInView,
  READING_LINE,
  useViewMode,
  VIEW_MODES,
  type ViewMode,
} from '../lib/view-mode';

type DownloadFormat = 'pdf' | 'html' | 'png' | 'svg';

const DOWNLOAD_LABEL: Record<DownloadFormat, string> = {
  pdf: 'PDF',
  html: 'HTML',
  png: 'PNG',
  svg: 'SVG',
};

const DOWNLOAD_FORMATS = [
  { format: 'pdf' as const, label: 'PDF', hint: 'True page size, print-ready', icon: FileText },
  { format: 'html' as const, label: 'HTML', hint: 'Self-contained, printable', icon: FileCode2 },
  { format: 'png' as const, label: 'PNG', hint: 'Pixels, 2x — for slides and chat', icon: Image },
  { format: 'svg' as const, label: 'SVG', hint: 'Vector, keeps text as text', icon: FileImage },
];

const GUTTER = 48;
/** Breathing room left above a heading the outline jumped to. */
const HEADING_TOP_INSET = 28;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const PAGE_GAP = 24;
/** Facing pages meet at the spine; a hairline keeps two white sheets from reading as one. */
const SPREAD_GAP = 4;
/** A grid opens as a contact sheet: small enough to take in a chapter, large enough to tell a figure from a table. */
const GRID_SCALE = 0.3;

const VIEW_MODE_OPTIONS: Record<ViewMode, { label: string; icon: LucideIcon }> = {
  continuous: { label: 'Continuous', icon: GalleryVertical },
  'two-up': { label: 'Two-up', icon: BookOpen },
  grid: { label: 'Grid', icon: LayoutGrid },
};

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);

const TOOL_GROUP_CLASS = 'items-center gap-0.5 rounded-md border border-border px-1 py-0.5';

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
  const [inspecting, setInspecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useViewMode(docId);
  const chosenPage = useRef<number | null>(null);
  const place = useRef<{ page: number; fraction: number; centre: number } | null>(null);
  const refreshPage = useRef<() => void>(() => {});

  const geometry = useMemo(() => resolvePageGeometry(doc?.meta), [doc?.meta]);
  const { pages, measuring, overflowing } = useDocPages(doc, geometry);
  const outline = useDocOutline();

  useAgentBridge({ docId: docId ?? '', doc, pages, geometry, measuring, oversized: overflowing });

  const clamp = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
  // Two-up fits the spread rather than one sheet — the pair is what is being read.
  const across = viewMode === 'two-up' ? 2 : 1;
  const columnGap = viewMode === 'two-up' ? SPREAD_GAP : PAGE_GAP;
  const widthFit = (available.width - (across - 1) * columnGap) / (geometry.width * across);
  const fitWidthScale = available.width ? clamp(widthFit) : 1;
  // Fit page is bounded by both axes so the whole sheet lands inside the pane.
  const fitPageScale = available.height
    ? clamp(Math.min(widthFit, available.height / geometry.height))
    : 1;
  // Auto keeps a page at its true size unless the window is too narrow to hold
  // it, and opens a grid zoomed out; the explicit fit modes may go past 100%.
  const scale =
    manualScale ??
    (zoomMode === 'fit-width'
      ? fitWidthScale
      : zoomMode === 'fit-page'
        ? fitPageScale
        : Math.min(viewMode === 'grid' ? GRID_SCALE : 1, fitWidthScale));
  const columns =
    viewMode === 'grid'
      ? gridColumns(geometry.width * scale, available.width, columnGap, pages.length)
      : across;

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

  // Counted a frame after a scroll, and recorded as a place to return to: the
  // page, how far down it the reading line falls, and how far across the view is.
  useEffect(() => {
    const root = scrollRef.current;
    const container = pagesRef.current;
    if (!root || !container || pages.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const sheets = Array.from(container.children as HTMLCollectionOf<HTMLElement>, (el) => ({
        top: el.offsetTop,
        height: el.offsetHeight,
      }));
      const page = pageInView(
        sheets,
        { top: root.scrollTop, height: root.clientHeight },
        chosenPage.current,
      );
      const sheet = sheets[page - 1];
      if (sheet) {
        const line = root.scrollTop + root.clientHeight * READING_LINE;
        place.current = {
          page,
          fraction: Math.min(1, Math.max(0, (line - sheet.top) / sheet.height)),
          centre: (root.scrollLeft + root.clientWidth / 2) / root.scrollWidth,
        };
      }
      setCurrentPage(page);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    // Scrolling by hand hands the counter back to the scroll position.
    const release = () => {
      chosenPage.current = null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) release();
    };

    refreshPage.current = schedule;
    schedule();
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('wheel', release, { passive: true });
    root.addEventListener('pointerdown', release);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('scroll', schedule);
      root.removeEventListener('wheel', release);
      root.removeEventListener('pointerdown', release);
      window.removeEventListener('keydown', onKeyDown);
      if (frame) cancelAnimationFrame(frame);
      refreshPage.current = () => {};
      // A new page list — another document, or this one re-paginated — has
      // nothing chosen yet and no place to return to.
      chosenPage.current = null;
      place.current = null;
    };
  }, [pages.length]);

  /**
   * A zoom, a new layout or a resized pane moves every sheet, and the scroll
   * offset left behind lands somewhere else in the document — in a grid, whole
   * rows away. Put the page being read back where it was: the same point of it on
   * the reading line, which also keeps the counter on that page.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `scale`, `columns` and `viewMode` are what move the sheets; the effect reads the layout they produced.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    const at = place.current;
    const sheet = at
      ? (pagesRef.current?.children[at.page - 1] as HTMLElement | undefined)
      : undefined;
    if (root && at && sheet) {
      root.scrollTop =
        sheet.offsetTop + at.fraction * sheet.offsetHeight - root.clientHeight * READING_LINE;
      root.scrollLeft = at.centre * root.scrollWidth - root.clientWidth / 2;
      chosenPage.current = at.page;
    }
    refreshPage.current();
  }, [scale, columns, viewMode]);

  const choosePage = useCallback((page: number) => {
    chosenPage.current = page;
    refreshPage.current();
  }, []);

  const scrollToPage = useCallback(
    (page: number) => {
      choosePage(page);
      const frame = pagesRef.current?.children[page - 1];
      frame?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [choosePage],
  );

  // Land the heading near the top of the reading pane, not centred — the reader
  // wants what follows the heading, and centring buries half of it.
  const scrollToEntry = useCallback(
    (entry: OutlineEntry) => {
      const root = scrollRef.current;
      const target = root?.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`);
      if (!root || !target) {
        scrollToPage(entry.page);
        return;
      }
      choosePage(entry.page);
      const offset = target.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top: root.scrollTop + offset - HEADING_TOP_INSET, behavior: 'smooth' });
    },
    [choosePage, scrollToPage],
  );

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

  const actualSize = () => {
    setZoomMode('auto');
    setManualScale(1);
  };

  // Each layout opens at its own natural zoom: a scale picked for one column is
  // the wrong size for a spread, and a grid is a zoom-out by definition.
  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    setManualScale(null);
    setZoomMode('auto');
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
      <header className="grid h-12 flex-none grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center">
          <HeaderBackLink />
        </div>

        <h1 className="truncate text-center font-medium text-sm">{doc.meta?.title ?? docId}</h1>

        <div className="flex items-center justify-end gap-3">
          <span className="hidden items-center gap-1.5 sm:flex">
            <PageJump page={currentPage} total={pages.length} onJump={scrollToPage} />
            <DocSearch scrollRef={scrollRef} pagesRef={pagesRef} onFoundPage={choosePage} />
          </span>

          {/* Narrower than this, the header has no room left for the group and
              two sheets side by side are too small to read anyway. */}
          <fieldset aria-label="View mode" className={cn('hidden lg:flex', TOOL_GROUP_CLASS)}>
            {VIEW_MODES.map((mode) => {
              const { label, icon: Icon } = VIEW_MODE_OPTIONS[mode];
              return (
                <IconButton
                  key={mode}
                  label={label}
                  onClick={() => changeViewMode(mode)}
                  active={viewMode === mode}
                >
                  <Icon className="size-3.5" />
                </IconButton>
              );
            })}
          </fieldset>

          <div className={cn('flex', TOOL_GROUP_CLASS)}>
            <IconButton label="Zoom out" onClick={() => zoom(-0.1)}>
              <Minus className="size-3.5" />
            </IconButton>
            <button
              type="button"
              onClick={actualSize}
              title="Actual size (100%)"
              className="w-11 rounded text-center font-mono text-[11px] tabular-nums transition-colors hover:bg-accent"
            >
              {Math.round(scale * 100)}%
            </button>
            <IconButton label="Zoom in" onClick={() => zoom(0.1)}>
              <Plus className="size-3.5" />
            </IconButton>
            <IconButton
              label="Fit width"
              onClick={() => fitTo('fit-width')}
              active={manualScale === null && zoomMode === 'fit-width'}
            >
              <MoveHorizontal className="size-3.5" />
            </IconButton>
            {/* Fit-width moves the page sideways to the edges, fit-page moves it
                up and down to them. Both used to be a square-ish glyph, and the
                fit-page one was the same square as fullscreen — three controls,
                two shapes, no way to tell which did what without clicking. */}
            <IconButton
              label="Fit page"
              onClick={() => fitTo('fit-page')}
              active={manualScale === null && zoomMode === 'fit-page'}
            >
              <MoveVertical className="size-3.5" />
            </IconButton>
            <IconButton label="Actual size (100%)" onClick={actualSize}>
              <Percent className="size-3.5" />
            </IconButton>
          </div>

          <IconButton
            label={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </IconButton>

          {/* The document browser normally carries this. A viewer mounted with
            `showDocBrowser: false` never shows that shell, and without it a
            reader has no way to change the theme at all. */}
          {!appConfig.build.showDocBrowser && <ThemeToggle />}

          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => setInspecting((on) => !on)}
              title="Inspect and edit on the page"
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent',
                inspecting && 'border-transparent bg-[#3b82f6] text-white hover:bg-[#3b82f6]',
              )}
            >
              <MousePointerClick className="size-3.5" />
              Inspect
            </button>
          )}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => setDesignOpen((open) => !open)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent',
                designOpen && 'bg-accent',
              )}
            >
              <Palette className="size-3.5" />
              Design
            </button>
          )}
          <Menu
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
                {DOWNLOAD_FORMATS.map(({ format, label, hint, icon: Icon }) => (
                  <MenuItem
                    key={format}
                    disabled={!chosenPages.valid}
                    onClick={() => {
                      close();
                      void runDownload(format);
                    }}
                  >
                    <Icon className="size-3.5 flex-none" />
                    <span className="flex-1">
                      {label}
                      <span className="block text-[10px] text-muted-foreground">{hint}</span>
                    </span>
                  </MenuItem>
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
        <div
          ref={scrollRef}
          data-od-viewer
          className="relative min-w-0 flex-1 overflow-auto bg-canvas"
        >
          {/* Centred by its margins, not by the scroller: a row zoomed wider than
              the pane then overflows to the right, where it can be scrolled to,
              instead of equally off both edges with its left side out of reach. */}
          <div
            ref={pagesRef}
            className="mx-auto grid w-max"
            style={{
              gridTemplateColumns: `repeat(${columns}, max-content)`,
              columnGap,
              rowGap: PAGE_GAP,
              padding: `${GUTTER}px ${GUTTER}px ${GUTTER * 1.5}px`,
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
                // A bound document opens on a right-hand page, so spreads pair
                // 2–3, 4–5 — the pairs a reader sees when the book is open.
                className={viewMode === 'two-up' && index === 0 ? 'col-start-2' : undefined}
              >
                {page.content}
              </PageFrame>
            ))}
          </div>
        </div>
        {inspecting && docId && (
          <Inspector docId={docId} containerRef={scrollRef} onExit={() => setInspecting(false)} />
        )}
        {designOpen && <DesignPanel onClose={() => setDesignOpen(false)} />}
      </div>
    </div>
  );

  // The design panel writes back to source through the dev server, so it only
  // exists while `open-doc dev` is running.
  if (!import.meta.env.DEV || !docId) return view;
  return <DesignProvider docId={docId}>{view}</DesignProvider>;
}

/**
 * 全部／此頁／自訂 —— 和列印對話框問的是同一件事，因為那是使用者已經會的問法。
 *
 * 自訂欄位只在被選中時出現。三個選項配一個永遠佔著位置的空欄位，會讓人以為那是
 * 必填的。
 */
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
  const options = [
    { kind: 'all' as const, label: 'All', hint: `${total}` },
    { kind: 'current' as const, label: 'This page', hint: `${currentPage}` },
    { kind: 'custom' as const, label: 'Custom', hint: '' },
  ];
  const chosen = describeSelection(
    selection.kind === 'custom' ? { kind: 'custom', text: custom } : selection,
    total,
    currentPage,
  );

  return (
    <div className="border-border border-b px-1 pt-1 pb-2">
      <p className="px-1 pb-1 text-[10px] text-muted-foreground uppercase tracking-wide">Pages</p>
      <div className="flex gap-0.5">
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelection(
                option.kind === 'custom' ? { kind: 'custom', text: custom } : { kind: option.kind },
              );
            }}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[11px] transition-colors hover:bg-accent',
              selection.kind === option.kind && 'bg-accent text-foreground',
            )}
          >
            {option.label}
            {option.hint && (
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                {option.hint}
              </span>
            )}
          </button>
        ))}
      </div>
      {selection.kind === 'custom' && (
        <input
          value={custom}
          onChange={(event) => onCustom(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          placeholder="e.g. 1-3, 5"
          aria-label="Pages to download"
          aria-invalid={!chosen.valid}
          className={cn(
            'mt-1.5 w-full rounded border border-border bg-transparent px-2 py-1 text-[11px] outline-none placeholder:text-muted-foreground focus:border-foreground/40',
            !chosen.valid && custom !== '' && 'border-foreground/40',
          )}
        />
      )}
      <p className="px-1 pt-1.5 text-[10px] text-muted-foreground">
        {chosen.valid
          ? `${chosen.count} page${chosen.count === 1 ? '' : 's'} will be downloaded`
          : 'Type page numbers, like 1-3, 5'}
      </p>
    </div>
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
        className="w-7 rounded bg-transparent text-right outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-foreground"
      />
      <span className="px-1">/</span>
      <span>{total}</span>
    </span>
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

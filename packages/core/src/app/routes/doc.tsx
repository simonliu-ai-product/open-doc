import {
  ArrowLeft,
  Check,
  Download,
  FileCode2,
  FileText,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  MousePointerClick,
  MoveHorizontal,
  Palette,
  Plus,
  Scan,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DesignPanel } from '../components/design-panel/design-panel';
import { DesignProvider } from '../components/design-panel/design-provider';
import { DocSidebar } from '../components/doc-sidebar';
import { Inspector } from '../components/inspector/inspector';
import { PageFrame } from '../components/page-frame';
import { Menu, MenuItem } from '../components/ui/menu';
import { exportDocAsHtml } from '../lib/export-html';
import { exportDocAsPdf } from '../lib/export-pdf';
import { collectOutline, type OutlineEntry, setOutline, useDocOutline } from '../lib/outline';
import { nextFrame, waitForFonts } from '../lib/print-ready';
import { resolvePageGeometry } from '../lib/sdk';
import { useDocModule } from '../lib/use-doc-module';
import { useDocPages } from '../lib/use-doc-pages';
import { cn } from '../lib/utils';

type DownloadFormat = 'pdf' | 'html';

const DOWNLOAD_LABEL: Record<DownloadFormat, string> = {
  pdf: 'PDF',
  html: 'HTML',
};

const DOWNLOAD_FORMATS = [
  { format: 'pdf' as const, label: 'PDF', hint: 'True page size, print-ready', icon: FileText },
  { format: 'html' as const, label: 'HTML', hint: 'Self-contained, printable', icon: FileCode2 },
];

const GUTTER = 48;
/** Breathing room left above a heading the outline jumped to. */
const HEADING_TOP_INSET = 28;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const PAGE_GAP = 24;

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
  const [designOpen, setDesignOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const geometry = useMemo(() => resolvePageGeometry(doc?.meta), [doc?.meta]);
  const { pages, measuring } = useDocPages(doc, geometry);
  const outline = useDocOutline();

  const clamp = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
  const fitWidthScale = available.width ? clamp(available.width / geometry.width) : 1;
  // Fit page is bounded by both axes so the whole sheet lands inside the pane.
  const fitPageScale = available.height
    ? clamp(Math.min(available.width / geometry.width, available.height / geometry.height))
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `doc` re-scans on hot reload, when the module identity changes but the status stays 'ready'.
  useEffect(() => {
    if (state.status !== 'ready' || measuring) return;
    let cancelled = false;
    (async () => {
      await nextFrame();
      await waitForFonts();
      await nextFrame();
      const root = pagesRef.current;
      if (cancelled || !root) return;
      setOutline(collectOutline(root));
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
      let page = 1;
      frames.forEach((el, index) => {
        if (el.offsetTop <= marker) page = index + 1;
      });
      setCurrentPage(page);
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
  }, [pages.length, scale]);

  const scrollToPage = useCallback((page: number) => {
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
    setDownload({ format, percent: 0 });
    try {
      if (format === 'pdf') {
        await exportDocAsPdf(doc, docId, pages, (progress) =>
          setDownload({ format, percent: progress.percent }),
        );
      } else {
        await exportDocAsHtml(doc, docId, pages);
      }
      setDownloaded(format);
      setTimeout(() => setDownloaded(null), 2000);
    } finally {
      setDownload(null);
    }
  };

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
      <header className="flex h-12 flex-none items-center gap-3 border-b border-border px-3">
        <Link
          to="/"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to documents"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-medium text-sm">{doc.meta?.title ?? docId}</h1>
          {doc.meta?.subtitle && (
            <p className="truncate text-muted-foreground text-xs">{doc.meta.subtitle}</p>
          )}
        </div>

        <span className="hidden font-mono text-muted-foreground text-xs tabular-nums sm:inline">
          {currentPage} / {pages.length}
        </span>

        <div className="flex items-center gap-0.5 rounded-md border border-border px-1 py-0.5">
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
          <IconButton
            label="Fit page"
            onClick={() => fitTo('fit-page')}
            active={manualScale === null && zoomMode === 'fit-page'}
          >
            <Scan className="size-3.5" />
          </IconButton>
        </div>

        <IconButton
          label={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </IconButton>

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
          {(close) =>
            DOWNLOAD_FORMATS.map(({ format, label, hint, icon: Icon }) => (
              <MenuItem
                key={format}
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
            ))
          }
        </Menu>
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
          <div
            ref={pagesRef}
            className="flex flex-col items-center"
            style={{ gap: PAGE_GAP, padding: `${GUTTER}px ${GUTTER}px ${GUTTER * 1.5}px` }}
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
  return (
    <Link to="/" className="mt-4 inline-block text-muted-foreground text-xs underline">
      Back to documents
    </Link>
  );
}

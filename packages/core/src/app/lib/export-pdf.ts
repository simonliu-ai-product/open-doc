import { mountOffscreen } from './export-dom';
import { type DocModule, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export const PRINT_ROOT_ID = 'od-print-root';
export const PRINT_PAGE_CLASS = 'od-print-page';
const PRINT_STYLE_ID = 'od-print-style';

function printStyles(geometry: { width: number; height: number; css: string }): string {
  return `
@page { size: ${geometry.css}; margin: 0; }

@media screen {
  #${PRINT_ROOT_ID} {
    position: fixed !important;
    left: -99999px !important;
    top: 0 !important;
    pointer-events: none !important;
  }
}

@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} {
    position: static !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    pointer-events: auto !important;
    background: #fff !important;
  }
  #${PRINT_ROOT_ID} .${PRINT_PAGE_CLASS} {
    width: ${geometry.width}px !important;
    height: ${geometry.height}px !important;
    overflow: hidden;
    position: relative;
    background: #fff;
    color: #000;
    page-break-after: always;
    break-after: page;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #${PRINT_ROOT_ID} .${PRINT_PAGE_CLASS}:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  /* Chromium serializes box-shadow as a PDF transparency group, which makes
     macOS Preview re-composite on every page turn. Paper shadows are chrome,
     not content — drop them for the printed copy. */
  #${PRINT_ROOT_ID} * { box-shadow: none !important; }
}
`;
}

export type PdfExportProgress = {
  phase: 'rendering' | 'printing' | 'done';
  current: number;
  total: number;
  /** 0–99 while rendering, 99 during printing, 100 when done. */
  percent: number;
};

export type PrintCopy = {
  /** The offscreen container holding one `.od-print-page` per sheet, at true size. */
  root: HTMLElement;
  dispose: () => void;
};

/**
 * Renders every page into an offscreen copy laid out at the real sheet size,
 * with the print stylesheet installed. Callers decide what to do with it —
 * hand it to the print engine, screenshot it, or measure it — and must call
 * `dispose()` when done.
 */
export async function mountPrintCopy(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
  onProgress?: (progress: PdfExportProgress) => void,
): Promise<PrintCopy> {
  const total = pages.length;
  const geometry = resolvePageGeometry(doc.meta);
  onProgress?.({ phase: 'rendering', current: 0, total, percent: 0 });

  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = printStyles(geometry);
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = PRINT_ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  document.body.appendChild(root);

  const previousTitle = document.title;
  document.title = doc.meta?.title ?? docId;

  return mountOffscreen(
    doc,
    async (mount, pace) => {
      for (const [index, page] of pages.entries()) {
        mount(
          page.content,
          { index, total },
          { frame: index, sheet: true, className: PRINT_PAGE_CLASS, paint: true },
        );
        onProgress?.({
          phase: 'rendering',
          current: index + 1,
          total,
          percent: Math.min(90, ((index + 1) / total) * 90),
        });
        await pace();
      }
    },
    {
      root,
      onDispose: () => {
        document.title = previousTitle;
        style.remove();
      },
    },
  );
}

export async function exportDocAsPdf(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
  onProgress?: (progress: PdfExportProgress) => void,
): Promise<void> {
  if (pages.length === 0) return;

  const total = pages.length;
  const copy = await mountPrintCopy(doc, docId, pages, onProgress);

  try {
    onProgress?.({ phase: 'printing', current: total, total, percent: 99 });
    const printDone = waitForAfterPrint();
    window.print();
    await printDone;
  } finally {
    onProgress?.({ phase: 'done', current: total, total, percent: 100 });
    copy.dispose();
  }
}

function waitForAfterPrint(timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      window.removeEventListener('afterprint', onAfter);
      clearTimeout(timer);
      resolve();
    };
    const onAfter = () => cleanup();
    const timer = setTimeout(cleanup, timeoutMs);
    window.addEventListener('afterprint', onAfter, { once: true });
  });
}

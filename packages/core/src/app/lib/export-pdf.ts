import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { designToCssVars } from './design';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';
import { DocPageProvider } from './page-context';
import { nextFrame, sleep, waitForDataWaitfor, waitForFonts, waitForImages } from './print-ready';
import { captureScan, restoreScan, scanDocument } from './scan';
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

  const designVars = doc.design ? designToCssVars(doc.design) : null;
  const reactRoots: Root[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page) continue;
    const host = document.createElement('div');
    host.className = PRINT_PAGE_CLASS;
    host.setAttribute(PAGE_ATTR, '');
    host.setAttribute(PAGE_INDEX_ATTR, String(i));
    host.style.width = `${geometry.width}px`;
    host.style.height = `${geometry.height}px`;
    if (designVars) {
      for (const [k, v] of Object.entries(designVars)) host.style.setProperty(k, v);
      host.style.background = 'var(--od-bg)';
      host.style.color = 'var(--od-text)';
    }
    root.appendChild(host);
    const r = createRoot(host);
    r.render(createElement(DocPageProvider, { index: i, total }, page.content));
    reactRoots.push(r);
    onProgress?.({
      phase: 'rendering',
      current: i + 1,
      total,
      percent: Math.min(90, ((i + 1) / total) * 90),
    });
  }

  const previousTitle = document.title;
  const previousScan = captureScan();
  document.title = doc.meta?.title ?? docId;

  const dispose = () => {
    document.title = previousTitle;
    for (const r of reactRoots) r.unmount();
    root.remove();
    style.remove();
    restoreScan(previousScan);
  };

  try {
    await nextFrame();
    await waitForFonts();
    await waitForImages(root);
    await waitForDataWaitfor(root);

    // A `<TableOfContents>`, a `<Ref>`, a figure's number: all of them read a
    // store that only a DOM scan fills. Scan the print copy and let React commit
    // the resolved values before handing the pages to whoever asked for them.
    scanDocument(root, doc.meta);
    await nextFrame();
    await sleep(50);
  } catch (err) {
    dispose();
    throw err;
  }

  return { root, dispose };
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

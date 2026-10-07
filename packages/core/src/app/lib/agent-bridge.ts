import { useEffect, useRef } from 'react';
import { diagnosePages, type LayoutFinding } from './diagnostics';
import { buildDocDocx } from './export-docx';
import { buildDocHtmlBundle } from './export-html';
import { mountPrintCopy, type PrintCopy } from './export-pdf';
import { exposeOutline } from './outline';
import { recordFileName, setRecordIndex } from './records';
import type { DocModule, PageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export const BRIDGE_KEY = '__openDoc';

export type BridgeStatus = {
  docId: string;
  title: string;
  /** False while the flow packer is still measuring — page count is not final yet. */
  ready: boolean;
  pageCount: number;
  geometry: PageGeometry;
  /** Rows the document prints one copy for (`records`); 0 when it has none. */
  records: number;
  /** The row the pages are laid out for right now, 0-based. */
  record: number;
};

export type BridgeReport = BridgeStatus & { findings: LayoutFinding[] };

export type BridgeBundle = { filename: string; mimeType: string; base64: string };

export type OpenDocBridge = {
  version: 1;
  status(): BridgeStatus;
  /** Mounts the print copy and reads the layout back from it. */
  diagnose(): Promise<BridgeReport>;
  /** Mounts the print copy and leaves it up, for `page.pdf()` or a screenshot. */
  preparePrint(): Promise<{ pageCount: number }>;
  releasePrint(): void;
  htmlBundle(): Promise<BridgeBundle | null>;
  docxBundle(): Promise<BridgeBundle | null>;
  /**
   * Lays the document out for one row and names its file — from `pattern`,
   * else `meta.recordName`, else `<id>-{#}`. Wait for `status()` to report
   * that row and `ready` before printing.
   */
  setRecord(index: number, pattern?: string): { name: string };
};

type BridgeInput = {
  docId: string;
  doc: DocModule | null;
  pages: ExpandedPage[];
  geometry: PageGeometry;
  measuring: boolean;
  oversized: Array<{ section: number; block: number }>;
  /** The row this render is laid out for — read from the render, never the store, so `ready` and the row agree. */
  record: number;
};

type GlobalWithBridge = typeof globalThis & { [BRIDGE_KEY]?: OpenDocBridge };

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Publishes the rendered document to whoever is driving the page from outside —
 * `open-doc export`, `check_layout`, `render_page`. The viewer already owns the
 * measured page list and the print pipeline; the bridge just hands them to a
 * headless caller instead of to a Download button, so an agent sees exactly the
 * sheets a person would.
 */
export function useAgentBridge(input: BridgeInput): void {
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    const g = globalThis as GlobalWithBridge;
    let held: PrintCopy | null = null;

    const status = (): BridgeStatus => {
      const { docId, doc, pages, geometry, measuring, record } = latest.current;
      return {
        docId,
        title: doc?.meta?.title ?? docId,
        ready: doc !== null && !measuring && pages.length > 0,
        pageCount: pages.length,
        geometry,
        records: doc?.records?.length ?? 0,
        record,
      };
    };

    const release = () => {
      held?.dispose();
      held = null;
    };

    g[BRIDGE_KEY] = {
      version: 1,
      status,
      async diagnose() {
        const { docId, doc, pages, geometry, oversized } = latest.current;
        const snapshot = status();
        if (!doc || pages.length === 0) return { ...snapshot, findings: [] };
        const copy = await mountPrintCopy(doc, docId, pages);
        try {
          return {
            ...snapshot,
            findings: diagnosePages(copy.root, geometry, { oversized }),
          };
        } finally {
          copy.dispose();
        }
      },
      async preparePrint() {
        release();
        const { docId, doc, pages } = latest.current;
        if (!doc || pages.length === 0) return { pageCount: 0 };
        held = await mountPrintCopy(doc, docId, pages);
        // The copy is hidden from assistive tech while it sits offscreen, but
        // the PDF's bookmarks and tags are built from that same tree. Nobody
        // reads this tab, and the copy goes as soon as the PDF is written.
        held.root.removeAttribute('aria-hidden');
        exposeOutline(held.root);
        return { pageCount: pages.length };
      },
      releasePrint: release,
      async htmlBundle() {
        const { docId, doc, pages } = latest.current;
        if (!doc || pages.length === 0) return null;
        const bundle = await buildDocHtmlBundle(doc, docId, pages);
        if (!bundle) return null;
        return {
          filename: bundle.filename,
          mimeType: bundle.mimeType,
          base64: toBase64(bundle.bytes),
        };
      },
      setRecord(index, pattern) {
        const { docId, doc } = latest.current;
        const records = doc?.records ?? [];
        setRecordIndex(index);
        return {
          name: recordFileName(
            pattern ?? doc?.meta?.recordName ?? `${docId}-{#}`,
            records[index],
            index,
            records.length,
          ),
        };
      },
      async docxBundle() {
        const { docId, doc, pages } = latest.current;
        if (!doc || pages.length === 0) return null;
        const bundle = await buildDocDocx(doc, docId, pages);
        if (!bundle) return null;
        return {
          filename: bundle.filename,
          mimeType: bundle.mimeType,
          base64: toBase64(bundle.bytes),
        };
      },
    };

    return () => {
      release();
      delete g[BRIDGE_KEY];
    };
  }, []);
}

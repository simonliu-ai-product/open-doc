/**
 * Shared by every exporter so there is one way to draw the document offscreen.
 * Two copies would drift on font waiting, scanning, or design variables, and the
 * difference would only ever show up in an exported file.
 */

import { Component, createElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { designToCssVars } from './design';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';
import { DocPageProvider } from './page-context';
import { nextFrame, waitForDataWaitfor, waitForFonts, waitForImages } from './print-ready';
import { captureScan, restoreScan, scanDocument } from './scan';
import { type DocModule, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export const ASSET_EXT_RE =
  /\.(?:png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf)(?:\?[^#]*)?(?:#.*)?$/i;

export type FileBundle = { filename: string; mimeType: string; bytes: Uint8Array };

export type HostOptions = {
  /** 0-based page index; makes the host a frame the outline and numbering scans read. */
  frame?: number;
  /** Sheet height; without it the host grows with its content. */
  sheet?: boolean;
  className?: string;
  /** The design's paper and ink on the host itself, as a printed sheet has them. */
  paint?: boolean;
};

/** Mounts `node` in a host of its own, rendered as page `index` of `total`. */
export type PageMount = (
  node: ReactNode,
  page: { index: number; total: number },
  host?: HostOptions,
) => HTMLElement;

export type OffscreenCopy<T> = { root: HTMLElement; value: T; dispose: () => void };

function offscreenContainer(): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(container);
  return container;
}

/**
 * Around every page of a copy. Rendered synchronously, a page that throws would
 * take the whole export with it; one that only fails for the pages chosen —
 * `chapters[n - 3]` on page 1 of a one-page export, or on the Word export's
 * sentinel page 38271 — prints blank instead.
 */
class PageBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Renders and commits before returning. A concurrent render can still be
 * pending when the next line reads the DOM — right after a document first
 * loads, the viewer's own rendering is ahead of it in the queue — and a scan of
 * an uncommitted copy sees blank sheets: an empty table of contents, figures
 * without numbers. Never call it from inside a render or an effect.
 */
function renderNow(host: HTMLElement, node: ReactNode): Root {
  const root = createRoot(host);
  flushSync(() => root.render(node));
  return root;
}

/** Everything a page waits on before it can be read: fonts, images, `data-waitfor`. */
async function settle(root: HTMLElement): Promise<void> {
  await nextFrame();
  await waitForFonts();
  await waitForImages(root);
  await waitForDataWaitfor(root);
}

/**
 * Hands the thread back between synchronous renders. Committed back to back, a
 * long document holds the main thread and the progress percentage never paints.
 * It yields through a message rather than a timer: a timer in a background tab
 * waits a whole second, once per yield.
 */
export function pacer(budgetMs = 50): () => Promise<void> {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < budgetMs) return;
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
    last = performance.now();
  };
}

/**
 * A private copy of the document, drawn offscreen by `draw`, scanned, and
 * settled — the lifecycle every exporter shares. The scan is the copy's own, so
 * the pages its contents and references quote are the pages it shows; the
 * viewer's is put back by `dispose()`, which also runs if anything throws first.
 */
export async function mountOffscreen<T>(
  doc: DocModule,
  draw: (mount: PageMount, pace: () => Promise<void>) => Promise<T>,
  opts: { root?: HTMLElement; onDispose?: () => void } = {},
): Promise<OffscreenCopy<T>> {
  const root = opts.root ?? offscreenContainer();
  const geometry = resolvePageGeometry(doc.meta);
  const vars = doc.design ? Object.entries(designToCssVars(doc.design)) : [];
  const previousScan = captureScan();
  const roots: Root[] = [];
  const dispose = () => {
    for (const r of roots) r.unmount();
    root.remove();
    restoreScan(previousScan);
    opts.onDispose?.();
  };

  // Styled as the viewer styles a sheet, so positioned content lands where it
  // does on screen.
  const mount: PageMount = (node, page, host = {}) => {
    const el = document.createElement('div');
    if (host.className) el.className = host.className;
    if (host.frame !== undefined) {
      el.setAttribute(PAGE_ATTR, '');
      el.setAttribute(PAGE_INDEX_ATTR, String(host.frame));
    }
    Object.assign(el.style, {
      width: `${geometry.width}px`,
      height: host.sheet ? `${geometry.height}px` : '',
      position: 'relative',
      overflow: 'hidden',
      textAlign: 'start',
    });
    for (const [name, value] of vars) el.style.setProperty(name, value);
    if (host.paint) {
      // Paper and ink of its own, as the viewer's sheet has: the copy hangs off
      // <body>, and a document with no design would otherwise print in the
      // chrome's colours, which follow the viewer's dark mode.
      el.style.background = doc.design ? 'var(--od-bg)' : '#ffffff';
      el.style.color = doc.design ? 'var(--od-text)' : '#000000';
    }
    root.appendChild(el);
    const content = createElement(PageBoundary, null, node);
    roots.push(renderNow(el, createElement(DocPageProvider, page, content)));
    return el;
  };

  try {
    const value = await draw(mount, pacer());
    await settle(root);
    // What the scan resolves — contents, numbers, references — is committed
    // before anything reads the copy, and gets its fonts like the rest. Images
    // and data-waitfor were settled above; waiting on them again only doubles
    // the timeout of one that never arrives.
    flushSync(() => scanDocument(root, doc.meta));
    await nextFrame();
    await waitForFonts();
    return { root, value, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}

/** Every sheet as it would print, serialized. */
export async function renderPagesToHtml(pages: ExpandedPage[], doc: DocModule): Promise<string[]> {
  const total = pages.length;
  const copy = await mountOffscreen(doc, async (mount, pace) => {
    const hosts: HTMLElement[] = [];
    for (const [index, page] of pages.entries()) {
      hosts.push(mount(page.content, { index, total }, { frame: index, sheet: true }));
      await pace();
    }
    return hosts;
  });
  try {
    return copy.value.map((host) => host.innerHTML);
  } finally {
    copy.dispose();
  }
}

export function collectCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) chunks.push(rule.cssText);
  }
  return chunks.join('\n');
}
export function collectExternalStylesheetLinks(): string {
  const links: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      void sheet.cssRules;
    } catch {
      if (sheet.href) links.push(`<link rel="stylesheet" href="${escapeAttr(sheet.href)}">`);
    }
  }
  return links.join('\n');
}
export function findHtmlAssetUrls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    if (looksLikeAsset(m[1])) out.push(m[1]);
  }
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url && looksLikeAsset(url)) out.push(url);
    }
  }
  return out;
}
export function findCssAssetUrls(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)) {
    const url = m[2].trim();
    if (looksLikeAsset(url)) out.push(url);
  }
  return out;
}
export function looksLikeAsset(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) return false;
  if (url.startsWith('mailto:') || url.startsWith('javascript:')) return false;
  const abs = toAbsolute(url);
  if (!abs) return false;
  try {
    if (new URL(abs).origin !== window.location.origin) return false;
  } catch {
    return false;
  }
  return ASSET_EXT_RE.test(url);
}
export function toAbsolute(url: string): string | null {
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return null;
  }
}
export function uniqueAssetName(absoluteUrl: string, used: Set<string>): string {
  let base = 'asset';
  try {
    base = new URL(absoluteUrl).pathname.split('/').pop() || 'asset';
  } catch {}
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const hash = shortHash(absoluteUrl);
  const dot = base.lastIndexOf('.');
  const name = dot > 0 ? `${base.slice(0, dot)}-${hash}${base.slice(dot)}` : `${base}-${hash}`;
  used.add(name);
  return name;
}
export function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}
export function downloadBundle(bundle: FileBundle): void {
  downloadBlob(new Blob([bundle.bytes as BlobPart], { type: bundle.mimeType }), bundle.filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

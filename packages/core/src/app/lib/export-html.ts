import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { designToCssVars } from './design';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';
import { DocPageProvider } from './page-context';
import { nextFrame, waitForFonts, waitForImages } from './print-ready';
import { captureScan, restoreScan, scanDocument } from './scan';
import { type DocModule, type PageGeometry, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

type AssetEntry = { name: string; bytes: Uint8Array };

const ASSET_EXT_RE = /\.(?:png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf)(?:\?[^#]*)?(?:#.*)?$/i;

export type HtmlBundle = {
  filename: string;
  mimeType: 'text/html' | 'application/zip';
  bytes: Uint8Array;
};

/**
 * Serializes the document into a self-contained page — a plain `.html` when
 * nothing is referenced, a zip alongside its assets when something is. The
 * browser downloads it; the headless exporter writes it to disk.
 */
export async function buildDocHtmlBundle(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
): Promise<HtmlBundle | null> {
  if (pages.length === 0) return null;

  const title = doc.meta?.title ?? docId;
  const geometry = resolvePageGeometry(doc.meta);
  const pagesHtml = await renderPagesToHtml(pages, geometry, doc);
  const bundledCss = collectCss();
  const externalLinks = collectExternalStylesheetLinks();

  const assets = new Map<string, AssetEntry>();
  const usedNames = new Set<string>();
  const urls = new Set<string>([
    ...findHtmlAssetUrls(pagesHtml.join('\n')),
    ...findCssAssetUrls(bundledCss),
  ]);

  for (const url of urls) {
    const absolute = toAbsolute(url);
    if (!absolute) continue;
    try {
      const res = await fetch(absolute);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      assets.set(url, { name: uniqueAssetName(absolute, usedNames), bytes });
    } catch {}
  }

  const html = buildHtml({
    title,
    geometry,
    design: doc.design,
    pagesHtml: pagesHtml.map((page) => rewriteUrls(page, assets, 'html')),
    bundledCss: rewriteUrls(bundledCss, assets, 'css'),
    externalLinks,
  });
  const htmlBytes = new TextEncoder().encode(html);

  if (assets.size === 0) {
    return { filename: `${docId}.html`, mimeType: 'text/html', bytes: htmlBytes };
  }

  const { zipSync } = await import('fflate');
  const zipTree: Record<string, Uint8Array | Record<string, Uint8Array>> = {
    [`${docId}.html`]: htmlBytes,
    assets: {},
  };
  for (const { name, bytes } of assets.values()) {
    (zipTree.assets as Record<string, Uint8Array>)[name] = bytes;
  }
  return {
    filename: `${docId}.zip`,
    mimeType: 'application/zip',
    bytes: zipSync(zipTree as Parameters<typeof zipSync>[0]),
  };
}

export async function exportDocAsHtml(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
): Promise<void> {
  const bundle = await buildDocHtmlBundle(doc, docId, pages);
  if (!bundle) return;
  downloadBlob(new Blob([bundle.bytes as BlobPart], { type: bundle.mimeType }), bundle.filename);
}

async function renderPagesToHtml(
  pages: ExpandedPage[],
  geometry: PageGeometry,
  doc: DocModule,
): Promise<string[]> {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(container);

  const designVars = doc.design ? designToCssVars(doc.design) : null;
  const roots: Root[] = [];
  const hosts: HTMLElement[] = [];
  const previousScan = captureScan();

  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue;
      const host = document.createElement('div');
      host.setAttribute(PAGE_ATTR, '');
      host.setAttribute(PAGE_INDEX_ATTR, String(i));
      host.style.width = `${geometry.width}px`;
      host.style.height = `${geometry.height}px`;
      if (designVars) {
        for (const [k, v] of Object.entries(designVars)) host.style.setProperty(k, v);
      }
      container.appendChild(host);
      hosts.push(host);
      const root = createRoot(host);
      root.render(createElement(DocPageProvider, { index: i, total: pages.length }, page.content));
      roots.push(root);
    }

    await nextFrame();
    await waitForFonts();
    await waitForImages(container);
    scanDocument(container, doc.meta);
    await nextFrame();
    await nextFrame();

    return hosts.map((host) => host.innerHTML);
  } finally {
    for (const root of roots) root.unmount();
    container.remove();
    restoreScan(previousScan);
  }
}

function collectCss(): string {
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

function collectExternalStylesheetLinks(): string {
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

function findHtmlAssetUrls(html: string): string[] {
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

function findCssAssetUrls(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)) {
    const url = m[2].trim();
    if (looksLikeAsset(url)) out.push(url);
  }
  return out;
}

function looksLikeAsset(url: string): boolean {
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

function toAbsolute(url: string): string | null {
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return null;
  }
}

function uniqueAssetName(absoluteUrl: string, used: Set<string>): string {
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

function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

function rewriteUrls(
  source: string,
  assets: Map<string, AssetEntry>,
  kind: 'html' | 'css',
): string {
  let out = source;
  for (const [orig, { name }] of assets) {
    out = out.split(orig).join(kind === 'css' ? `./assets/${name}` : `assets/${name}`);
  }
  return out;
}

function buildHtml(opts: {
  title: string;
  geometry: PageGeometry;
  design: DocModule['design'];
  pagesHtml: string[];
  bundledCss: string;
  externalLinks: string;
}): string {
  const { width, height, css } = opts.geometry;
  const designStyle = opts.design
    ? Object.entries(designToCssVars(opts.design))
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ')
    : '';

  const pagesMarkup = opts.pagesHtml
    .map(
      (page, i) =>
        `<div class="od-page" ${PAGE_ATTR} ${PAGE_INDEX_ATTR}="${i}"${designStyle ? ` style="${escapeAttr(designStyle)}"` : ''}>${page}</div>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
${opts.externalLinks}
<style>
html, body { margin: 0; background: #6b7280; font-family: system-ui, sans-serif; }
.od-doc { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 32px 16px 64px; }
.od-page { width: ${width}px; height: ${height}px; flex: none; position: relative; overflow: hidden; background: #fff; color: #111; box-shadow: 0 1px 3px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.22); }
@page { size: ${css}; margin: 0; }
@media print {
  html, body { background: #fff; }
  .od-doc { display: block; padding: 0; gap: 0; }
  .od-page { box-shadow: none; page-break-after: always; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .od-page:last-child { page-break-after: auto; break-after: auto; }
}
</style>
<style>${opts.bundledCss}</style>
</head>
<body>
<div class="od-doc">
${pagesMarkup}
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function downloadBlob(blob: Blob, filename: string): void {
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

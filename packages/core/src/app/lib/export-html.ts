import { designToCssVars } from './design';
import {
  collectCss,
  collectExternalStylesheetLinks,
  downloadBlob,
  escapeAttr,
  escapeHtml,
  findCssAssetUrls,
  findHtmlAssetUrls,
  renderPagesToHtml,
  toAbsolute,
  uniqueAssetName,
} from './export-dom';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';
import { type DocModule, type PageGeometry, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

type AssetEntry = { name: string; bytes: Uint8Array };

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

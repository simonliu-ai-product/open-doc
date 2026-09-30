/**
 * Pages as pictures — SVG, and PNG rasterised from it.
 *
 * The page is HTML, so the SVG is an HTML page wrapped in `<foreignObject>`.
 * That has one hard consequence: an SVG handed to the canvas rasteriser is
 * loaded in isolation, and it may not fetch anything. A stylesheet URL, a web
 * font, an `<img src>` pointing at the server — all of them silently do not
 * arrive, and what comes out is a page in fallback fonts with holes where the
 * images were. So every referenced asset is fetched here and embedded as a
 * `data:` URI before the SVG is built. Fonts installed on the reader's own
 * machine still resolve by name; only fetched ones need embedding.
 */

import { designToCssVars } from './design';
import {
  downloadBlob,
  findCssAssetUrls,
  findHtmlAssetUrls,
  renderPagesToHtml,
  toAbsolute,
} from './export-dom';
import { PAGE_ATTR } from './outline';
import { type DocModule, type PageGeometry, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export type ImageFormat = 'png' | 'svg';

export type ImageExportProgress = {
  phase: 'rendering' | 'embedding' | 'drawing' | 'done';
  current: number;
  total: number;
  percent: number;
};

/**
 * Rasterised at twice the CSS size. A page printed at 1x is legible on screen
 * and disappointing everywhere else — the moment someone drops it into a slide
 * the text is soft. Twice is the cheapest size that survives that.
 */
const PNG_SCALE = 2;

export async function exportDocAsImages(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
  format: ImageFormat,
  onProgress?: (progress: ImageExportProgress) => void,
): Promise<void> {
  if (pages.length === 0) return;

  const total = pages.length;
  const geometry = resolvePageGeometry(doc.meta);
  const report = (phase: ImageExportProgress['phase'], current: number, percent: number) =>
    onProgress?.({ phase, current, total, percent });

  report('rendering', 0, 2);
  const pagesHtml = await renderPagesToHtml(pages, geometry, doc);

  report('embedding', 0, 20);
  const { css, html } = await embedAssets(pagesHtml, doc);

  const files: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < html.length; i++) {
    const svg = buildSvg(html[i] ?? '', css, geometry, doc);
    const name = `${docId}-${String(i + 1).padStart(2, '0')}`;
    if (format === 'svg') {
      files.push({ name: `${name}.svg`, blob: new Blob([svg], { type: 'image/svg+xml' }) });
    } else {
      report('drawing', i + 1, 20 + Math.round(((i + 1) / total) * 75));
      files.push({ name: `${name}.png`, blob: await rasterise(svg, geometry) });
    }
  }

  report('done', total, 100);
  await deliver(files, docId, format);
}

async function deliver(
  files: { name: string; blob: Blob }[],
  docId: string,
  format: ImageFormat,
): Promise<void> {
  const only = files[0];
  if (files.length === 1 && only) {
    downloadBlob(only.blob, only.name);
    return;
  }
  const { zipSync } = await import('fflate');
  const tree: Record<string, Uint8Array> = {};
  for (const file of files) tree[file.name] = new Uint8Array(await file.blob.arrayBuffer());
  const zip = zipSync(tree as Parameters<typeof zipSync>[0]);
  downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${docId}-${format}.zip`);
}

async function embedAssets(
  pagesHtml: string[],
  doc: DocModule,
): Promise<{ css: string; html: string[] }> {
  const { collectCss } = await import('./export-dom');
  let css = collectCss();
  const joined = pagesHtml.join('\n');
  const urls = new Set<string>([...findHtmlAssetUrls(joined), ...findCssAssetUrls(css)]);

  const replacements = new Map<string, string>();
  for (const url of urls) {
    const absolute = toAbsolute(url);
    if (!absolute) continue;
    try {
      const res = await fetch(absolute);
      if (!res.ok) continue;
      const blob = await res.blob();
      replacements.set(url, await blobToDataUrl(blob));
    } catch {
      /* An asset that will not load is left as it was: a broken picture in the
         output is easier to diagnose than a silently missing one. */
    }
  }

  for (const [from, to] of replacements) css = css.split(from).join(to);
  const html = pagesHtml.map((page) => {
    let out = page;
    for (const [from, to] of replacements) out = out.split(from).join(to);
    return out;
  });

  void doc;
  return { css, html };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The markup has to come out as XML, not HTML.
 *
 * `foreignObject` content is parsed by the XML parser, which stops at the first
 * `<br>` or `<img>` that never closes — and the failure arrives as an image that
 * will not load, with nothing said about why. So the page is parsed as HTML into
 * a real tree and serialised back out as XML, which closes those tags properly.
 *
 * The design variables live on the page host, and renderPagesToHtml returns the
 * host's innerHTML, so they are not in the markup and have to be put back.
 */
type Box = Pick<PageGeometry, 'width' | 'height'>;

function buildSvg(pageHtml: string, css: string, geometry: Box, doc: DocModule): string {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(geometry.width));
  svg.setAttribute('height', String(geometry.height));
  svg.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`);

  const foreign = document.createElementNS(SVG_NS, 'foreignObject');
  foreign.setAttribute('x', '0');
  foreign.setAttribute('y', '0');
  foreign.setAttribute('width', String(geometry.width));
  foreign.setAttribute('height', String(geometry.height));

  const wrapper = document.createElementNS(XHTML_NS, 'div');
  const vars = doc.design ? designToCssVars(doc.design) : null;
  const declarations = vars
    ? Object.entries(vars)
        .map(([name, value]) => `${name}:${value}`)
        .join(';')
    : '';
  wrapper.setAttribute(
    'style',
    `${declarations};width:${geometry.width}px;height:${geometry.height}px`,
  );

  const style = document.createElementNS(XHTML_NS, 'style');
  style.appendChild(document.createTextNode(css));
  wrapper.appendChild(style);

  // A page sized by `height: 100%` measures against this box; without a height
  // of its own the page collapses to its content, and whatever it placed
  // against its foot — a footer, a centred closing, a cover's title — moves up.
  const content = document.createElementNS(XHTML_NS, 'div');
  content.setAttribute('style', 'width:100%;height:100%');
  content.setAttribute(PAGE_ATTR, '');
  content.innerHTML = pageHtml;
  wrapper.appendChild(content);

  foreign.appendChild(wrapper);
  svg.appendChild(foreign);
  return new XMLSerializer().serializeToString(svg);
}

/**
 * SVG → canvas → PNG.
 *
 * The SVG goes in as a `data:` URI, not a `blob:` one. Chrome taints a canvas
 * that has been drawn from a blob-backed SVG containing `<foreignObject>`, and
 * refuses to export it; the same markup as a data URI draws and exports fine.
 * Verified against Chrome 151 — a plain SVG is clean either way, so the taint
 * follows the foreignObject and the URL scheme together, not either alone.
 */
async function rasterise(svg: string, geometry: Box): Promise<Blob> {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The page could not be drawn as an image.'));
    image.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(geometry.width * PNG_SCALE);
  canvas.height = Math.round(geometry.height * PNG_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give a 2D canvas.');
  /* A page is paper. A transparent PNG dropped on a dark slide shows black
     body text on black. */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(PNG_SCALE, 0, 0, PNG_SCALE, 0, 0);
  ctx.drawImage(image, 0, 0, geometry.width, geometry.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The canvas produced no image.'))),
      'image/png',
    );
  });
}

/**
 * One element as a PNG, through the same `foreignObject` path as a page — for
 * what a DOCX cannot hold as structure: a chart built from boxes, a compiled
 * diagram whose colours are the document's CSS variables. Pulled out of its
 * page, the element would lose the type it inherits, so that goes round it.
 */
export async function elementToPng(
  el: Element,
  doc: DocModule,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const inherited = getComputedStyle(el);
  // Drawn on its own canvas, the element must start at the canvas's corner.
  // Whatever placed it on the page — absolute offsets, a transform, margins —
  // would otherwise put it off the edge, and the picture comes out blank.
  const clone = el.cloneNode(true) as HTMLElement | SVGElement;
  for (const [name, value] of [
    ['position', 'static'],
    ['inset', 'auto'],
    ['margin', '0'],
    ['transform', 'none'],
    ['width', `${width}px`],
    ['height', `${height}px`],
  ]) {
    clone.style.setProperty(name as string, value as string);
  }
  const wrapped =
    `<div style="font-family:${inherited.fontFamily.replace(/"/g, "'")};color:${inherited.color};` +
    `font-size:${inherited.fontSize};line-height:${inherited.lineHeight};width:${width}px">${clone.outerHTML}</div>`;
  const { css, html } = await embedAssets([wrapped], doc);
  const svg = buildSvg(html[0] ?? '', css, { width, height }, doc);
  const blob = await rasterise(svg, { width, height });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

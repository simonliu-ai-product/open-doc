/**
 * Page content as a picture — SVG, and PNG rasterised from it.
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
import { findCssAssetUrls, findHtmlAssetUrls, toAbsolute } from './export-dom';
import type { DocModule } from './sdk';

type Size = { width: number; height: number };

/**
 * Rasterised at twice the CSS size. A page printed at 1x is legible on screen
 * and disappointing everywhere else — the moment someone drops it into a slide
 * the text is soft. Twice is the cheapest size that survives that.
 */
const SCALE = 2;

const FETCHES = 8;

/** Every asset the markup and the stylesheet reference, fetched and inlined as a `data:` URI. */
export async function inlineAssets(
  sourceCss: string,
  pagesHtml: string[],
): Promise<{ css: string; html: string[] }> {
  const joined = pagesHtml.join('\n');
  const urls = new Set<string>([...findHtmlAssetUrls(joined), ...findCssAssetUrls(sourceCss)]);

  const replacements = new Map<string, string>();
  const queue = [...urls];
  const fetchNext = async (): Promise<void> => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      const absolute = toAbsolute(url);
      if (!absolute) continue;
      try {
        const res = await fetch(absolute);
        if (!res.ok) continue;
        replacements.set(url, await blobToDataUrl(await res.blob()));
      } catch {
        /* An asset that will not load is left as it was: a broken picture in the
           output is easier to diagnose than a silently missing one. */
      }
    }
  };
  // A few at a time. A self-hosted CJK family lists a thousand-odd subsets, and
  // fetched all at once they exhaust Chromium's per-renderer request limit: the
  // tail fails, and those glyphs silently fall back to another face.
  await Promise.all(Array.from({ length: Math.min(FETCHES, queue.length) }, fetchNext));
  if (replacements.size === 0) return { css: sourceCss, html: pagesHtml };

  // One pass over each string. Replacing URL by URL rescans text that grows
  // with every inlined font — quadratic once a CJK family brings hundreds.
  const pattern = new RegExp(
    [...replacements.keys()]
      .sort((a, b) => b.length - a.length)
      .map((url) => url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'g',
  );
  const inline = (text: string) => text.replace(pattern, (url) => replacements.get(url) ?? url);
  return { css: inline(sourceCss), html: pagesHtml.map(inline) };
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
 * The design variables live on the page host, and renderPagesToHtml returns the
 * host's innerHTML, so they are not in the markup and have to be put back.
 */
export function designDeclarations(doc: DocModule): string {
  const vars = doc.design ? designToCssVars(doc.design) : null;
  return vars
    ? Object.entries(vars)
        .map(([name, value]) => `${name}:${value}`)
        .join(';')
    : '';
}

/**
 * The markup has to come out as XML, not HTML.
 *
 * `foreignObject` content is parsed by the XML parser, which stops at the first
 * `<br>` or `<img>` that never closes — and the failure arrives as an image that
 * will not load, with nothing said about why. So the page is parsed as HTML into
 * a real tree and serialised back out as XML, which closes those tags properly.
 */
export function htmlToSvg(pageHtml: string, css: string, size: Size, declarations: string): string {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size.width));
  svg.setAttribute('height', String(size.height));
  svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);

  const foreign = document.createElementNS(SVG_NS, 'foreignObject');
  foreign.setAttribute('x', '0');
  foreign.setAttribute('y', '0');
  foreign.setAttribute('width', String(size.width));
  foreign.setAttribute('height', String(size.height));

  const wrapper = document.createElementNS(XHTML_NS, 'div');
  wrapper.setAttribute('style', `${declarations};width:${size.width}px;height:${size.height}px`);

  const style = document.createElementNS(XHTML_NS, 'style');
  style.appendChild(document.createTextNode(css));
  wrapper.appendChild(style);

  const content = document.createElementNS(XHTML_NS, 'div');
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
export async function rasterise(svg: string, size: Size): Promise<Blob> {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The page could not be drawn as an image.'));
    image.src = source;
  });
  return drawToPng(image, size);
}

export async function drawToPng(image: CanvasImageSource, size: Size): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width * SCALE);
  canvas.height = Math.round(size.height * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give a 2D canvas.');
  /* A page is paper. A transparent PNG dropped on a dark slide shows black
     body text on black. */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.drawImage(image, 0, 0, size.width, size.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The canvas produced no image.'))),
      'image/png',
    );
  });
}

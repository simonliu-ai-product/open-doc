/**
 * Shared by both exporters so there is one way to draw the document offscreen.
 * Two copies would drift on font waiting, scanning, or design variables, and the
 * difference would only ever show up in an exported file.
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { designToCssVars } from './design';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';
import { DocPageProvider } from './page-context';
import { nextFrame, waitForFonts, waitForImages } from './print-ready';
import { captureScan, restoreScan, scanDocument } from './scan';
import type { DocModule, PageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export const ASSET_EXT_RE =
  /\.(?:png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf)(?:\?[^#]*)?(?:#.*)?$/i;

export async function renderPagesToHtml(
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

/**
 * The document as a Word file Word can reflow.
 *
 * A PDF reproduces the sheets; a .docx must not, or the first edit breaks it.
 * So every flow section is laid out again as one continuous column — no page
 * breaks, no repeated footers, no top margins stripped at the head of a sheet —
 * with each block still answering as the sheet it printed on, and that copy is
 * scanned and read.
 */

import { createElement, type ReactNode } from 'react';
import { FlowPage } from '../components/flow-page';
import { defaultDesign } from './design';
import { type ExtractSource, extractDocument } from './docx/extract';
import { halfPoints, twipsFromMm } from './docx/units';
import { DOCX_MIME, writeDocx } from './docx/write';
import { collectCss, downloadBundle, type FileBundle, mountOffscreen, pacer } from './export-dom';
import { designDeclarations, htmlToSvg, inlineAssets, rasterise } from './rasterize';
import { type DocModule, resolvePageGeometry } from './sdk';
import type { ExpandedPage, FlowSlice } from './use-doc-pages';

export type DocxExportProgress = {
  phase: 'rendering' | 'reading' | 'writing' | 'done';
  percent: number;
};

/**
 * Page numbers no real footer prints. A running footer is drawn once more with
 * these, and each one becomes a PAGE or NUMPAGES field.
 */
const SENTINELS = { page: 38271, count: 69154 };

type FlowGroup = FlowSlice & {
  kind: 'flow';
  index: number;
  /** How many sheets the section printed on. */
  pages: number;
  /** Block index → the sheet it printed on. */
  sheets: Map<number, number>;
};

type Group = { kind: 'fixed'; index: number; page: ExpandedPage } | FlowGroup;

/** Consecutive sheets of one flow section become one run of blocks again. */
function groupPages(pages: ExpandedPage[]): Group[] {
  const groups: Group[] = [];
  pages.forEach((page, index) => {
    const slice = page.flow;
    if (!slice) {
      groups.push({ kind: 'fixed', index, page });
      return;
    }
    const last = groups[groups.length - 1];
    let group: FlowGroup;
    if (last?.kind === 'flow' && last.entry === slice.entry) {
      group = last;
    } else {
      group = {
        ...slice,
        kind: 'flow',
        index,
        pages: 0,
        blockIndices: [],
        notes: [],
        sheets: new Map(),
      };
      groups.push(group);
    }
    group.pages += 1;
    group.blockIndices.push(...slice.blockIndices);
    group.notes.push(...slice.notes);
    for (const block of slice.blockIndices) group.sheets.set(block, index);
  });
  return groups;
}

function mountCopy(doc: DocModule, pages: ExpandedPage[], onProgress: (percent: number) => void) {
  const total = pages.length;
  return mountOffscreen(doc, async (mount, pace) => {
    const sheet = (node: ReactNode, index: number, frame: boolean) =>
      mount(node, { index, total }, { frame: frame ? index : undefined, sheet: true, paint: true });
    // A running header or footer reads the page number, so it is drawn again
    // with sentinels in place of the real ones.
    const sentinel = (node: ReactNode) =>
      mount(
        node,
        { index: SENTINELS.page - 1, total: SENTINELS.count },
        { sheet: true, paint: true },
      );

    const sources: ExtractSource[] = [];
    const groups = groupPages(pages);
    for (const [done, group] of groups.entries()) {
      if (group.kind === 'fixed') {
        const { content } = group.page;
        sources.push({
          kind: 'fixed',
          page: group.index + 1,
          host: sheet(content, group.index, true),
          sentinel: sentinel(content),
        });
      } else {
        const { section } = group;
        const body = createElement(FlowPage, {
          section: { ...section, footer: undefined },
          design: doc.design,
          blocks: group.blocks,
          blockIndices: group.blockIndices,
          notes: group.notes,
          sheets: group.sheets,
        });
        const footer = createElement(FlowPage, { section, design: doc.design, blockIndices: [] });
        sources.push({
          kind: 'flow',
          page: group.index + 1,
          // Not a frame itself: its blocks are, each as the sheet it printed on.
          host: mount(body, { index: group.index, total }, { paint: true }),
          // Drawn for the first sheet and the next: a footer hidden or different
          // on the opening page is Word's first-page footer, not the running one.
          footer: section.footer && {
            sentinel: sentinel(footer),
            first: sheet(footer, group.index, false),
            next: group.pages > 1 ? sheet(footer, group.index + 1, false) : undefined,
          },
        });
      }
      onProgress(Math.round(((done + 1) / groups.length) * 40));
      await pace();
    }
    return sources;
  });
}

/** Properties a drawing inherits from where it sits, and loses when drawn out of place. */
const INHERITED = [
  'color',
  'direction',
  'font-family',
  'font-feature-settings',
  'font-size',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'hyphens',
  'letter-spacing',
  'line-height',
  'overflow-wrap',
  'tab-size',
  'text-align',
  'text-indent',
  'text-transform',
  'white-space',
  'word-break',
  'word-spacing',
  'writing-mode',
];

/** One element, drawn as a picture of itself with the page's stylesheet and fonts. */
function rasterizer(doc: DocModule): (el: Element) => Promise<Uint8Array | null> {
  let css: Promise<string> | null = null;
  const design = designDeclarations(doc);
  // The same drawing in the same place — a logo in every section's footer — is drawn once.
  const drawn = new Map<string, Promise<Uint8Array | null>>();
  const draw = async (html: string, size: { width: number; height: number }, style: string) => {
    try {
      css ??= inlineAssets(collectCss(), []).then((result) => result.css);
      const sheet = await css;
      const { html: inlined } = await inlineAssets('', [html]);
      const svg = htmlToSvg(inlined[0] ?? '', sheet, size, style);
      return new Uint8Array(await (await rasterise(svg, size)).arrayBuffer());
    } catch {
      return null;
    }
  };
  return (el) => {
    const { width, height } = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const clone = el.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, {
      margin: '0',
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: 'border-box',
    });
    // The picture's box is where it was drawn; offsets and transforms would move
    // it again inside that box, and out of the picture.
    if (cs.position !== 'static')
      Object.assign(clone.style, { position: 'relative', inset: 'auto' });
    if (
      cs.transform !== 'none' ||
      cs.translate !== 'none' ||
      cs.rotate !== 'none' ||
      cs.scale !== 'none'
    ) {
      Object.assign(clone.style, {
        transform: 'none',
        translate: 'none',
        rotate: 'none',
        scale: 'none',
      });
    }
    // A clone's canvases are blank: their pixels go along as pictures.
    const canvases = el.querySelectorAll('canvas');
    try {
      clone.querySelectorAll('canvas').forEach((copy, i) => {
        const canvas = canvases[i];
        const box = canvas.getBoundingClientRect();
        const picture = document.createElement('img');
        picture.src = canvas.toDataURL();
        picture.setAttribute('style', copy.getAttribute('style') ?? '');
        picture.className = copy.className;
        Object.assign(picture.style, { width: `${box.width}px`, height: `${box.height}px` });
        copy.replaceWith(picture);
      });
    } catch {
      // A canvas drawn from another origin cannot be read back.
      return Promise.resolve(null);
    }
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const inherited = parent
      ? [...INHERITED, ...Array.from(parent).filter((name) => name.startsWith('--'))]
          .map((name) => `${name}:${parent.getPropertyValue(name)}`)
          .join(';')
      : '';
    const style = `${design};${inherited}`;
    const html = clone.outerHTML;
    const key = `${width}x${height}\n${style}\n${html}`;
    let picture = drawn.get(key);
    if (!picture) {
      picture = draw(html, { width, height }, style);
      drawn.set(key, picture);
    }
    return picture;
  };
}

export async function buildDocxBundle(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
  onProgress?: (progress: DocxExportProgress) => void,
): Promise<FileBundle | null> {
  if (pages.length === 0) return null;
  const report = (phase: DocxExportProgress['phase'], percent: number) =>
    onProgress?.({ phase, percent });

  try {
    const copy = await mountCopy(doc, pages, (percent) => report('rendering', percent));
    const [across, down] = resolvePageGeometry(doc.meta).mm;
    const pace = pacer();
    const extracted = await extractDocument({
      sources: copy.value,
      sheet: { width: twipsFromMm(across), height: twipsFromMm(down) },
      margin: doc.design?.margin ?? defaultDesign.margin,
      sentinels: SENTINELS,
      pageCount: pages.length,
      rasterize: rasterizer(doc),
      onSection: (done, total) => {
        report('reading', 45 + Math.round((done / total) * 45));
        return pace();
      },
    }).finally(copy.dispose);

    report('writing', 90);
    const scale = doc.design?.typeScale;
    const bytes = writeDocx({
      title: doc.meta?.title ?? docId,
      subject: doc.meta?.subtitle,
      author: doc.meta?.author,
      created: doc.meta?.createdAt,
      headingSizes: scale && [scale.h1, scale.h2, scale.h3].map(halfPoints),
      ...extracted,
    });
    return { filename: `${docId}.docx`, mimeType: DOCX_MIME, bytes };
  } finally {
    report('done', 100);
  }
}

export async function exportDocAsDocx(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
  onProgress?: (progress: DocxExportProgress) => void,
): Promise<void> {
  const bundle = await buildDocxBundle(doc, docId, pages, onProgress);
  if (bundle) downloadBundle(bundle);
}

/**
 * The document as a .docx — structure Word flows itself, for review that runs
 * on Word: track changes, comments, pasting a section into someone else's
 * template. Page-for-page fidelity is not the aim; Word repaginates the moment
 * anyone types, so what has to survive is the structure.
 *
 * The browser downloads it; the headless exporter writes it to disk through
 * the bridge. Both call `buildDocDocx`, so there is one way to make one.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { type DesignSystem, defaultDesign, designToCssVars } from './design';
import { docxFromPages, lineOf, type PageInfo, type StyleBaseline } from './docx/from-dom';
import {
  buildDocxParts,
  type DocxModel,
  fontsFor,
  hexColor,
  type Inline,
  type Paragraph,
  PX_TO_HALF_POINTS,
  PX_TO_TWIPS,
  type StyleId,
} from './docx/ooxml';
import { downloadBlob, withRenderedPages } from './export-dom';
import { type DocEntry, type FlowSection, isFlowSection } from './flow';
import { DocPageProvider } from './page-context';
import { nextFrame, waitForFonts } from './print-ready';
import { type DocModule, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export type DocxBundle = { filename: string; mimeType: string; bytes: Uint8Array };

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Page numbers no document prints, so the footer can be drawn once and every
// place a number landed found again and handed to Word as a field.
const PAGE_SENTINEL = 97_531;
const TOTAL_SENTINEL = 86_420;

/** A flow page after the first of its section continues it; everything else starts a sheet. */
function pageInfo(pages: ExpandedPage[]): PageInfo[] {
  return pages.map((page, at) => {
    const flow = /^f(\d+)-(\d+)$/.exec(page.key);
    const previous = /^f(\d+)-/.exec(pages[at - 1]?.key ?? '');
    return { continues: Boolean(flow && previous && previous[1] === flow[1]) };
  });
}

function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}

function baselines(design: DesignSystem): Record<StyleId, StyleBaseline> {
  const text = hexColor(design.palette.text) ?? '000000';
  const muted = hexColor(design.palette.muted) ?? text;
  const size = (px: number) => Math.round(px * PX_TO_HALF_POINTS);
  const plain = { color: text, bold: false, italic: false };
  const heading = (px: number) => ({
    halfPoints: size(px),
    color: text,
    bold: true,
    italic: false,
  });
  const { typeScale } = design;
  return {
    Normal: { ...plain, halfPoints: size(typeScale.body) },
    ListParagraph: { ...plain, halfPoints: size(typeScale.body) },
    Title: heading(typeScale.title),
    Heading1: heading(typeScale.h1),
    Heading2: heading(typeScale.h2),
    Heading3: heading(typeScale.h3),
    Heading4: heading(Math.max(typeScale.body, (typeScale.h3 + typeScale.body) / 2)),
    Heading5: heading(typeScale.body),
    Heading6: { ...heading(typeScale.body), color: muted },
    Caption: { ...plain, color: muted, halfPoints: size(typeScale.caption) },
    Code: { ...plain, halfPoints: Math.max(12, size(typeScale.body) - 2) },
    Quote: { ...plain, color: muted, italic: true, halfPoints: size(typeScale.body) },
    FootnoteText: { ...plain, color: muted, halfPoints: size(typeScale.caption) },
    TOCHeading: heading(typeScale.h1),
  };
}

/**
 * The first flow section's footer, as a Word footer. It is drawn once with
 * sentinel page numbers, and wherever a sentinel landed the text becomes a
 * PAGE or NUMPAGES field — so Word numbers the pages it lays out, not the ones
 * open-doc did.
 */
async function footerOf(
  doc: DocModule,
  design: DesignSystem,
  width: number,
  walk: Parameters<typeof lineOf>[1],
): Promise<Paragraph | undefined> {
  const section = ((doc.default ?? []) as DocEntry[]).find(
    (entry): entry is FlowSection => isFlowSection(entry) && Boolean(entry.footer),
  );
  const Footer = section?.footer;
  if (!Footer) return undefined;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // The sheet's base styles (styles.css), so the footer reads as it prints.
  host.setAttribute('data-od-measure', '');
  Object.assign(host.style, { position: 'fixed', left: '-99999px', top: '0', width: `${width}px` });
  for (const [name, value] of Object.entries(designToCssVars(design))) {
    host.style.setProperty(name, value);
  }
  host.style.fontFamily = 'var(--od-font-body)';
  host.style.color = 'var(--od-text)';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(
      createElement(
        DocPageProvider,
        { index: PAGE_SENTINEL - 1, total: TOTAL_SENTINEL },
        createElement(Footer),
      ),
    );
    await nextFrame();
    await waitForFonts();
    await nextFrame();
    const target = host.firstElementChild;
    const line = target ? await lineOf(target, walk) : null;
    if (!line) return undefined;
    const fields = (inlines: Inline[]): Inline[] =>
      inlines.flatMap((inline): Inline[] => {
        if (inline.type !== 'text') return [inline];
        return inline.text
          .split(new RegExp(`(${PAGE_SENTINEL}|${TOTAL_SENTINEL})`))
          .filter((piece) => piece !== '')
          .map(
            (piece): Inline =>
              piece === String(PAGE_SENTINEL)
                ? { type: 'field', instr: 'PAGE', cached: '1' }
                : piece === String(TOTAL_SENTINEL)
                  ? { type: 'field', instr: 'NUMPAGES', cached: '1' }
                  : { ...inline, text: piece },
          );
      });
    return { ...line, inlines: fields(line.inlines) };
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function buildDocDocx(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
): Promise<DocxBundle | null> {
  if (pages.length === 0) return null;
  const geometry = resolvePageGeometry(doc.meta);
  const design = (doc.design as DesignSystem | undefined) ?? defaultDesign;
  const textWidth = geometry.width - design.margin * 2;
  const walk = {
    doc,
    textWidth,
    baselines: baselines(design),
    monoFamilies: [firstFamily(design.fonts.mono)].filter((family) => family !== ''),
    margin: design.margin,
  };

  const content = await withRenderedPages(pages, geometry, doc, (hosts, container) =>
    docxFromPages(hosts, pageInfo(pages), container, walk),
  );
  const footer = await footerOf(doc, design, textWidth, walk);

  const size = (px: number) => Math.round(px * PX_TO_HALF_POINTS);
  const text = hexColor(design.palette.text) ?? '000000';
  const model: DocxModel = {
    title: doc.meta?.title ?? docId,
    ...(doc.meta?.author ? { author: doc.meta.author } : {}),
    page: {
      width: geometry.width * PX_TO_TWIPS,
      height: geometry.height * PX_TO_TWIPS,
      landscape: geometry.width > geometry.height,
      margin: design.margin * PX_TO_TWIPS,
    },
    fonts: {
      body: fontsFor(design.fonts.body, 'sans'),
      heading: fontsFor(design.fonts.heading, 'sans'),
      mono: fontsFor(design.fonts.mono, 'mono'),
    },
    sizes: {
      title: size(design.typeScale.title),
      h1: size(design.typeScale.h1),
      h2: size(design.typeScale.h2),
      h3: size(design.typeScale.h3),
      body: size(design.typeScale.body),
      caption: size(design.typeScale.caption),
    },
    colors: {
      text,
      muted: hexColor(design.palette.muted) ?? text,
      accent: hexColor(design.palette.accent) ?? text,
    },
    line: design.leading * design.typeScale.body * PX_TO_TWIPS,
    ...content,
    ...(footer ? { footer } : {}),
  };

  const parts = buildDocxParts(model);
  const { zipSync, strToU8 } = await import('fflate');
  const tree: Record<string, Uint8Array> = {};
  for (const [name, part] of Object.entries(parts)) {
    tree[name] = typeof part === 'string' ? strToU8(part) : part;
  }
  return { filename: `${docId}.docx`, mimeType: DOCX_MIME, bytes: zipSync(tree) };
}

export async function exportDocAsDocx(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
): Promise<void> {
  const bundle = await buildDocDocx(doc, docId, pages);
  if (!bundle) return;
  downloadBlob(new Blob([bundle.bytes as BlobPart], { type: bundle.mimeType }), bundle.filename);
}

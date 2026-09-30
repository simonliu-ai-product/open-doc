/*
 * The rendered pages, read back as a document Word can flow.
 *
 * This works on the offscreen print copy at true sheet size, the same tree the
 * PDF and HTML exporters serialise, and reads *computed* styles rather than
 * tags: documents here are styled inline, so a heading is bold because of a
 * `fontWeight` in a style object, not because it is an `<h1>`. The tags still
 * decide structure — headings, tables, lists — because that is what Word's
 * navigation, table tools and numbering work from.
 *
 * What has no structure to give — a chart drawn with boxes, a compiled diagram
 * — is drawn to a PNG and placed as a picture: it cannot be edited in Word,
 * but it is there, and nothing around it has to be retyped.
 */

import { FLOW_BLOCK_ATTR } from '../../components/flow-page';
import { FOOTNOTE_ID_ATTR } from '../../components/footnote';
import { elementToPng } from '../export-image';
import { LABEL_ATTR, LABEL_ID_ATTR } from '../labels';
import type { DocModule } from '../sdk';
import {
  type Block,
  hexColor,
  type ImagePart,
  type Inline,
  type Paragraph,
  PX_TO_EMU,
  PX_TO_HALF_POINTS,
  PX_TO_TWIPS,
  type Run,
  type StyleId,
  type Table,
  type TableCell,
  type TextRun,
} from './ooxml';

/** What each Word style already says, so a run only carries what differs. */
export type StyleBaseline = { halfPoints: number; color: string; bold: boolean; italic: boolean };

export type WalkOptions = {
  doc: DocModule;
  /** Width of the text block, px — images are scaled to fit it. */
  textWidth: number;
  baselines: Record<StyleId, StyleBaseline>;
  /** Lower-cased family names that mean "set in the mono font". */
  monoFamilies: string[];
  /** The page margin Word's section uses, px. */
  margin: number;
};

export type PageInfo = {
  /** A flow page after the first of its section continues it — no break before. */
  continues: boolean;
};

export type WalkResult = {
  blocks: Block[];
  footnotes: Array<{ id: number; paragraphs: Paragraph[] }>;
  images: ImagePart[];
  lists: Array<'bullet' | 'decimal'>;
  finalFooter: boolean;
};

type Ctx = WalkOptions & {
  images: ImagePart[];
  lists: Array<'bullet' | 'decimal'>;
  /** Note id on the page → Word's numeric id, in order of first reference. */
  notes: Map<string, number>;
  container: HTMLElement;
  page: { top: number; bottom: number; fixed: boolean; first: boolean };
};

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL',
]);

const INLINE_DISPLAYS = new Set([
  'inline',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'contents',
]);

const STRUCTURE = 'p,h1,h2,h3,h4,h5,h6,table,ul,ol,pre,blockquote';

/** Where each block sat on its sheet, for fixed pages whose layout is by position. */
const placed = new WeakMap<Block, { top: number; bottom: number }>();

function place(block: Block, box: { top: number; bottom: number }) {
  if (!placed.has(block)) placed.set(block, { top: box.top, bottom: box.bottom });
}

function isHidden(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const style = getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/**
 * A fixed page draws its own running header and footer, as absolutely placed
 * short lines at the sheet's top or bottom edge. Word has headers and footers
 * of its own, so these would otherwise repeat as body text on every page.
 */
function isRunningLine(el: Element, ctx: Ctx): boolean {
  if (!ctx.page.fixed) return false;
  const position = getComputedStyle(el).position;
  if (position !== 'absolute' && position !== 'fixed') return false;
  // A running line is words. A logo placed at the top of a cover is the cover.
  const text = (el.textContent ?? '').trim();
  if (text === '' || text.length > 120) return false;
  const rect = el.getBoundingClientRect();
  const height = ctx.page.bottom - ctx.page.top;
  return rect.bottom <= ctx.page.top + height * 0.12 || rect.top >= ctx.page.bottom - height * 0.12;
}

function skip(el: Element, ctx: Ctx): boolean {
  return el.hasAttribute('data-od-footnotes') || isHidden(el) || isRunningLine(el, ctx);
}

function isBlock(el: Element): boolean {
  if (el instanceof SVGElement) return false;
  if (BLOCK_TAGS.has(el.tagName)) return !INLINE_DISPLAYS.has(getComputedStyle(el).display);
  return !INLINE_DISPLAYS.has(getComputedStyle(el).display);
}

function hasBlockChild(el: Element, ctx: Ctx): boolean {
  return Array.from(el.children).some((child) => !skip(child, ctx) && isBlock(child));
}

function align(el: Element): Paragraph['align'] {
  const value = getComputedStyle(el).textAlign;
  if (value === 'center') return 'center';
  if (value === 'right' || value === 'end') return 'right';
  if (value === 'justify') return 'both';
  return undefined;
}

function spacing(el: Element): Pick<Paragraph, 'spacingBefore' | 'spacingAfter'> {
  const style = getComputedStyle(el);
  return {
    spacingBefore: (Number.parseFloat(style.marginTop) || 0) * PX_TO_TWIPS,
    spacingAfter: (Number.parseFloat(style.marginBottom) || 0) * PX_TO_TWIPS,
  };
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

function textRun(
  text: string,
  host: Element,
  base: StyleBaseline,
  ctx: Ctx,
  linked: boolean,
): TextRun {
  const style = getComputedStyle(host);
  const run: TextRun = { type: 'text', text };
  const weight = Number.parseInt(style.fontWeight, 10) || 400;
  const bold = weight >= 600;
  if (bold !== base.bold) run.bold = bold;
  const italic = style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique');
  if (italic !== base.italic) run.italic = italic;
  const decoration = style.textDecorationLine;
  if (!linked && decoration.includes('underline')) run.underline = true;
  if (decoration.includes('line-through')) run.strike = true;
  if (style.textTransform === 'uppercase') run.caps = true;
  const tracking = Number.parseFloat(style.letterSpacing);
  if (tracking) run.tracking = tracking * PX_TO_TWIPS;
  const family = style.fontFamily.toLowerCase();
  if (family.includes('monospace') || ctx.monoFamilies.some((mono) => family.includes(mono))) {
    run.mono = true;
  }
  const color = hexColor(style.color);
  if (!linked && color && color !== base.color) run.color = color;
  const halfPoints = Math.round((Number.parseFloat(style.fontSize) || 0) * PX_TO_HALF_POINTS);
  if (halfPoints > 0 && Math.abs(halfPoints - base.halfPoints) >= 1) run.halfPoints = halfPoints;
  const vertical = style.verticalAlign;
  if (host.closest('sup') || vertical === 'super') run.vert = 'superscript';
  else if (host.closest('sub') || vertical === 'sub') run.vert = 'subscript';
  return run;
}

async function imageFrom(el: Element, ctx: Ctx): Promise<string | null> {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  let bytes: Uint8Array | null = null;
  let ext: ImagePart['ext'] = 'png';
  if (el instanceof HTMLImageElement) {
    try {
      const res = await fetch(el.currentSrc || el.src);
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && /image\/(png|jpeg|gif)/.test(type)) {
        bytes = new Uint8Array(await res.arrayBuffer());
        ext = type.includes('jpeg') ? 'jpeg' : type.includes('gif') ? 'gif' : 'png';
      }
    } catch {
      /* Falls through to drawing it, which embeds the source itself. */
    }
  }
  if (!bytes) {
    try {
      bytes = (await elementToPng(el, ctx.doc)).bytes;
      ext = 'png';
    } catch {
      return null;
    }
  }
  const scale = Math.min(1, ctx.textWidth / rect.width);
  const name = `image${ctx.images.length + 1}`;
  ctx.images.push({
    name,
    ext,
    bytes,
    width: rect.width * scale * PX_TO_EMU,
    height: rect.height * scale * PX_TO_EMU,
  });
  return name;
}

function collapse(text: string, host: Element): string {
  const whiteSpace = getComputedStyle(host).whiteSpace;
  return whiteSpace.startsWith('pre') || whiteSpace === 'break-spaces'
    ? text
    : text.replace(/\s+/g, ' ');
}

async function inlinesOf(
  nodes: Node[],
  base: StyleBaseline,
  ctx: Ctx,
  linked = false,
): Promise<Inline[]> {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const host = node.parentElement;
      if (!host) continue;
      const raw = collapse(node.nodeValue ?? '', host);
      if (raw === '') continue;
      // Newlines survive only where whitespace is kept, and there they break the line.
      raw.split('\n').forEach((line, at) => {
        if (at > 0) out.push({ type: 'break' });
        // A tab inside a text run is not a tab to Word; it has an element of its own.
        line.split('\t').forEach((piece, step) => {
          if (step > 0) out.push({ type: 'tab' });
          if (piece !== '') out.push(textRun(piece, host, base, ctx, linked));
        });
      });
      continue;
    }
    if (!(node instanceof Element) || isHidden(node)) continue;
    if (node.hasAttribute('data-od-ref')) {
      // "Table 3" and not "Table 3 (p. 5)": Word repaginates, and the page
      // would be wrong the moment it did.
      out.push(...(await inlinesOf(Array.from(node.childNodes).slice(0, 2), base, ctx, linked)));
    } else if (node.tagName === 'BR') {
      out.push({ type: 'break' });
    } else if (node.getAttribute(LABEL_ATTR) === 'footnote') {
      const key = node.getAttribute(LABEL_ID_ATTR) ?? '';
      if (!ctx.notes.has(key)) ctx.notes.set(key, ctx.notes.size + 1);
      out.push({ type: 'footnote', id: ctx.notes.get(key) as number });
    } else if (node instanceof HTMLImageElement || node instanceof SVGSVGElement) {
      const image = await imageFrom(node, ctx);
      if (image) out.push({ type: 'image', image });
    } else if (node instanceof HTMLAnchorElement && node.getAttribute('href') && !linked) {
      const runs = (await inlinesOf(Array.from(node.childNodes), base, ctx, true)).filter(
        (inline): inline is Run => inline.type !== 'link',
      );
      out.push({ type: 'link', href: node.getAttribute('href') as string, runs });
    } else {
      out.push(...(await inlinesOf(Array.from(node.childNodes), base, ctx, linked)));
    }
  }
  return out;
}

/** Trims the whitespace a browser would not draw: at either end, and doubled between runs. */
function tidy(inlines: Inline[]): Inline[] {
  const texts: TextRun[] = [];
  const visit = (list: Inline[]) => {
    for (const inline of list) {
      if (inline.type === 'text') texts.push(inline);
      else if (inline.type === 'link') visit(inline.runs);
      else if (inline.type === 'break') texts.push({ type: 'text', text: '\n' });
    }
  };
  visit(inlines);
  let previous = '\n';
  for (const run of texts) {
    if (run.text === '\n') {
      previous = '\n';
      continue;
    }
    if (previous.endsWith(' ') || previous === '\n') run.text = run.text.replace(/^ +/, '');
    if (run.text !== '') previous = run.text;
  }
  for (let at = texts.length - 1; at >= 0; at--) {
    const run = texts[at] as TextRun;
    if (run.text === '\n') break;
    run.text = run.text.replace(/ +$/, '');
    if (run.text !== '') break;
  }
  const keep = (inline: Inline): boolean =>
    inline.type === 'text'
      ? inline.text !== ''
      : inline.type === 'link'
        ? inline.runs.some(keep)
        : true;
  return inlines
    .filter(keep)
    .map((inline) =>
      inline.type === 'link' ? { ...inline, runs: inline.runs.filter(keep) as Run[] } : inline,
    );
}

function hasContent(inlines: Inline[]): boolean {
  return inlines.some((inline) => inline.type !== 'break');
}

async function paragraphOf(
  nodes: Node[],
  style: StyleId,
  from: Element,
  ctx: Ctx,
  extra: Partial<Paragraph> = {},
): Promise<Paragraph | null> {
  const raw = await inlinesOf(nodes, ctx.baselines[style], ctx);
  // Code keeps its spaces: indentation is the content there.
  const inlines =
    style === 'Code'
      ? raw.filter((inline) => inline.type !== 'text' || inline.text !== '')
      : tidy(raw);
  if (!hasContent(inlines)) return null;
  const paragraph: Paragraph = { type: 'paragraph', inlines, ...spacing(from), ...extra };
  if (style !== 'Normal') paragraph.style = style;
  const alignment = align(from);
  if (alignment) paragraph.align = alignment;
  return paragraph;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

async function blocksOf(el: Element, ctx: Ctx, out: Block[], style: StyleId = 'Normal') {
  let buffer: Node[] = [];
  const flush = async () => {
    if (buffer.length === 0) return;
    const paragraph = await paragraphOf(buffer, style, el, ctx);
    if (paragraph) {
      const range = document.createRange();
      range.setStartBefore(buffer[0] as Node);
      range.setEndAfter(buffer[buffer.length - 1] as Node);
      place(paragraph, range.getBoundingClientRect());
      out.push(paragraph);
    }
    buffer = [];
  };
  for (const child of Array.from(el.childNodes)) {
    if (child instanceof Element) {
      if (skip(child, ctx)) continue;
      if (isBlock(child)) {
        await flush();
        await blockOf(child, ctx, out, style);
        continue;
      }
    }
    buffer.push(child);
  }
  await flush();
}

/** A row of short pieces side by side — a running footer, a contents line — as one line with a tab. */
function isTabbedRow(el: Element, ctx: Ctx): boolean {
  const style = getComputedStyle(el);
  if (!style.display.includes('flex') || style.flexDirection.startsWith('column')) return false;
  const children = Array.from(el.children).filter((child) => !skip(child, ctx));
  return children.length > 1 && children.every((child) => !hasBlockChild(child, ctx));
}

async function blockOf(el: Element, ctx: Ctx, out: Block[], style: StyleId) {
  const start = out.length;
  await blockOfElement(el, ctx, out, style);
  const box = el.getBoundingClientRect();
  for (const block of out.slice(start)) place(block, box);
}

async function blockOfElement(el: Element, ctx: Ctx, out: Block[], style: StyleId) {
  const tag = el.tagName;
  // A picture laid out as a block — placed absolutely, or set to display:
  // block — has no children to make a paragraph from; it is the paragraph.
  if (el instanceof HTMLImageElement || el instanceof SVGSVGElement) {
    const image = await imageFrom(el, ctx);
    if (image) out.push({ type: 'paragraph', inlines: [{ type: 'image', image }] });
    return;
  }
  if (el.hasAttribute('data-od-toc')) {
    out.push(tocOf(el, ctx));
    return;
  }
  if (el.hasAttribute('data-od-list-of')) {
    for (const row of Array.from(el.children)) {
      const pieces = Array.from(row.children).filter((piece) => !isHidden(piece));
      const inlines: Inline[] = [];
      for (const [at, piece] of pieces.slice(0, 2).entries()) {
        if (at > 0) inlines.push({ type: 'text', text: ' ' });
        inlines.push(...(await inlinesOf([piece], ctx.baselines.Normal, ctx)));
      }
      const tidied = tidy(inlines);
      if (!hasContent(tidied)) continue;
      // The page is a PAGEREF to the caption's bookmark: Word works it out
      // again as it paginates, and an app that does not update fields shows
      // the page open-doc printed it on.
      const entry = row.getAttribute('data-od-list-entry');
      const page = pieces.length > 2 ? (pieces[pieces.length - 1]?.textContent ?? '').trim() : '';
      const paragraph: Paragraph = { type: 'paragraph', inlines: tidied, ...spacing(row) };
      if (entry && page) {
        paragraph.inlines.push(
          { type: 'tab' },
          { type: 'field', instr: `PAGEREF ${bookmarkFor(entry)} \\h`, cached: page },
        );
        paragraph.rightTab = ctx.textWidth * PX_TO_TWIPS;
        paragraph.leader = true;
      }
      out.push(paragraph);
    }
    return;
  }
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    // A heading the outline skips is either the cover's title or a heading the
    // contents should not list — "Contents" itself. Word has a style for each.
    const outlined = el.getAttribute('data-od-outline') !== 'skip';
    const heading: StyleId = outlined
      ? (`Heading${level}` as StyleId)
      : ctx.page.first && level === 1
        ? 'Title'
        : 'TOCHeading';
    const paragraph = await paragraphOf(Array.from(el.childNodes), heading, el, ctx, {
      keepNext: true,
    });
    if (paragraph) out.push(paragraph);
    return;
  }
  if (tag === 'TABLE') {
    out.push(await tableOf(el as HTMLTableElement, ctx));
    return;
  }
  if (tag === 'UL' || tag === 'OL') {
    await listOf(el, ctx, out, 0);
    return;
  }
  if (tag === 'PRE') {
    const paragraph = await paragraphOf(Array.from(el.childNodes), 'Code', el, ctx);
    if (paragraph) out.push(...boxed([paragraph], el));
    return;
  }
  if (tag === 'FIGURE') {
    await figureOf(el, ctx, out);
    return;
  }
  if (tag === 'FIGCAPTION') {
    const paragraph = await paragraphOf(Array.from(el.childNodes), 'Caption', el, ctx);
    if (paragraph) out.push(captioned(paragraph, el));
    return;
  }
  if (tag === 'HR') return;
  if (tag === 'BLOCKQUOTE') {
    const inner: Block[] = [];
    await blocksOf(el, ctx, inner, 'Quote');
    const paragraphs = inner.filter((block): block is Paragraph => block.type === 'paragraph');
    out.push(...(paragraphs.length === inner.length ? boxed(paragraphs, el) : inner));
    return;
  }
  if (isTabbedRow(el, ctx)) {
    const pieces = Array.from(el.children).filter((child) => !skip(child, ctx));
    const inlines: Inline[] = [];
    for (const [at, piece] of pieces.entries()) {
      if (at > 0) inlines.push({ type: 'tab' });
      inlines.push(...tidy(await inlinesOf([piece], ctx.baselines[style], ctx)));
    }
    if (inlines.some((inline) => inline.type !== 'tab')) {
      out.push({
        type: 'paragraph',
        inlines,
        rightTab: ctx.textWidth * PX_TO_TWIPS,
        ...spacing(el),
        ...(style !== 'Normal' ? { style } : {}),
      });
    }
    return;
  }
  if (!hasBlockChild(el, ctx)) {
    const paragraph = await paragraphOf(Array.from(el.childNodes), style, el, ctx);
    if (paragraph) out.push(paragraph);
    return;
  }
  await blocksOf(el, ctx, out, style);
}

function tocOf(el: Element, ctx: Ctx): Block {
  const entries = Array.from(el.querySelectorAll('[data-od-toc-entry]')).map((row) => {
    const id = row.getAttribute('data-od-toc-entry') ?? '';
    const heading = id ? ctx.container.querySelector(`#${CSS.escape(id)}`) : null;
    const level = heading && /^H[1-6]$/.test(heading.tagName) ? Number(heading.tagName[1]) : 1;
    const text = (heading?.textContent ?? row.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { text, level };
  });
  return { type: 'toc', entries };
}

async function listOf(el: Element, ctx: Ctx, out: Block[], level: number) {
  ctx.lists.push(el.tagName === 'OL' ? 'decimal' : 'bullet');
  const numId = ctx.lists.length;
  for (const item of Array.from(el.children)) {
    if (item.tagName !== 'LI' || skip(item, ctx)) continue;
    const nested = Array.from(item.children).filter(
      (child) => child.tagName === 'UL' || child.tagName === 'OL',
    );
    const own = Array.from(item.childNodes).filter(
      (child) => !(child instanceof Element && nested.includes(child)),
    );
    const paragraph = await paragraphOf(own, 'ListParagraph', item, ctx, {
      list: { numId, level },
    });
    if (paragraph) out.push(paragraph);
    for (const list of nested) await listOf(list, ctx, out, level + 1);
  }
}

function border(style: CSSStyleDeclaration, side: 'Top' | 'Left' | 'Bottom' | 'Right') {
  const width = Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`));
  const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
  const color = hexColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`));
  if (!width || kind === 'none' || kind === 'hidden' || !color) return undefined;
  // Eighths of a point; Word draws nothing thinner than a quarter point.
  return { color, size: Math.max(2, Math.round(width * 0.75 * 8)) };
}

/**
 * A block that drew a panel or a rule round itself — a code block's tinted
 * box, a quote's bar — as a one-cell table. A paragraph's own borders would
 * do in Word, but Pages ignores their padding and draws them tight against
 * the text; a cell's fill, borders and margins read the same in both.
 */
function boxed(paragraphs: Paragraph[], el: Element): Block[] {
  const style = getComputedStyle(el);
  const fill = hexColor(style.backgroundColor) ?? undefined;
  const borders: NonNullable<TableCell['borders']> = {};
  for (const side of ['Top', 'Left', 'Bottom', 'Right'] as const) {
    const rule = border(style, side);
    if (rule) borders[side.toLowerCase() as keyof typeof borders] = rule;
  }
  if (!fill && Object.keys(borders).length === 0) return paragraphs;
  const pad = (side: string) =>
    (Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0) * PX_TO_TWIPS;
  const cell: TableCell = {
    blocks: paragraphs.map((paragraph, at) => ({
      ...paragraph,
      spacingBefore: 0,
      spacingAfter: at === paragraphs.length - 1 ? 0 : paragraph.spacingAfter,
      // The cell's margin is the inset now; a quote's own indent would double it.
      indent: 0,
    })),
    borders,
    ...(fill ? { fill } : {}),
    padding: { top: pad('top'), left: pad('left'), bottom: pad('bottom'), right: pad('right') },
  };
  const width = el.getBoundingClientRect().width * PX_TO_TWIPS;
  return [
    {
      type: 'table',
      columns: [width],
      rows: [{ header: false, cells: [cell] }],
      cellMargin: { left: pad('left'), right: pad('right') },
    },
  ];
}

async function tableOf(table: HTMLTableElement, ctx: Ctx): Promise<Table> {
  const rows = Array.from(table.rows);
  const widest = rows.reduce(
    (best, row) => (row.cells.length > (best?.cells.length ?? 0) ? row : best),
    rows[0],
  );
  const widths = Array.from(widest?.cells ?? []).map((cell) => cell.getBoundingClientRect().width);
  const total = widths.reduce((sum, width) => sum + width, 0) || 1;
  const fit = Math.min(1, ctx.textWidth / total);
  const columns = widths.map((width) => width * fit * PX_TO_TWIPS);

  const out: Table = { type: 'table', columns, rows: [] };
  for (const row of rows) {
    const header =
      row.parentElement?.tagName === 'THEAD' ||
      (row.cells.length > 0 && Array.from(row.cells).every((cell) => cell.tagName === 'TH'));
    const cells: TableCell[] = [];
    for (const cell of Array.from(row.cells)) {
      const blocks: Block[] = [];
      await blocksOf(cell, ctx, blocks);
      const paragraphs = blocks
        .filter((block): block is Paragraph => block.type === 'paragraph')
        .map((paragraph) => ({
          ...paragraph,
          spacingBefore: 0,
          spacingAfter: 0,
          ...(align(cell) ? { align: align(cell) } : {}),
        }));
      const style = getComputedStyle(cell);
      const borders: TableCell['borders'] = {};
      for (const side of ['Top', 'Left', 'Bottom', 'Right'] as const) {
        const edge = border(style, side);
        if (edge) borders[side.toLowerCase() as 'top'] = edge;
      }
      cells.push({
        blocks: paragraphs,
        ...(cell.colSpan > 1 ? { span: cell.colSpan } : {}),
        borders,
        padding: {
          top: (Number.parseFloat(style.paddingTop) || 0) * PX_TO_TWIPS,
          left: (Number.parseFloat(style.paddingLeft) || 0) * PX_TO_TWIPS,
          bottom: (Number.parseFloat(style.paddingBottom) || 0) * PX_TO_TWIPS,
          right: (Number.parseFloat(style.paddingRight) || 0) * PX_TO_TWIPS,
        },
      });
    }
    out.rows.push({ header, cells });
  }
  return out;
}

async function figureOf(figure: Element, ctx: Ctx, out: Block[]) {
  const start = out.length;
  await figureParts(figure, ctx, out);
  // The figure's own margins are what separate it from the text around it;
  // its caption and picture carry none of their own.
  const { spacingBefore = 0, spacingAfter = 0 } = spacing(figure);
  const first = out[start];
  const last = out[out.length - 1];
  if (first?.type === 'paragraph') {
    first.spacingBefore = Math.max(first.spacingBefore ?? 0, spacingBefore);
  }
  if (last?.type === 'paragraph' && out.length > start) {
    last.spacingAfter = Math.max(last.spacingAfter ?? 0, spacingAfter);
  }
}

/** Word bookmark names are letters, digits and underscores, starting with a letter. */
function bookmarkFor(labelId: string): string {
  return `od_${labelId.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);
}

/** Marks a caption so the list of figures or tables can point at its page. */
function captioned(paragraph: Paragraph, caption: Element): Paragraph {
  const id = caption.closest(`[${LABEL_ID_ATTR}]`)?.getAttribute(LABEL_ID_ATTR);
  if (id) paragraph.bookmark = bookmarkFor(id);
  return paragraph;
}

async function figureParts(figure: Element, ctx: Ctx, out: Block[]) {
  const children = Array.from(figure.children).filter((child) => !skip(child, ctx));
  for (const [at, child] of children.entries()) {
    const captionNext = children[at + 1]?.tagName === 'FIGCAPTION';
    if (child.tagName === 'FIGCAPTION') {
      const paragraph = await paragraphOf(Array.from(child.childNodes), 'Caption', child, ctx, {
        keepNext: at === 0,
      });
      if (paragraph) out.push(captioned(paragraph, child));
    } else if (child.tagName === 'TABLE' || child.querySelector(STRUCTURE)) {
      await blockOf(child, ctx, out, 'Normal');
    } else {
      // A drawing: what it shows is not text Word could reflow.
      const image = await imageFrom(child, ctx);
      if (image) {
        out.push({
          type: 'paragraph',
          align: 'center',
          keepNext: captionNext,
          inlines: [{ type: 'image', image }],
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * The document in reading order. A fixed page is its own sheet in Word too, so
 * it starts on a new page; a flow section's later pages continue it, and Word
 * decides where they break.
 */
export async function docxFromPages(
  hosts: HTMLElement[],
  pages: PageInfo[],
  container: HTMLElement,
  options: WalkOptions,
): Promise<WalkResult> {
  const ctx: Ctx = {
    ...options,
    images: [],
    lists: [],
    notes: new Map(),
    container,
    page: { top: 0, bottom: 0, fixed: true, first: true },
  };
  const blocks: Block[] = [];
  let previousFooter = true;

  for (const [index, host] of hosts.entries()) {
    const info = pages[index] ?? { continues: false };
    const rect = host.getBoundingClientRect();
    ctx.page = {
      top: rect.top,
      bottom: rect.bottom,
      fixed: !info.continues && !host.querySelector(`[${FLOW_BLOCK_ATTR}]`),
      first: index === 0,
    };
    const own: Block[] = [];
    const flowBlocks = Array.from(host.querySelectorAll(`[${FLOW_BLOCK_ATTR}]`));
    if (flowBlocks.length > 0) {
      for (const block of flowBlocks) await blockOf(block, ctx, own, 'Normal');
    } else {
      await blocksOf(host, ctx, own);
    }
    // A fixed page places its words where it wants them — a logo at the top,
    // a cover's title low on the sheet, a closing line centred. Word flows
    // from the top margin, so each gap as it was on the sheet becomes the
    // space before the block below it. Word adds a paragraph's space after to
    // the next one's space before instead of collapsing them as CSS does, so
    // the space after goes to zero wherever the gap is set this way.
    if (ctx.page.fixed) {
      let bottom = rect.top + options.margin;
      let previous: Paragraph | null = null;
      for (const block of own) {
        const box = placed.get(block);
        if (!box) continue;
        const gap = Math.max(0, box.top - bottom);
        if (block.type === 'paragraph') {
          block.spacingBefore = gap * PX_TO_TWIPS;
          if (previous) previous.spacingAfter = 0;
          previous = block;
        } else {
          previous = null;
        }
        bottom = Math.max(bottom, box.bottom);
      }
      // Word sets a heading's line from the font's own height, taller than the
      // page's CSS line-height, so a sheet laid out to its last pixel — a
      // cover's byline at the foot — would spill its last lines onto a page of
      // their own. The gaps give back a little of the sheet to absorb that.
      const gapped = own.filter(
        (block): block is Paragraph => block.type === 'paragraph' && (block.spacingBefore ?? 0) > 0,
      );
      const total = gapped.reduce((sum, block) => sum + (block.spacingBefore ?? 0), 0);
      const reserve = Math.min(
        total * 0.3,
        (rect.height - options.margin * 2) * 0.08 * PX_TO_TWIPS,
      );
      if (total > 0) {
        for (const block of gapped) {
          block.spacingBefore = ((block.spacingBefore ?? 0) * (total - reserve)) / total;
        }
      }
    }
    // Flow pages carry the section footer; a fixed sheet prints its own
    // running lines, so it sits in a section without one. The section break
    // itself starts the next page.
    const footer = !ctx.page.fixed;
    const breaksSection = own.length > 0 && blocks.length > 0 && footer !== previousFooter;
    if (breaksSection) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'paragraph' && !last.sectionEnd) {
        last.sectionEnd = { footer: previousFooter };
      } else {
        blocks.push({
          type: 'paragraph',
          inlines: [],
          spacingBefore: 0,
          spacingAfter: 0,
          lineExact: 20,
          sectionEnd: { footer: previousFooter },
        });
      }
    }
    const first = own[0];
    if (first) {
      const newPage = index > 0 && !info.continues && !breaksSection;
      // Word and Pages drop the space before the first paragraph on a page —
      // at the top of the document and after a break alike — so a gap there,
      // a cover's title low on its sheet or a closing line centred, is held
      // open by a spacer's line height instead, which they keep.
      const lead = ctx.page.fixed && first.type === 'paragraph' ? (first.spacingBefore ?? 0) : 0;
      if (first.type === 'paragraph' && lead === 0) {
        if (newPage) first.pageBreakBefore = true;
      } else if (lead > 0 || newPage) {
        if (first.type === 'paragraph') first.spacingBefore = 0;
        own.unshift({
          type: 'paragraph',
          inlines: [],
          ...(newPage ? { pageBreakBefore: true } : {}),
          spacingBefore: 0,
          spacingAfter: 0,
          lineExact: lead > 0 ? Math.round(lead) : 20,
        });
      }
    }
    if (own.length > 0) previousFooter = footer;
    blocks.push(...own);
  }

  const footnotes: WalkResult['footnotes'] = [];
  for (const [key, id] of ctx.notes) {
    const row = container.querySelector(`[${FOOTNOTE_ID_ATTR}="${CSS.escape(key)}"]`);
    const body = row?.lastElementChild;
    const paragraph = body
      ? await paragraphOf(Array.from(body.childNodes), 'FootnoteText', body, ctx)
      : null;
    footnotes.push({
      id,
      paragraphs: [
        paragraph
          ? { ...paragraph, spacingBefore: 0, spacingAfter: 0 }
          : { type: 'paragraph', inlines: [] },
      ],
    });
  }

  return { blocks, footnotes, images: ctx.images, lists: ctx.lists, finalFooter: previousFooter };
}

/** Runs for one element — the footer the orchestrator renders on its own. */
export async function lineOf(el: Element, options: WalkOptions): Promise<Paragraph | null> {
  const ctx: Ctx = {
    ...options,
    images: [],
    lists: [],
    notes: new Map(),
    container: el as HTMLElement,
    page: { top: 0, bottom: 0, fixed: false, first: false },
  };
  const out: Block[] = [];
  await blockOf(el, ctx, out, 'Normal');
  const paragraphs = out.filter((block): block is Paragraph => block.type === 'paragraph');
  if (paragraphs.length === 0) return null;
  // A footer is one line in Word; several blocks become one line split by tabs.
  const inlines: Inline[] = [];
  for (const [at, paragraph] of paragraphs.entries()) {
    if (at > 0) inlines.push({ type: 'tab' });
    inlines.push(...paragraph.inlines);
  }
  return {
    type: 'paragraph',
    inlines,
    rightTab: paragraphs[0]?.rightTab ?? options.textWidth * PX_TO_TWIPS,
    spacingBefore: 0,
    spacingAfter: 0,
  };
}

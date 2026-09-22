/**
 * Reads a rendered document back out of the DOM as a DocxModel.
 *
 * Everything comes from computed styles and measured boxes, never from the
 * source: a hand-written page, an imported Markdown file, and a themed report
 * all reach Word through the same door, and what Word gets is what the browser
 * drew. Vertical spacing is measured between boxes rather than summed from
 * margins, because CSS collapses adjoining margins and Word adds them.
 */

import { FLOW_FOOTER_ATTR } from '../../components/flow-page';
import { FOOTNOTE_BODY_ATTR, FOOTNOTE_ROW_ATTR, FOOTNOTES_ATTR } from '../../components/footnote';
import { REF_ATTR, REF_PAGE_ATTR } from '../../components/numbering';
import {
  TOC_DEPTH_ATTR,
  TOC_ENTRY_ATTR,
  TOC_LEVEL_ATTR,
  TOC_PAGE_ATTR,
} from '../../components/table-of-contents';
import { blockHints } from '../flow-measure';
import { LABEL_ATTR, LABEL_ID_ATTR } from '../labels';
import { HEADING_SELECTOR, levelOf, outlineLevelOf, TOC_ATTR } from '../outline';
import { type FontDeclaration, fontKindOf, pickFonts } from './fonts';
import { MediaStore } from './media';
import type {
  Block,
  Border,
  Borders,
  DocxModel,
  FontSet,
  Inline,
  LinkTarget,
  ListKind,
  Paragraph,
  ParagraphProps,
  ParagraphRole,
  RunStyle,
  Section,
  Side,
  Sides,
  Table,
  TableCell,
  TableRow,
  TabStop,
} from './model';
import { capitalize, ParagraphBuilder } from './paragraph';
import { paragraphsOf } from './styles';
import { eighths, emu, halfPoints, points, px, twips } from './units';

const MEDIA = new Set(['img', 'svg', 'canvas']);
const MEDIA_SELECTOR = 'img, svg, canvas';
const SKIP = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'input',
  'button',
  'select',
  'textarea',
  'video',
  'audio',
  'iframe',
  'object',
  'embed',
  'dialog',
]);
/** Every heading Word has a style for; the outline stops at h3. */
const ANY_HEADING = `${HEADING_SELECTOR}, h4, h5, h6`;
/** What makes a figure's body text worth keeping as text rather than a picture. */
const STRUCTURAL = 'table, p, pre, blockquote, ul, ol, dl, h1, h2, h3, h4, h5, h6';
const FOOTNOTE_MARKER = `sup[${LABEL_ATTR}="footnote"]`;

type SourceBase = {
  host: HTMLElement;
  /** 1-based: the sheet, or a flow section's first sheet. */
  page: number;
};

/**
 * One sheet, or one flow section laid out as a column. A running header or
 * footer is read from a `sentinel` copy, drawn with sentinel page numbers; a
 * flow section's footer is also drawn as its first sheet and, when it has one,
 * its next, which the sentinel copy is checked against.
 */
export type ExtractSource =
  | (SourceBase & { kind: 'fixed'; sentinel: HTMLElement })
  | (SourceBase & {
      kind: 'flow';
      footer?: { sentinel: HTMLElement; first: HTMLElement; next?: HTMLElement };
    });

export type ExtractOptions = {
  sources: ExtractSource[];
  /** Twips. */
  sheet: { width: number; height: number };
  /** CSS px, for a page whose root sets no padding of its own. */
  margin: number;
  /** The numbers the sentinel copies were drawn with, standing in for PAGE and NUMPAGES. */
  sentinels: { page: number; count: number };
  pageCount: number;
  rasterize: (el: Element) => Promise<Uint8Array | null>;
  /** After each source; awaited, so the caller can report progress and yield. */
  onSection?: (done: number, total: number) => Promise<void> | void;
};

export type Extracted = Pick<
  DocxModel,
  'sections' | 'footnotes' | 'lists' | 'media' | 'background' | 'fonts'
>;

type Column = { left: number; right: number; top: number };

type Band = 'header' | 'footer';

type BandCopy = { parts: Element[]; host: HTMLElement };

type InlineState = {
  underline: boolean;
  strike: boolean;
  shading?: string;
  vertAlign?: 'superscript' | 'subscript';
  /** Half-points of the text a super/subscript sits in — Word shrinks it itself. */
  baseSize?: number;
  link?: LinkTarget;
};

type Box = { borders: Borders; shading?: string };

type Ctx = {
  flow: Flow;
  role: ParagraphRole;
  inline: InlineState;
  box?: Box;
  /** Shared by reference: the first paragraph of a list item takes the number. */
  list?: { num: number; level: number; pending: boolean };
  positioned: boolean;
  /** Sentinel page numbers in this text become PAGE / NUMPAGES fields. */
  fields: boolean;
  /**
   * A fixed page's text block. Anything positioned wholly above or below it is
   * the page's own header or footer, read separately.
   */
  bands?: { top: number; bottom: number };
};

const PLAIN: InlineState = { underline: false, strike: false };

function isPlaced(cs: CSSStyleDeclaration): boolean {
  return cs.position === 'absolute' || cs.position === 'fixed';
}

function centred(left: number, right: number): boolean {
  return left > 2 && Math.abs(left - right) < 2;
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

function sides(value: (side: Side) => number): Sides {
  return { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left') };
}

function applyFrame(props: ParagraphProps, frame: Box | undefined): void {
  if (frame && Object.keys(frame.borders).length > 0) props.borders = frame.borders;
  if (frame?.shading) props.shading = frame.shading;
}

function keepWithNext(block: Block): void {
  if (block.type === 'paragraph') {
    block.props.keepNext = true;
    return;
  }
  // A table stays with the next paragraph through its last row's paragraphs.
  for (const cell of block.rows[block.rows.length - 1]?.cells ?? []) {
    for (const inner of cell.blocks) if (inner.type === 'paragraph') inner.props.keepNext = true;
  }
}

function firstParagraphIn(blocks: Block[]): Paragraph | undefined {
  for (const [paragraph] of paragraphsOf(blocks)) return paragraph;
  return undefined;
}

type Spacing = 'spaceBefore' | 'spaceAfter';

/** A column of blocks, with the vertical gaps between them read off the page. */
class Flow {
  readonly blocks: Block[] = [];
  top = Number.POSITIVE_INFINITY;
  bottom = Number.NEGATIVE_INFINITY;
  private cursor: number;
  /** The widest gap, where the spacing that holds it lives, and whether content sits above it. */
  private widest?: {
    gap: number;
    props: ParagraphProps;
    side: Spacing;
    base: number;
    inside: boolean;
  };

  constructor(readonly column: Column) {
    this.cursor = column.top;
  }

  add(block: Block, rect: DOMRect, positioned: boolean): void {
    if (!positioned) {
      const gap = Math.max(0, rect.top - this.cursor);
      if (block.type === 'paragraph') {
        this.space(block.props, 'spaceBefore', gap);
      } else {
        // A table has no space of its own; the paragraph above carries it.
        const previous = this.blocks[this.blocks.length - 1];
        if (previous?.type === 'paragraph' && gap > 0)
          this.space(previous.props, 'spaceAfter', gap);
      }
      this.cursor = Math.max(this.cursor, rect.bottom);
      this.occupy(rect);
    }
    this.blocks.push(block);
  }

  /** Room on the page taken without becoming a block — the printed notes. */
  occupy(rect: DOMRect): void {
    this.top = Math.min(this.top, rect.top);
    this.bottom = Math.max(this.bottom, rect.bottom);
  }

  /**
   * A fixed page is one sheet, and has to stay one in Word, which sets some
   * lines a little taller than the browser did. So the page's widest gap — the
   * space that lowers a cover to the foot of its sheet — gives up some slack,
   * rather than the last line spilling onto a sheet of its own. The section's
   * vertical alignment would lower a cover more directly, but Word left a cover
   * carrying a footnote at the top of the sheet under it.
   */
  fitSheet(): void {
    const widest = this.widest;
    if (!widest || widest.gap < 72) return;
    const content = this.bottom - this.top - (widest.inside ? widest.gap : 0);
    const slack = 24 + content * 0.15;
    widest.props[widest.side] = widest.base + twips(Math.max(0, widest.gap - slack));
  }

  private space(props: ParagraphProps, side: Spacing, gap: number): void {
    const base = props[side] ?? 0;
    props[side] = base + twips(gap);
    if (gap > (this.widest?.gap ?? 0)) {
      this.widest = { gap, props, side, base, inside: Number.isFinite(this.top) };
    }
  }
}

class Colors {
  private readonly cache = new Map<string, [number, number, number, number]>();
  private probe: CanvasRenderingContext2D | null = null;
  private paper: [number, number, number] = [255, 255, 255];

  /** What a translucent colour is seen against — the document's own paper, not white. */
  setPaper(hex: string): void {
    this.paper = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
      number,
      number,
      number,
    ];
  }

  private rgba(css: string): [number, number, number, number] {
    const known = this.cache.get(css);
    if (known) return known;
    let value: [number, number, number, number] = [0, 0, 0, 0];
    const match =
      /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(css);
    if (match) {
      const alpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1);
      value = [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
    } else if (css !== 'transparent') {
      // oklch(), lab(), color(display-p3 …): let the canvas map it into sRGB.
      this.probe ??= document
        .createElement('canvas')
        .getContext('2d', { willReadFrequently: true });
      if (this.probe) {
        this.probe.clearRect(0, 0, 1, 1);
        this.probe.fillStyle = 'rgba(0, 0, 0, 0)';
        this.probe.fillStyle = css;
        this.probe.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = this.probe.getImageData(0, 0, 1, 1).data;
        value = [r, g, b, a / 255];
      }
    }
    this.cache.set(css, value);
    return value;
  }

  /** Six-digit hex over the paper; undefined when the colour is (nearly) transparent. */
  hex(css: string): string | undefined {
    const [r, g, b, a] = this.rgba(css);
    if (a < 0.05) return undefined;
    const channel = (c: number, under: number) =>
      Math.round(c * a + under * (1 - a))
        .toString(16)
        .padStart(2, '0');
    const [pr, pg, pb] = this.paper;
    return `${channel(r, pr)}${channel(g, pg)}${channel(b, pb)}`.toUpperCase();
  }
}

function* childNodes(parent: Node, style: (el: Element) => CSSStyleDeclaration): Generator<Node> {
  for (const node of Array.from(parent.childNodes)) {
    if (node instanceof Element && style(node).display === 'contents') {
      yield* childNodes(node, style);
    } else {
      yield node;
    }
  }
}

/**
 * The line boxes loose text occupies. A range measures glyphs, which sit
 * inside the line with half the leading above and half below; measured bare,
 * every gap to a neighbour would come out that much too large.
 */
function rangeRect(first: Node, last: Node, lineHeight: number): DOMRect | null {
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  const glyphs = rects[0];
  if (!glyphs) return null;
  const leading = Math.max(0, (lineHeight - glyphs.height) / 2);
  const top = Math.min(...rects.map((r) => r.top)) - leading;
  const bottom = Math.max(...rects.map((r) => r.bottom)) + leading;
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  return new DOMRect(left, top, right - left, bottom - top);
}

/** Text outside any drawing — an SVG's labels do not make it prose. */
function hasProse(el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Element && node.localName === 'svg'
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) return true;
  }
  return false;
}

function listKindOf(type: string, ordered: boolean): ListKind | null {
  switch (type) {
    case 'none':
      return null;
    case 'disc':
    case 'circle':
    case 'square':
      return type;
    case 'decimal':
    case 'decimal-leading-zero':
    case 'cjk-decimal':
      return 'decimal';
    case 'lower-alpha':
    case 'lower-latin':
      return 'lowerLetter';
    case 'upper-alpha':
    case 'upper-latin':
      return 'upperLetter';
    case 'lower-roman':
      return 'lowerRoman';
    case 'upper-roman':
      return 'upperRoman';
    default:
      return ordered ? 'decimal' : 'disc';
  }
}

function alignOf(textAlign: string, direction: string): ParagraphProps['align'] {
  switch (textAlign) {
    case 'center':
    case '-webkit-center':
      return 'center';
    case 'right':
    case '-webkit-right':
      return 'right';
    case 'end':
      return direction === 'rtl' ? undefined : 'right';
    case 'justify':
      return 'both';
    default:
      return undefined;
  }
}

function leaderOf(cs: CSSStyleDeclaration): TabStop['leader'] {
  if (px(cs.borderBottomWidth) <= 0) return undefined;
  switch (cs.borderBottomStyle) {
    case 'dotted':
      return 'dot';
    case 'dashed':
      return 'hyphen';
    case 'solid':
      return 'underscore';
    default:
      return undefined;
  }
}

function textOf(parts: Element[]): string {
  return parts
    .map((part) => part.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeBoxes(outer: Box | undefined, inner: Box | undefined): Box | undefined {
  if (!outer || !inner) return outer ?? inner;
  return {
    borders: { ...outer.borders, ...inner.borders },
    shading: inner.shading ?? outer.shading,
  };
}

export async function extractDocument(options: ExtractOptions): Promise<Extracted> {
  return new Extractor(options).run();
}

class Extractor {
  private readonly computed = new WeakMap<Element, CSSStyleDeclaration>();
  private readonly rects = new WeakMap<Element, DOMRect>();
  private readonly runs = new WeakMap<Element, WeakMap<InlineState, RunStyle>>();
  private readonly fontSets = new Map<string, FontSet>();
  private readonly declarations = new Map<string, FontDeclaration>();
  private readonly colors = new Colors();
  private readonly bookmarks = new Map<string, string>();
  private readonly bookmarkNames = new Set<string>();
  /** Printed notes by id, each taken out as its marker claims it. */
  private readonly noteBodies = new Map<string, Element>();
  private readonly footnotes: DocxModel['footnotes'] = [];
  private readonly lists: DocxModel['lists'] = [];
  private readonly media: MediaStore;
  private readonly sentinel: RegExp;
  private paper = 'FFFFFF';

  constructor(private readonly options: ExtractOptions) {
    this.media = new MediaStore(options.rasterize);
    this.sentinel = new RegExp(`(${options.sentinels.page}|${options.sentinels.count})`);
  }

  private readonly style = (el: Element): CSSStyleDeclaration => {
    let cs = this.computed.get(el);
    if (!cs) {
      cs = getComputedStyle(el);
      this.computed.set(el, cs);
    }
    return cs;
  };

  private rect(el: Element): DOMRect {
    let rect = this.rects.get(el);
    if (!rect) {
      rect = el.getBoundingClientRect();
      this.rects.set(el, rect);
    }
    return rect;
  }

  /** Inside the border and padding. */
  private contentBox(el: Element): Column {
    const rect = this.rect(el);
    const cs = this.style(el);
    return {
      left: rect.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
      right: rect.right - px(cs.borderRightWidth) - px(cs.paddingRight),
      top: rect.top + px(cs.borderTopWidth) + px(cs.paddingTop),
    };
  }

  private root(flow: Flow, role: ParagraphRole, extra: Partial<Ctx> = {}): Ctx {
    return { flow, role, inline: PLAIN, positioned: false, fields: false, ...extra };
  }

  async run(): Promise<Extracted> {
    const first = this.options.sources[0]?.host;
    if (first) this.paper = this.colors.hex(this.style(first).backgroundColor) ?? 'FFFFFF';
    this.colors.setPaper(this.paper);

    for (const { host } of this.options.sources) {
      for (const row of Array.from(host.querySelectorAll(`[${FOOTNOTE_ROW_ATTR}]`))) {
        const id = row.getAttribute(FOOTNOTE_ROW_ATTR);
        const body = row.querySelector(`[${FOOTNOTE_BODY_ATTR}]`);
        if (id && body && !this.noteBodies.has(id)) this.noteBodies.set(id, body);
      }
      for (const heading of Array.from(host.querySelectorAll(ANY_HEADING))) {
        if (heading.id) this.bookmark(heading.id);
      }
      for (const labelled of Array.from(host.querySelectorAll(`[${LABEL_ID_ATTR}]`))) {
        const id = labelled.getAttribute(LABEL_ID_ATTR);
        if (id && labelled.getAttribute(LABEL_ATTR) !== 'footnote') this.bookmark(id);
      }
    }

    const { sources, onSection } = this.options;
    const sections: Section[] = [];
    for (const source of sources) {
      sections.push(await this.section(source));
      await onSection?.(sections.length, sources.length);
    }
    this.pruneAnchors(sections);

    return {
      sections,
      footnotes: this.footnotes,
      lists: this.lists,
      media: this.media.media,
      fonts: [...this.declarations.values()],
      background: this.paper === 'FFFFFF' ? undefined : this.paper,
    };
  }

  /**
   * Links and page references to a bookmark no paragraph ended up carrying — a
   * figure that yielded none of its own — would read "Error! Bookmark not
   * defined." in Word once fields update, so they go back to plain text.
   */
  private pruneAnchors(sections: Section[]): void {
    const paragraphs: Paragraph[] = [];
    const collect = (blocks: Block[] = []) => {
      for (const [paragraph] of paragraphsOf(blocks)) paragraphs.push(paragraph);
    };
    for (const { blocks, header, footer, footerFirst } of sections) {
      collect(blocks);
      collect(header);
      collect(footer);
      collect(footerFirst);
    }
    for (const note of this.footnotes) collect(note.blocks);
    const placed = new Set(paragraphs.map((paragraph) => paragraph.bookmark));
    for (const paragraph of paragraphs) {
      paragraph.inlines = paragraph.inlines.map((inline): Inline => {
        if (inline.type === 'field' && inline.instr.startsWith('PAGEREF ')) {
          const anchor = inline.instr.split(' ')[1];
          if (!placed.has(anchor))
            return { type: 'text', text: inline.cached, style: inline.style };
        }
        if (
          'link' in inline &&
          inline.link &&
          'anchor' in inline.link &&
          !placed.has(inline.link.anchor)
        ) {
          return { ...inline, link: undefined };
        }
        return inline;
      });
    }
  }

  /** Word bookmark names: 40 characters, letters, digits and underscores. */
  private bookmark(id: string): void {
    if (this.bookmarks.has(id)) return;
    const base = `_od_${id.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 36);
    let name = base;
    for (let n = 2; this.bookmarkNames.has(name); n++) name = `${base.slice(0, 33)}_${n}`;
    this.bookmarkNames.add(name);
    this.bookmarks.set(id, name);
  }

  private async section(source: ExtractSource): Promise<Section> {
    const { host } = source;
    const sheet = this.rect(host);
    const elements = Array.from(host.children);
    const pageRoot = elements.length === 1 ? elements[0] : null;
    const margin = this.marginsOf(pageRoot, sheet, source.kind === 'flow');

    const flow = new Flow({
      left: sheet.left + margin.left,
      right: sheet.right - margin.right,
      top: sheet.top + margin.top,
    });
    const bands =
      source.kind === 'fixed'
        ? { top: flow.column.top, bottom: sheet.bottom - margin.bottom }
        : undefined;
    // The page's own fill and frame: a dark cover is shading behind its text in
    // Word, not white text on white paper.
    const box = pageRoot ? this.boxOf(this.style(pageRoot)) : undefined;
    await this.walkChildren(pageRoot ?? host, this.root(flow, 'body', { bands, box }));

    const section: Section = {
      blocks: flow.blocks,
      page: {
        ...this.options.sheet,
        margin: sides((side) => twips(margin[side])),
        header: twips(margin.top / 2),
        footer: twips(margin.bottom / 2),
      },
    };

    if (source.kind === 'fixed') {
      flow.fitSheet();
      const real = this.bandParts(host, margin);
      if (real.header.length === 0 && real.footer.length === 0) return section;
      const sentinel = this.bandParts(source.sentinel, margin);
      for (const which of ['header', 'footer'] as const) {
        // Only a band the page really has: a footer written as
        // `n === 1 ? null : …` must not appear on the cover.
        if (real[which].length === 0) continue;
        await this.band(section, which, margin, source.page, {
          sentinel: { parts: sentinel[which], host: source.sentinel },
          real: { parts: real[which], host },
        });
      }
    } else if (source.footer) {
      const { footer } = source;
      const copy = (probe: HTMLElement) => ({
        parts: Array.from(probe.querySelector(`[${FLOW_FOOTER_ATTR}]`)?.children ?? []),
        host: probe,
      });
      const sentinel = copy(footer.sentinel);
      const first = copy(footer.first);
      const next = footer.next ? copy(footer.next) : undefined;
      // The running footer is judged on the second sheet, where one hidden on
      // the opening page shows.
      const live = await this.band(section, 'footer', margin, source.page + (next ? 1 : 0), {
        sentinel,
        real: next ?? first,
      });
      if (next) {
        const running = live ? this.expected(sentinel.parts, source.page) : textOf(next.parts);
        if (running !== textOf(first.parts)) {
          const opening = await this.bandParagraphs('footer', first, margin, false);
          section.footerFirst = opening?.paragraphs ?? [];
        }
      }
    }
    return section;
  }

  /**
   * The page component's own padding is the text block. A page that sets none
   * at all leaves it to the design's margin; one that sets some keeps its zeros
   * — a band that runs to one edge. A flow section's shell always sets its own.
   */
  private marginsOf(pageRoot: Element | null, sheet: DOMRect, explicit: boolean): Sides {
    const fallback = sides(() => this.options.margin);
    if (!pageRoot || Math.abs(this.rect(pageRoot).width - sheet.width) > 2) return fallback;
    const cs = this.style(pageRoot);
    const own = sides(
      (side) =>
        px(cs.getPropertyValue(`padding-${side}`)) +
        px(cs.getPropertyValue(`border-${side}-width`)),
    );
    return explicit || SIDES.some((side) => own[side] > 0) ? own : fallback;
  }

  /** Positioned, with something to show, and wholly inside a margin band. */
  private bandOf(el: Element, cs: CSSStyleDeclaration, bands: Ctx['bands']): Band | null {
    if (!bands || !isPlaced(cs)) return null;
    const rect = this.rect(el);
    const band =
      rect.top >= bands.bottom - 1 ? 'footer' : rect.bottom <= bands.top + 1 ? 'header' : null;
    if (!band || rect.height <= 0) return null;
    return MEDIA.has(el.localName) || el.querySelector(MEDIA_SELECTOR) || hasProse(el)
      ? band
      : null;
  }

  private bandParts(host: HTMLElement, margin: Sides): Record<Band, Element[]> {
    const sheet = this.rect(host);
    const bands = { top: sheet.top + margin.top, bottom: sheet.bottom - margin.bottom };
    const parts: Record<Band, Element[]> = { header: [], footer: [] };
    const visit = (parent: Element) => {
      for (const child of Array.from(parent.children)) {
        const cs = this.style(child);
        if (this.skipped(child, cs)) continue;
        const band = this.bandOf(child, cs, bands);
        if (band) parts[band].push(child);
        else if (!MEDIA.has(child.localName)) visit(child);
      }
    };
    visit(host);
    return parts;
  }

  /**
   * A running header or footer, read from the copy drawn with sentinel page
   * numbers so those become fields. When putting the real numbers back does
   * not give the real copy's text — `n - 1`, `toLocaleString()`, roman
   * numerals — they cannot be fields, and the real text goes in as it is.
   */
  private async band(
    section: Section,
    which: Band,
    margin: Sides,
    page: number,
    copies: Record<'sentinel' | 'real', BandCopy>,
  ): Promise<boolean> {
    const live = this.expected(copies.sentinel.parts, page) === textOf(copies.real.parts);
    const read = await this.bandParagraphs(
      which,
      live ? copies.sentinel : copies.real,
      margin,
      live,
    );
    if (read) {
      section[which] = read.paragraphs;
      section.page[which] = read.distance;
    }
    return live;
  }

  /** What the sentinel copy says on `page`, with the real numbers put back. */
  private expected(parts: Element[], page: number): string {
    const { sentinels, pageCount } = this.options;
    return textOf(parts)
      .split(String(sentinels.page))
      .join(String(page))
      .split(String(sentinels.count))
      .join(String(pageCount));
  }

  private async bandParagraphs(
    which: Band,
    { parts, host }: BandCopy,
    margin: Sides,
    fields: boolean,
  ): Promise<{ paragraphs: Paragraph[]; distance: number } | undefined> {
    if (parts.length === 0) return undefined;
    const sheet = this.rect(host);
    const flow = new Flow({
      left: sheet.left + margin.left,
      right: sheet.right - margin.right,
      top: sheet.top,
    });
    await this.walkNodes(parts, host, this.root(flow, which, { positioned: true, fields }));
    const paragraphs = flow.blocks.filter(
      (block): block is Paragraph => block.type === 'paragraph',
    );
    if (paragraphs.length === 0) return undefined;

    const rects = parts.map((part) => this.rect(part));
    const distance =
      which === 'footer'
        ? sheet.bottom - Math.max(...rects.map((rect) => rect.bottom))
        : Math.min(...rects.map((rect) => rect.top)) - sheet.top;
    const edge = which === 'footer' ? margin.bottom : margin.top;
    return { paragraphs, distance: twips(Math.max(0, Math.min(distance, edge))) };
  }

  private skipped(el: Element, cs: CSSStyleDeclaration): boolean {
    return (
      SKIP.has(el.localName) ||
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      cs.visibility === 'collapse' ||
      // Printed notes are rebuilt as Word footnotes from their markers.
      el.hasAttribute(FOOTNOTES_ATTR)
    );
  }

  private inlineLevel(el: Element, cs: CSSStyleDeclaration): boolean {
    return el.localName === 'br' || cs.display.startsWith('inline') || cs.display === 'ruby';
  }

  private walkChildren(parent: Element, ctx: Ctx): Promise<void> {
    return this.walkNodes(childNodes(parent, this.style), parent, ctx);
  }

  /** Blocks become paragraphs; loose inline content between them becomes one of its own. */
  private async walkNodes(nodes: Iterable<Node>, parent: Element, ctx: Ctx): Promise<void> {
    let builder: ParagraphBuilder | null = null;
    let first: Node | null = null;
    let last: Node | null = null;
    const flush = () => {
      if (builder && !builder.empty && first && last) {
        const lineHeight = px(this.style(parent).lineHeight);
        const rect = rangeRect(first, last, lineHeight) ?? this.rect(parent);
        this.emit(builder, parent, rect, ctx, false);
      }
      builder = null;
      first = null;
      last = null;
    };

    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.nodeValue) continue;
        builder ??= new ParagraphBuilder();
        first ??= node;
        last = node;
        this.text(node as Text, builder, ctx.inline, ctx);
        continue;
      }
      if (!(node instanceof Element)) continue;
      const cs = this.style(node);
      if (this.skipped(node, cs)) {
        if (node.hasAttribute(FOOTNOTES_ATTR)) ctx.flow.occupy(this.rect(node));
        continue;
      }
      if (this.inlineLevel(node, cs)) {
        builder ??= new ParagraphBuilder();
        first ??= node;
        last = node;
        await this.inline(node, builder, ctx.inline, ctx);
        continue;
      }
      flush();
      await this.block(node, cs, ctx);
    }
    flush();
  }

  private async block(el: Element, cs: CSSStyleDeclaration, outer: Ctx): Promise<void> {
    if (this.bandOf(el, cs, outer.bands)) return;
    const blocks = outer.flow.blocks;
    const start = blocks.length;
    await this.blockContent(el, cs, outer);
    if (blocks.length === start) return;
    // The page-break hints the packer honours, as Word's own.
    const hints = blockHints(el);
    const first = blocks[start];
    if (hints.breakBefore && first.type === 'paragraph') first.props.pageBreakBefore = true;
    if (hints.keepWithNext) keepWithNext(blocks[blocks.length - 1]);
    if (hints.keepWithPrevious && start > 0) keepWithNext(blocks[start - 1]);
  }

  private async blockContent(el: Element, cs: CSSStyleDeclaration, outer: Ctx): Promise<void> {
    const ctx: Ctx = {
      ...outer,
      positioned: outer.positioned || isPlaced(cs),
      inline: this.inlineState(el, cs, outer.inline),
    };
    const tag = el.localName;

    if (el.hasAttribute(TOC_ATTR)) return this.toc(el, ctx);
    if (tag === 'table') return this.table(el as HTMLTableElement, ctx);
    if (tag === 'ul' || tag === 'ol') return this.list(el, ctx);
    if (MEDIA.has(tag)) {
      await this.picture(el, ctx);
      return;
    }
    if (tag === 'figure') return this.figure(el, ctx);
    const rule = this.ruleBorder(el, cs);
    if (rule) return this.rule(el, rule, ctx);
    if (tag === 'hr') return;
    const items = this.rowOf(el, cs);
    if (items) {
      await this.row(el, items, ctx);
      return;
    }
    if (this.isLeaf(el)) {
      await this.leaf(el, ctx);
      return;
    }

    const box = this.boxOf(cs);
    return this.walkChildren(el, box ? { ...ctx, box: mergeBoxes(ctx.box, box) } : ctx);
  }

  private isLeaf(el: Element): boolean {
    const tag = el.localName;
    if (el.matches(ANY_HEADING)) return true;
    if (tag === 'p' || tag === 'pre' || tag === 'figcaption' || tag === 'caption') return true;
    for (const node of childNodes(el, this.style)) {
      if (!(node instanceof Element)) continue;
      const cs = this.style(node);
      if (!this.skipped(node, cs) && !this.inlineLevel(node, cs)) return false;
    }
    return true;
  }

  private async leaf(el: Element, ctx: Ctx): Promise<Paragraph | undefined> {
    const builder = new ParagraphBuilder();
    await this.inlineChildren(el, builder, ctx.inline, ctx);
    return this.emit(builder, el, this.rect(el), ctx, true);
  }

  private emit(
    builder: ParagraphBuilder,
    source: Element,
    rect: DOMRect,
    ctx: Ctx,
    own: boolean,
  ): Paragraph | undefined {
    if (builder.empty) return undefined;
    const { role, level } = this.roleOf(source, ctx, own);
    const paragraph: Paragraph = {
      type: 'paragraph',
      role,
      level,
      inlines: builder.finish(),
      props: this.paragraphProps(source, rect, ctx, own),
    };
    if (own && role === 'heading' && source.id) paragraph.bookmark = this.bookmarks.get(source.id);
    if (ctx.list?.pending) {
      paragraph.list = { num: ctx.list.num, level: ctx.list.level };
      ctx.list.pending = false;
    }
    ctx.flow.add(paragraph, rect, ctx.positioned);
    return paragraph;
  }

  private roleOf(el: Element, ctx: Ctx, own: boolean): { role: ParagraphRole; level?: number } {
    if (own && el.matches(ANY_HEADING)) {
      // h4–h6 are below what the viewer's outline lists, but Word has styles for them.
      if (!el.matches(HEADING_SELECTOR)) return { role: 'heading', level: Number(el.localName[1]) };
      const level = outlineLevelOf(el);
      if (level !== null) return { role: 'heading', level };
      // Kept out of the outline, so kept out of Word's too: a heading style
      // would put the cover title and "Contents" into the table of contents.
      return { role: levelOf(el) === 1 ? 'title' : 'subtitle' };
    }
    if (own && (el.localName === 'figcaption' || el.localName === 'caption')) {
      return { role: 'caption' };
    }
    return { role: ctx.list && ctx.role === 'body' ? 'list' : ctx.role };
  }

  private paragraphProps(source: Element, rect: DOMRect, ctx: Ctx, own: boolean): ParagraphProps {
    const cs = this.style(source);
    const align = alignOf(cs.textAlign, cs.direction);
    const lineHeight = px(cs.lineHeight);
    const props: ParagraphProps = {
      align,
      line: lineHeight > 0 ? twips(lineHeight) : undefined,
    };

    const column = ctx.flow.column;
    const box = this.contentBox(source);
    let left = box.left - column.left;
    let right = column.right - box.right;
    // A one-line block shrink-wrapped and centred by its container reads as centred text.
    if (!align && own && rect.height < lineHeight * 1.6 + 1 && source.parentElement) {
      const outer = this.contentBox(source.parentElement);
      const self = this.rect(source);
      if (centred(self.left - outer.left, outer.right - self.right)) {
        props.align = 'center';
        left = 0;
        right = 0;
      }
    }
    if (left > 1) props.indentLeft = twips(left);
    if (right > 1) props.indentRight = twips(right);
    const indent = px(cs.textIndent);
    if (indent) props.firstLine = twips(indent);
    if (ctx.list?.pending) {
      // The marker hangs in the list's own padding, as it does on the page — and
      // a list flush with the text stays flush, rather than taking the Word
      // numbering level's default indent.
      props.indentLeft ??= 0;
      props.firstLine = -Math.min(props.indentLeft, 360);
    }
    if (cs.direction === 'rtl') props.bidi = true;
    applyFrame(props, own ? mergeBoxes(ctx.box, this.boxOf(cs)) : ctx.box);
    return props;
  }

  private bordersOf(cs: CSSStyleDeclaration, padded: boolean): Borders {
    const borders: Borders = {};
    for (const side of SIDES) {
      const border = this.border(cs, side, padded);
      if (border) borders[side] = border;
    }
    return borders;
  }

  private boxOf(cs: CSSStyleDeclaration): Box | undefined {
    const borders = this.bordersOf(cs, true);
    const shading = this.background(cs);
    if (Object.keys(borders).length === 0 && !shading) return undefined;
    return { borders, shading };
  }

  /** A side's border, set off from the text by the padding when `padded`. */
  private border(cs: CSSStyleDeclaration, side: Side, padded: boolean): Border | undefined {
    const width = px(cs.getPropertyValue(`border-${side}-width`));
    const kind = cs.getPropertyValue(`border-${side}-style`);
    if (width <= 0 || kind === 'none' || kind === 'hidden') return undefined;
    const color = this.colors.hex(cs.getPropertyValue(`border-${side}-color`));
    if (!color) return undefined;
    const padding = padded ? px(cs.getPropertyValue(`padding-${side}`)) : 0;
    return {
      style: kind === 'dashed' || kind === 'dotted' || kind === 'double' ? kind : 'single',
      size: eighths(width),
      color,
      space: Math.min(31, points(padding)),
    };
  }

  /** A fill worth keeping: not transparent, and not the paper it sits on. */
  private background(cs: CSSStyleDeclaration): string | undefined {
    const fill = this.colors.hex(cs.backgroundColor);
    return fill && fill !== this.paper ? fill : undefined;
  }

  /** The line a thin, empty box draws — its top or bottom border, or its fill. */
  private ruleBorder(el: Element, cs: CSSStyleDeclaration): Border | undefined {
    const rect = this.rect(el);
    if (rect.height > 4 || rect.width < 8) return undefined;
    if (el.textContent?.trim() || el.querySelector(MEDIA_SELECTOR)) return undefined;
    const fill = this.background(cs);
    return (
      this.border(cs, 'top', false) ??
      this.border(cs, 'bottom', false) ??
      (fill && rect.height > 0
        ? { style: 'single', size: eighths(rect.height), color: fill, space: 0 }
        : undefined)
    );
  }

  private rule(el: Element, border: Border, ctx: Ctx): void {
    const rect = this.rect(el);
    const column = ctx.flow.column;
    const props: ParagraphProps = {
      borders: { bottom: border },
      shading: ctx.box?.shading,
      line: 20,
      lineExact: true,
      markSize: 2,
    };
    if (rect.left - column.left > 1) props.indentLeft = twips(rect.left - column.left);
    if (column.right - rect.right > 1) props.indentRight = twips(column.right - rect.right);
    ctx.flow.add({ type: 'paragraph', role: ctx.role, inlines: [], props }, rect, ctx.positioned);
  }

  /** What a flex or grid row lays out, or null when it holds loose text. */
  private rowItems(el: Element): Element[] | null {
    const items: Element[] = [];
    for (const node of childNodes(el, this.style)) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue?.trim()) return null;
        continue;
      }
      if (!(node instanceof Element)) continue;
      const cs = this.style(node);
      if (!this.skipped(node, cs) && !isPlaced(cs)) items.push(node);
    }
    return items;
  }

  /**
   * The items of a flex or grid row that sit on one line — a running footer, a
   * "label … value" line — or null for anything else. Such a row is one
   * paragraph with tab stops where the items start, so it stays one editable
   * line in Word instead of a stack.
   */
  private rowOf(el: Element, cs: CSSStyleDeclaration): Element[] | null {
    const display = cs.display;
    const flex = display === 'flex' || display === 'inline-flex';
    if (!flex && display !== 'grid' && display !== 'inline-grid') return null;
    if (flex && cs.flexDirection.startsWith('column')) return null;
    const items = this.rowItems(el);
    if (!items || items.length < 2 || items.some((item) => this.hasBlockInside(item))) return null;
    // A heading keeps its style and bookmark as a paragraph of its own.
    if (items.some((item) => item.matches(ANY_HEADING) || item.querySelector(ANY_HEADING))) {
      return null;
    }
    const line = px(cs.lineHeight) || px(cs.fontSize) * 1.4 || 20;
    const tops = items.map((item) => this.rect(item).top);
    const top = Math.min(...tops);
    if (!tops.every((t) => t - top < line * 0.8)) return null;
    // One item may wrap, as a long contents entry does; columns that each run
    // to several lines — a signature block — are a layout, not a line.
    const tall = items.filter(
      (item) => this.rect(item).height > line * 1.5 || item.querySelector('br') !== null,
    );
    return tall.length > 1 ? null : items;
  }

  private hasBlockInside(item: Element): boolean {
    if (MEDIA.has(item.localName)) return false;
    for (const node of childNodes(item, this.style)) {
      if (!(node instanceof Element) || MEDIA.has(node.localName)) continue;
      const cs = this.style(node);
      if (this.skipped(node, cs)) continue;
      if (!this.inlineLevel(node, cs) || this.hasBlockInside(node)) return true;
    }
    return false;
  }

  private async row(el: Element, items: Element[], ctx: Ctx): Promise<Paragraph | undefined> {
    const builder = new ParagraphBuilder();
    const column = ctx.flow.column;
    const box = this.contentBox(el);
    const tabs: TabStop[] = [];
    let leader: TabStop['leader'];
    let first = true;

    for (const item of items) {
      const cs = this.style(item);
      const media = MEDIA.has(item.localName) || item.querySelector(MEDIA_SELECTOR) !== null;
      if (!media && !hasProse(item)) {
        // An empty item between two others is a spacer — or, with a dotted
        // rule, the leader a contents line draws.
        leader = leaderOf(cs) ?? leader;
        continue;
      }
      const rect = this.rect(item);
      if (!first) {
        const middle = (rect.left + rect.right) / 2;
        const tab: TabStop =
          Math.abs(box.right - rect.right) < 2
            ? { align: 'right', pos: twips(rect.right - column.left) }
            : Math.abs(middle - (box.left + box.right) / 2) < 2
              ? { align: 'center', pos: twips(middle - column.left) }
              : { align: 'left', pos: twips(rect.left - column.left) };
        tabs.push({ ...tab, leader });
        builder.push({ type: 'tab' });
      }
      leader = undefined;
      first = false;
      await this.inline(item, builder, ctx.inline, ctx, true);
    }

    const paragraph = this.emit(builder, el, this.rect(el), ctx, true);
    if (paragraph && tabs.length > 0) paragraph.props.tabs = tabs;
    return paragraph;
  }

  private async toc(el: Element, ctx: Ctx): Promise<void> {
    const depth = Number(el.getAttribute(TOC_DEPTH_ATTR)) || 3;
    const numbered = el.querySelector(`[${TOC_PAGE_ATTR}]`) !== null;
    const instruction = `TOC \\o "1-${depth}" \\h \\z \\u${numbered ? '' : ' \\n'}`;

    const entries: Paragraph[] = [];
    for (const row of Array.from(el.querySelectorAll(`[${TOC_ENTRY_ATTR}]`))) {
      const anchor = this.bookmarks.get(row.getAttribute(TOC_ENTRY_ATTR) ?? '');
      const rowCtx: Ctx = {
        ...ctx,
        role: 'toc',
        inline: anchor ? { ...ctx.inline, link: { anchor } } : ctx.inline,
      };
      const items = this.rowOf(row, this.style(row));
      const entry = items ? await this.row(row, items, rowCtx) : await this.leaf(row, rowCtx);
      if (!entry) continue;
      entry.level = Number(row.getAttribute(TOC_LEVEL_ATTR)) || 1;
      entries.push(entry);
    }

    // The entries are the field's current result: right until Word repaginates,
    // and rebuilt by Word the moment anyone updates the field.
    const first = entries[0];
    const last = entries[entries.length - 1];
    if (!first || !last) {
      const empty: Paragraph = {
        type: 'paragraph',
        role: 'toc',
        level: 1,
        inlines: [],
        props: {},
        field: { begin: instruction, end: true },
      };
      ctx.flow.add(empty, this.rect(el), ctx.positioned);
      return;
    }
    first.field = { begin: instruction };
    last.field = { ...last.field, end: true };
  }

  private async list(el: Element, ctx: Ctx): Promise<void> {
    const nodes = Array.from(childNodes(el, this.style));
    const isItem = (node: Node): node is Element =>
      node instanceof Element && node.localName === 'li' && !this.skipped(node, this.style(node));
    const items = nodes.filter(isItem);
    const ordered = el.localName === 'ol';
    const kind = listKindOf(this.style(items[0] ?? el).listStyleType, ordered);
    if (!kind || items.length === 0) {
      await this.walkChildren(el, ctx);
      return;
    }
    const level = ctx.list ? Math.min(8, ctx.list.level + 1) : 0;
    const start = ordered ? (el as HTMLOListElement).start : 1;
    const num = this.lists.length + 1;
    this.lists.push({ id: num, kind, level, start: Number.isFinite(start) ? start : 1 });
    for (const node of nodes) {
      if (!isItem(node)) {
        // A list nested beside the items, a note between them: the page shows
        // them, one level in.
        await this.walkNodes([node], el, { ...ctx, list: { num, level, pending: false } });
        continue;
      }
      const cs = this.style(node);
      // Only a list item draws a marker; a flex or grid <li> is laid out as any block is.
      if (cs.display === 'list-item') {
        await this.walkChildren(node, {
          ...ctx,
          inline: this.inlineState(node, cs, ctx.inline),
          list: { num, level, pending: true },
        });
      } else {
        await this.block(node, cs, { ...ctx, list: { num, level, pending: false } });
      }
    }
  }

  private async table(table: HTMLTableElement, ctx: Ctx): Promise<void> {
    if (table.caption && !this.skipped(table.caption, this.style(table.caption))) {
      await this.leaf(table.caption, ctx);
    }
    const rows = Array.from(table.rows).filter((row) => !this.skipped(row, this.style(row)));
    const edges: number[] = [];
    for (const row of rows) {
      for (const cell of Array.from(row.cells)) {
        const rect = this.rect(cell);
        edges.push(rect.left, rect.right);
      }
    }
    // Columns are wherever cell edges line up. Reading the grid off the page
    // handles colspans without re-deriving the table algorithm.
    const xs: number[] = [];
    for (const x of edges.sort((a, b) => a - b)) {
      const last = xs[xs.length - 1];
      if (last === undefined || x - last > 1.5) xs.push(x);
    }
    if (xs.length < 2) return;

    const column = ctx.flow.column;
    const available = column.right - column.left;
    const span = xs[xs.length - 1] - xs[0];
    const scale = available > 0 && span > available + 1 ? available / span : 1;
    const columns = xs.slice(1).map((x, i) => Math.max(1, twips((x - xs[i]) * scale)));
    const gridAt = (x: number) => {
      let best = 0;
      xs.forEach((edge, i) => {
        if (Math.abs(edge - x) < Math.abs(xs[best] - x)) best = i;
      });
      return best;
    };
    const widthOf = (from: number, to: number) =>
      columns.slice(from, to).reduce((sum, value) => sum + value, 0);
    const emptyCell = (from: number, to: number): TableCell => ({
      blocks: [],
      span: to - from,
      width: widthOf(from, to),
      borders: {},
      margins: sides(() => 0),
    });

    const carried: Array<{ grid: number; rows: number; cell: TableCell }> = [];
    const out: TableRow[] = [];
    for (const row of rows) {
      const placed: Array<{ grid: number; cell: TableCell }> = [];
      for (const carry of carried) {
        if (carry.rows <= 0) continue;
        carry.rows -= 1;
        placed.push({ grid: carry.grid, cell: { ...carry.cell, blocks: [], merge: 'continue' } });
      }
      for (const cell of Array.from(row.cells)) {
        const cs = this.style(cell);
        if (this.skipped(cell, cs)) continue;
        const rect = this.rect(cell);
        const from = gridAt(rect.left);
        const to = Math.max(from + 1, gridAt(rect.right));
        const tc = await this.cell(cell, cs, to - from, widthOf(from, to), ctx);
        if (cell.rowSpan > 1) {
          tc.merge = 'restart';
          carried.push({ grid: from, rows: cell.rowSpan - 1, cell: tc });
        }
        placed.push({ grid: from, cell: tc });
      }
      placed.sort((a, b) => a.grid - b.grid);
      const cells: TableCell[] = [];
      let cursor = 0;
      for (const { grid, cell } of placed) {
        if (grid < cursor) continue;
        if (grid > cursor) cells.push(emptyCell(cursor, grid));
        cells.push(cell);
        cursor = grid + cell.span;
      }
      if (cursor < columns.length) cells.push(emptyCell(cursor, columns.length));
      out.push({ cells, header: row.parentElement?.localName === 'thead' });
    }

    const rect = this.rect(table);
    const left = rect.left - column.left;
    const result: Table = { type: 'table', columns, rows: out };
    if (centred(left, column.right - rect.right)) result.align = 'center';
    else if (left > 1) result.indent = twips(left);
    ctx.flow.add(result, rect, ctx.positioned);
  }

  private async cell(
    el: HTMLTableCellElement,
    cs: CSSStyleDeclaration,
    span: number,
    width: number,
    ctx: Ctx,
  ): Promise<TableCell> {
    const flow = new Flow(this.contentBox(el));
    await this.walkChildren(
      el,
      this.root(flow, 'body', { inline: this.inlineState(el, cs, ctx.inline), fields: ctx.fields }),
    );

    const row = el.parentElement;
    const cell: TableCell = {
      blocks: flow.blocks,
      span,
      width,
      borders: this.bordersOf(cs, false),
      margins: sides((side) => twips(px(cs.getPropertyValue(`padding-${side}`)))),
      shading: this.background(cs) ?? (row ? this.background(this.style(row)) : undefined),
      vAlign:
        cs.verticalAlign === 'middle'
          ? 'center'
          : cs.verticalAlign === 'bottom'
            ? 'bottom'
            : undefined,
    };
    // The gap above text the browser centred is the centring; Word does its own.
    const first = cell.blocks[0];
    if (cell.vAlign && first?.type === 'paragraph') first.props.spaceBefore = 0;
    return cell;
  }

  private async figure(figure: Element, ctx: Ctx): Promise<void> {
    const start = ctx.flow.blocks.length;
    const nodes = Array.from(childNodes(figure, this.style));
    if (nodes.some((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim())) {
      await this.walkChildren(figure, ctx);
    } else {
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        const cs = this.style(node);
        if (this.skipped(node, cs)) continue;
        if (node.localName === 'figcaption') await this.leaf(node, ctx);
        else if (node.matches(STRUCTURAL) || node.querySelector(STRUCTURAL)) {
          await this.block(node, cs, ctx);
        } else if (!(await this.picture(this.soleMedia(node) ?? node, ctx))) {
          // A drawing that would not rasterize still has its words.
          await this.block(node, cs, ctx);
        }
      }
    }

    const added = ctx.flow.blocks.slice(start);
    // A caption travels with what it captions.
    for (const block of added.slice(0, -1)) {
      if (block.type === 'paragraph') block.props.keepNext = true;
    }
    const id = figure.getAttribute(LABEL_ID_ATTR);
    const bookmark = id ? this.bookmarks.get(id) : undefined;
    const target =
      added.find((block): block is Paragraph => block.type === 'paragraph') ??
      firstParagraphIn(added);
    if (bookmark && target && !target.bookmark) target.bookmark = bookmark;
  }

  /** The one picture a wrapper exists to hold — a `<Diagram>`'s SVG, an image in a frame. */
  private soleMedia(el: Element): Element | null {
    const media = Array.from(el.querySelectorAll(MEDIA_SELECTOR)).filter(
      (node) => !node.parentElement?.closest('svg'),
    );
    return media.length === 1 && !hasProse(el) ? media[0] : null;
  }

  /**
   * An element as a picture paragraph. Anything that is not an image — a chart
   * drawn with divs, a shaded diagram — becomes a picture of itself: it is a
   * drawing on the page, and in Word it has to stay one, not collapse into a
   * column of stray labels. False when no picture could be made.
   */
  private async picture(el: Element, ctx: Ctx): Promise<boolean> {
    const rect = this.rect(el);
    if (rect.width < 1 || rect.height < 1) return true;
    const column = ctx.flow.column;
    const image = await this.image(el, column, ctx.inline.link);
    if (!image) return false;

    // In a box, the picture's paragraph spans the box as its neighbours' do, so
    // Word draws one frame around them all rather than a step at the picture.
    const within = ctx.box && el.parentElement ? this.contentBox(el.parentElement) : column;
    const props: ParagraphProps = {};
    if (within.left - column.left > 1) props.indentLeft = twips(within.left - column.left);
    if (column.right - within.right > 1) props.indentRight = twips(column.right - within.right);
    const left = rect.left - within.left;
    const right = within.right - rect.right;
    if (centred(left, right)) props.align = 'center';
    else if (left > 2 && right < 2) props.align = 'right';
    else if (left > 1) props.indentLeft = (props.indentLeft ?? 0) + twips(left);
    applyFrame(props, ctx.box);
    ctx.flow.add(
      { type: 'paragraph', role: ctx.role, inlines: [image], props },
      rect,
      ctx.positioned,
    );
    return true;
  }

  /** A picture of the element, no wider than the column; null when none could be made. */
  private async image(
    el: Element,
    column: Column,
    link: LinkTarget | undefined,
  ): Promise<Inline | null> {
    const rect = this.rect(el);
    if (rect.width < 1 || rect.height < 1) return null;
    const media = await this.media.of(el, rect);
    if (media === null) return null;
    const available = column.right - column.left;
    const scale = available > 0 && rect.width > available ? available / rect.width : 1;
    return {
      type: 'image',
      image: {
        media,
        width: emu(rect.width * scale),
        height: emu(rect.height * scale),
        alt: el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '',
      },
      link,
    };
  }

  private inlineState(el: Element, cs: CSSStyleDeclaration, outer: InlineState): InlineState {
    const next: InlineState = { ...outer };
    const decoration = cs.textDecorationLine;
    if (decoration.includes('underline')) next.underline = true;
    if (decoration.includes('line-through')) next.strike = true;
    if (cs.display.startsWith('inline')) {
      if (cs.verticalAlign === 'super' || cs.verticalAlign === 'sub') {
        next.vertAlign = cs.verticalAlign === 'sub' ? 'subscript' : 'superscript';
        next.baseSize = halfPoints(px(this.style(el.parentElement ?? el).fontSize));
      }
      const shading = this.background(cs);
      if (shading) next.shading = shading;
    }
    if (el instanceof HTMLAnchorElement) {
      const link = this.linkOf(el);
      if (link) next.link = link;
    }
    const to = el.getAttribute(REF_ATTR);
    const anchor = to === null ? undefined : this.bookmarks.get(to);
    if (anchor) next.link = { anchor };
    return next;
  }

  private linkOf(a: HTMLAnchorElement): LinkTarget | undefined {
    const href = a.getAttribute('href');
    if (!href) return undefined;
    if (href.startsWith('#')) {
      const fragment = href.slice(1);
      let id = fragment;
      try {
        id = decodeURIComponent(fragment);
      } catch {
        /* `#growth-50%` is not percent-encoding; the fragment is the id as written. */
      }
      const anchor = this.bookmarks.get(id) ?? this.bookmarks.get(fragment);
      return anchor ? { anchor } : undefined;
    }
    try {
      const url = new URL(href, window.location.href);
      if (url.protocol === 'mailto:' || url.protocol === 'tel:') return { url: url.href };
      // A link back into the viewer points at a dev server the reader does not have.
      if (/^https?:$/.test(url.protocol) && url.origin !== window.location.origin) {
        return { url: url.href };
      }
    } catch {
      /* Not a URL; keep the text, drop the link. */
    }
    return undefined;
  }

  private runStyle(el: Element, state: InlineState): RunStyle {
    let byState = this.runs.get(el);
    const known = byState?.get(state);
    if (known) return known;
    const cs = this.style(el);
    const spacing = px(cs.letterSpacing);
    const style: RunStyle = {
      fonts: this.fontsOf(cs.fontFamily),
      size: state.vertAlign && state.baseSize ? state.baseSize : halfPoints(px(cs.fontSize)),
      bold: Number.parseInt(cs.fontWeight, 10) >= 600,
      italic: cs.fontStyle !== 'normal',
      underline: state.underline,
      strike: state.strike,
      color: this.colors.hex(cs.color) ?? '000000',
      shading: state.shading,
      vertAlign: state.vertAlign,
      caps: cs.textTransform === 'uppercase' || undefined,
      smallCaps:
        cs.fontVariantCaps === 'small-caps' || cs.fontVariantCaps === 'all-small-caps' || undefined,
      spacing: spacing ? twips(spacing) : undefined,
    };
    if (!byState) {
      byState = new WeakMap();
      this.runs.set(el, byState);
    }
    byState.set(state, style);
    return style;
  }

  private fontsOf(family: string): FontSet {
    const known = this.fontSets.get(family);
    if (known) return known;
    const fonts = pickFonts(family);
    this.fontSets.set(family, fonts);
    const kind = fontKindOf(family);
    const declare = (name: string, eastAsia: boolean) => {
      const existing = this.declarations.get(name);
      if (!existing) this.declarations.set(name, { name, kind, eastAsia });
      else if (eastAsia) existing.eastAsia = true;
    };
    declare(fonts.ascii, false);
    if (fonts.eastAsia) declare(fonts.eastAsia, true);
    return fonts;
  }

  private async inlineChildren(
    el: Element,
    builder: ParagraphBuilder,
    state: InlineState,
    ctx: Ctx,
  ): Promise<void> {
    for (const node of childNodes(el, this.style)) {
      if (node.nodeType === Node.TEXT_NODE) this.text(node as Text, builder, state, ctx);
      else if (node instanceof Element) await this.inline(node, builder, state, ctx);
    }
  }

  /** `item`: a row's item, laid out as a block but set on the row's one line. */
  private async inline(
    el: Element,
    builder: ParagraphBuilder,
    outer: InlineState,
    ctx: Ctx,
    item = false,
  ): Promise<void> {
    const cs = this.style(el);
    if (this.skipped(el, cs)) return;
    const tag = el.localName;
    if (tag === 'br') {
      builder.push({ type: 'break' });
      return;
    }
    if (MEDIA.has(tag)) {
      const image = await this.image(el, ctx.flow.column, outer.link);
      if (image) builder.push(image);
      return;
    }
    if (el.matches(FOOTNOTE_MARKER) && (await this.footnote(el, builder, outer))) return;
    // The page a reference quotes is the viewer's; Word's is a PAGEREF away.
    if (el.hasAttribute(REF_PAGE_ATTR) && outer.link && 'anchor' in outer.link) {
      builder.push({
        type: 'field',
        instr: `PAGEREF ${outer.link.anchor} \\h`,
        cached: el.textContent ?? '',
        style: this.runStyle(el, outer),
        link: outer.link,
      });
      return;
    }

    const block = !item && !this.inlineLevel(el, cs);
    if (block) builder.requestBreak();
    await this.inlineChildren(el, builder, this.inlineState(el, cs, outer), ctx);
    if (block) builder.requestBreak();
  }

  private text(node: Text, builder: ParagraphBuilder, state: InlineState, ctx: Ctx): void {
    const parent = node.parentElement;
    if (!parent) return;
    const cs = this.style(parent);
    let value = node.data;
    if (cs.textTransform === 'lowercase') value = value.toLowerCase();
    else if (cs.textTransform === 'capitalize') value = capitalize(value, builder.lastChar());
    const style = this.runStyle(parent, state);
    const { page, count } = this.options.sentinels;
    const put = (text: string, collapse: boolean) => {
      if (!ctx.fields) {
        builder.text(text, style, state.link, collapse);
        return;
      }
      for (const part of text.split(this.sentinel)) {
        if (part === String(page)) {
          builder.push({ type: 'field', instr: 'PAGE', cached: '1', style });
        } else if (part === String(count)) {
          const cached = String(this.options.pageCount);
          builder.push({ type: 'field', instr: 'NUMPAGES', cached, style });
        } else {
          builder.text(part, style, state.link, collapse);
        }
      }
    };

    const ws = cs.whiteSpace;
    if (ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces' || ws === 'pre-line') {
      const tab = ' '.repeat(Number.parseInt(cs.tabSize, 10) || 8);
      value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .forEach((line, i) => {
          if (i > 0) builder.push({ type: 'break', style });
          if (ws === 'pre-line') put(line.replace(/[ \t]+/g, ' '), true);
          else put(line.replace(/\t/g, tab), false);
        });
      return;
    }
    put(value.replace(/[\t\n\r\f ]+/g, ' '), true);
  }

  private async footnote(
    marker: Element,
    builder: ParagraphBuilder,
    state: InlineState,
  ): Promise<boolean> {
    const id = marker.getAttribute(LABEL_ID_ATTR);
    const body = id ? this.noteBodies.get(id) : undefined;
    // A marker whose note was never printed stays what it is on the page.
    if (!id || !body) return false;
    this.noteBodies.delete(id);

    const number = this.footnotes.length + 1;
    builder.push({ type: 'footnote', id: number, style: this.runStyle(marker, state) });
    const box = this.contentBox(body);
    const flow = new Flow({ left: box.left, right: box.right, top: this.rect(body).top });
    this.footnotes.push({ id: number, blocks: flow.blocks });
    await this.walkChildren(body, this.root(flow, 'footnote'));
    return true;
  }
}

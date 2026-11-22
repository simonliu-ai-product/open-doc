import { isSafeHref } from '../app/lib/href.ts';
import { PAGE_SIZE_NAMES, PAGE_SIZES, type PageSizeName } from '../app/lib/sdk.ts';
import { type DocxPackage, num, on, openDocx, resolvePart, val } from './docx-package.ts';
import { child, descendants, elements, textContent, type XmlElement } from './xml.ts';

/**
 * Reads a Word document as it looks on the page — Word's own page size and
 * margins, every paragraph's alignment, indents and spacing, every run's font,
 * size and colour, tables on their grid with merged cells, borders and
 * shading — into a layout the TSX writer turns into inline styles. Structure
 * survives too: a paragraph in a heading style is still a heading.
 *
 * Lengths are CSS px at 96 dpi (a twip is 1/15 px, a half-point 2/3 px).
 */

export type Css = Record<string, string | number>;

export type LRun =
  | { kind: 'text'; text: string; css: Css; href?: string; vert?: 'sup' | 'sub' }
  | { kind: 'blank'; width: string; css: Css }
  | { kind: 'marker'; text: string; css: Css; width: number }
  | { kind: 'break' }
  | { kind: 'image'; src: string; alt: string; width: number; height: number };

type BlockFlags = { keepNext?: boolean; breakBefore?: boolean };

export type LParagraph = BlockFlags & {
  kind: 'p';
  heading?: number;
  css: Css;
  /** The paragraph mark's run style — what an empty paragraph is set in. */
  mark: Css;
  runs: LRun[];
  /** Word style id, and whether it drops its spacing next to the same style. */
  style?: string;
  contextual?: boolean;
};

export type LCell = { colSpan: number; rowSpan: number; css: Css; blocks: LBlock[] };
export type LRow = { css: Css; cells: LCell[]; header: boolean };
export type LTable = BlockFlags & {
  kind: 'table';
  css: Css;
  cols: number[];
  rows: LRow[];
  /** No cell spans rows, so the table may break between any two rows. */
  splittable: boolean;
};

export type LBlock = LParagraph | LTable;

export type LSection = { padding: number; blocks: LBlock[] };

export type DocxLayout = {
  pageSize: PageSizeName;
  orientation: 'portrait' | 'landscape';
  sections: LSection[];
  /** Font stacks the blocks refer to as `@font:<id>`, by id. */
  fonts: Map<string, string>;
  /** The id of the font most of the text is set in; it becomes the design's body font. */
  baseFont: string;
  /** Most of the text's size in px; it becomes the design's body size. */
  baseSize: number;
  title?: string;
  text: string;
  media: Map<string, Uint8Array>;
  warnings: string[];
};

type Border = { style: string; width: number; color: string } | 'none';
type Sides = Partial<Record<'top' | 'left' | 'bottom' | 'right' | 'insideH' | 'insideV', Border>>;

type RunProps = {
  ascii?: string;
  eastAsia?: string;
  b?: boolean;
  i?: boolean;
  u?: string;
  strike?: boolean;
  color?: string;
  sz?: number;
  highlight?: string;
  shd?: string;
  vert?: string;
  caps?: boolean;
  vanish?: boolean;
  spacing?: number;
};

type ParaProps = {
  jc?: string;
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
  leftChars?: number;
  rightChars?: number;
  firstLineChars?: number;
  hangingChars?: number;
  before?: number;
  after?: number;
  beforeLines?: number;
  afterLines?: number;
  beforeAuto?: boolean;
  afterAuto?: boolean;
  line?: number;
  lineRule?: string;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  contextual?: boolean;
  snapToGrid?: boolean;
  shd?: string;
  borders?: Sides;
  numId?: string;
  ilvl?: number;
};

type Style = {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  isDefault: boolean;
  p: ParaProps;
  r: RunProps;
  tbl?: XmlElement;
};

type Level = {
  fmt: string;
  text: string;
  start: number;
  suff: string;
  p: ParaProps;
  r: RunProps;
};

const SERIF_RE =
  /明|宋|仿宋|細明|ming|song|mincho|batang|바탕|times|georgia|garamond|cambria|palatino|book antiqua|century|serif/i;
const KAI_RE = /楷|kai|biaukai/i;
const MONO_RE =
  /courier|consolas|menlo|monaco|mono|source code|lucida console|inconsolata|fira code|cascadia/i;
const SANS_SERIF_RE = /sans/i;

const STACKS = {
  serif:
    '"PMingLiU", "MingLiU", "Songti TC", "Songti SC", "STSong", "Noto Serif CJK TC", "Noto Serif TC", "Times New Roman", serif',
  kai: '"DFKai-SB", "BiauKai", "Kaiti TC", "STKaiti", "KaiTi", "Noto Serif CJK TC", serif',
  sans: '"Microsoft JhengHei", "PingFang TC", "PingFang SC", "Noto Sans CJK TC", "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
};

const UNSHOWABLE_IMAGE_RE = /\.(?:emf|wmf|tiff?|wdp)$/i;

const WARNINGS: Record<string, (n: number) => string> = {
  textbox: (n) => `${n} text box(es) kept as paragraphs after the text they sit beside`,
  floating: (n) => `${n} floating picture(s) placed in line with the text`,
  note: (n) => `${n} footnote(s) or endnote(s) moved to the end of the document`,
  comment: (n) => `${n} comment(s) not imported`,
  insertion: (n) => `${n} tracked insertion(s) accepted`,
  deletion: (n) => `${n} tracked deletion(s) accepted (their text is gone)`,
  math: (n) => `${n} equation(s) kept as plain text`,
  drawing: (n) => `${n} chart(s), SmartArt or shape(s) without a picture not imported`,
  unshowable: (n) => `${n} image(s) in a format browsers cannot show (EMF, WMF, TIFF) not imported`,
  missingImage: (n) => `${n} image(s) missing from the file not imported`,
  headerFooter: () => 'Word headers and footers were not imported',
  altChunk: (n) => `${n} embedded document part(s) not imported`,
};

const px = (twips: number) => Math.round((twips / 15) * 100) / 100;
const round = (value: number) => Math.round(value * 100) / 100;

function fontClass(name: string | undefined): keyof typeof STACKS | undefined {
  if (!name) return undefined;
  if (MONO_RE.test(name)) return 'mono';
  if (KAI_RE.test(name)) return 'kai';
  if (SERIF_RE.test(name) && !SANS_SERIF_RE.test(name)) return 'serif';
  return 'sans';
}

function readBorder(el: XmlElement | undefined): Border | undefined {
  if (!el) return undefined;
  const kind = (el.attrs['w:val'] ?? 'single').toLowerCase();
  if (kind === 'nil' || kind === 'none') return 'none';
  const eighths = num(el.attrs['w:sz']) ?? 4;
  let width = Math.max(0.5, round(eighths / 6));
  let style = 'solid';
  if (kind.includes('double') || kind === 'triple') {
    style = 'double';
    width = Math.max(width, 3);
  } else if (kind.includes('dot') && !kind.includes('dash')) style = 'dotted';
  else if (kind.includes('dash')) style = 'dashed';
  else if (kind.startsWith('thick')) width = Math.max(width, 1.5);
  const color = el.attrs['w:color'];
  return { style, width, color: color && color !== 'auto' ? `#${color}` : '#000000' };
}

function readSides(el: XmlElement | undefined): Sides | undefined {
  if (!el) return undefined;
  const sides: Sides = {};
  const pick = (key: keyof Sides, ...names: string[]) => {
    for (const name of names) {
      const border = readBorder(child(el, name));
      if (border) {
        sides[key] = border;
        return;
      }
    }
  };
  pick('top', 'w:top');
  pick('left', 'w:left', 'w:start');
  pick('bottom', 'w:bottom');
  pick('right', 'w:right', 'w:end');
  pick('insideH', 'w:insideH');
  pick('insideV', 'w:insideV');
  return sides;
}

function borderCss(border: Border | undefined): string | undefined {
  if (!border) return undefined;
  if (border === 'none') return 'none';
  return `${border.width}px ${border.style} ${border.color}`;
}

function fill(shd: XmlElement | undefined): string | undefined {
  const value = shd?.attrs['w:fill'];
  if (!value || value === 'auto') return undefined;
  return `#${value}`;
}

function readRPr(rPr: XmlElement | undefined): RunProps {
  if (!rPr) return {};
  const fonts = child(rPr, 'w:rFonts');
  const r: RunProps = {};
  const ascii = fonts?.attrs['w:ascii'] ?? fonts?.attrs['w:hAnsi'];
  const asciiTheme = fonts?.attrs['w:asciiTheme'] ?? fonts?.attrs['w:hAnsiTheme'];
  const eastAsia = fonts?.attrs['w:eastAsia'];
  const eastAsiaTheme = fonts?.attrs['w:eastAsiaTheme'];
  if (ascii) r.ascii = ascii;
  else if (asciiTheme) r.ascii = `@theme:${asciiTheme}`;
  if (eastAsia) r.eastAsia = eastAsia;
  else if (eastAsiaTheme) r.eastAsia = `@theme:${eastAsiaTheme}`;
  const b = on(child(rPr, 'w:b'));
  if (b !== undefined) r.b = b;
  const i = on(child(rPr, 'w:i'));
  if (i !== undefined) r.i = i;
  const u = child(rPr, 'w:u');
  if (u) r.u = val(u) ?? 'single';
  const strike = on(child(rPr, 'w:strike')) ?? on(child(rPr, 'w:dstrike'));
  if (strike !== undefined) r.strike = strike;
  const color = val(child(rPr, 'w:color'));
  if (color) r.color = color;
  const sz = num(val(child(rPr, 'w:sz')));
  if (sz !== undefined) r.sz = sz;
  const highlight = val(child(rPr, 'w:highlight'));
  if (highlight) r.highlight = highlight;
  const shd = child(rPr, 'w:shd');
  if (shd) r.shd = shd.attrs['w:fill'] ?? 'auto';
  const vert = val(child(rPr, 'w:vertAlign'));
  if (vert) r.vert = vert;
  const caps = on(child(rPr, 'w:caps'));
  if (caps !== undefined) r.caps = caps;
  const vanish = on(child(rPr, 'w:vanish'));
  if (vanish !== undefined) r.vanish = vanish;
  const spacing = num(val(child(rPr, 'w:spacing')));
  if (spacing !== undefined) r.spacing = spacing;
  return r;
}

function readPPr(pPr: XmlElement | undefined): ParaProps {
  if (!pPr) return {};
  const p: ParaProps = {};
  const jc = val(child(pPr, 'w:jc'));
  if (jc) p.jc = jc;
  const ind = child(pPr, 'w:ind');
  if (ind) {
    const a = ind.attrs;
    const left = num(a['w:left'] ?? a['w:start']);
    const right = num(a['w:right'] ?? a['w:end']);
    if (left !== undefined) p.left = left;
    if (right !== undefined) p.right = right;
    const leftChars = num(a['w:leftChars'] ?? a['w:startChars']);
    const rightChars = num(a['w:rightChars'] ?? a['w:endChars']);
    if (leftChars !== undefined) p.leftChars = leftChars;
    if (rightChars !== undefined) p.rightChars = rightChars;
    const firstLine = num(a['w:firstLine']);
    const hanging = num(a['w:hanging']);
    const firstLineChars = num(a['w:firstLineChars']);
    const hangingChars = num(a['w:hangingChars']);
    if (hanging !== undefined || hangingChars !== undefined) {
      p.hanging = hanging ?? 0;
      p.firstLine = 0;
      if (hangingChars !== undefined) p.hangingChars = hangingChars;
      p.firstLineChars = 0;
    } else if (firstLine !== undefined || firstLineChars !== undefined) {
      p.firstLine = firstLine ?? 0;
      p.hanging = 0;
      if (firstLineChars !== undefined) p.firstLineChars = firstLineChars;
      p.hangingChars = 0;
    }
  }
  const spacing = child(pPr, 'w:spacing');
  if (spacing) {
    const a = spacing.attrs;
    const set = <K extends keyof ParaProps>(key: K, value: ParaProps[K] | undefined) => {
      if (value !== undefined) p[key] = value;
    };
    set('before', num(a['w:before']));
    set('after', num(a['w:after']));
    set('beforeLines', num(a['w:beforeLines']));
    set('afterLines', num(a['w:afterLines']));
    const auto = (value: string | undefined) =>
      value === undefined ? undefined : value !== '0' && value !== 'false';
    set('beforeAuto', auto(a['w:beforeAutospacing']));
    set('afterAuto', auto(a['w:afterAutospacing']));
    set('line', num(a['w:line']));
    set('lineRule', a['w:lineRule']);
  }
  const keepNext = on(child(pPr, 'w:keepNext'));
  if (keepNext !== undefined) p.keepNext = keepNext;
  const breakBefore = on(child(pPr, 'w:pageBreakBefore'));
  if (breakBefore !== undefined) p.pageBreakBefore = breakBefore;
  const contextual = on(child(pPr, 'w:contextualSpacing'));
  if (contextual !== undefined) p.contextual = contextual;
  const snap = on(child(pPr, 'w:snapToGrid'));
  if (snap !== undefined) p.snapToGrid = snap;
  const shd = fill(child(pPr, 'w:shd'));
  if (shd) p.shd = shd;
  const borders = readSides(child(pPr, 'w:pBdr'));
  if (borders) p.borders = borders;
  const numPr = child(pPr, 'w:numPr');
  if (numPr) {
    const numId = val(child(numPr, 'w:numId'));
    const ilvl = num(val(child(numPr, 'w:ilvl')));
    if (numId !== undefined) p.numId = numId;
    if (ilvl !== undefined) p.ilvl = ilvl;
  }
  return p;
}

function mergeP(...layers: ParaProps[]): ParaProps {
  const out: ParaProps = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer) as Array<[keyof ParaProps, unknown]>) {
      if (value === undefined) continue;
      if (key === 'borders') out.borders = { ...out.borders, ...(value as Sides) };
      else (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function mergeR(...layers: RunProps[]): RunProps {
  const out: RunProps = {};
  for (const layer of layers) Object.assign(out, layer);
  return out;
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function formatNumber(n: number, fmt: string): string {
  const digits = '〇一二三四五六七八九';
  const chinese = (value: number): string => {
    if (value <= 0) return String(value);
    if (value < 10) return digits[value];
    if (value < 20) return `十${value % 10 ? digits[value % 10] : ''}`;
    if (value < 100) {
      return `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ''}`;
    }
    return String(value);
  };
  const letters = (value: number) => {
    let out = '';
    let rest = value;
    while (rest > 0) {
      rest--;
      out = String.fromCharCode(97 + (rest % 26)) + out;
      rest = Math.floor(rest / 26);
    }
    return out;
  };
  const roman = (value: number) => {
    const table: Array<[number, string]> = [
      [1000, 'm'],
      [900, 'cm'],
      [500, 'd'],
      [400, 'cd'],
      [100, 'c'],
      [90, 'xc'],
      [50, 'l'],
      [40, 'xl'],
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i'],
    ];
    let out = '';
    let rest = value;
    for (const [amount, mark] of table) {
      while (rest >= amount) {
        out += mark;
        rest -= amount;
      }
    }
    return out;
  };
  switch (fmt) {
    case 'lowerLetter':
      return letters(n);
    case 'upperLetter':
      return letters(n).toUpperCase();
    case 'lowerRoman':
      return roman(n);
    case 'upperRoman':
      return roman(n).toUpperCase();
    case 'decimalZero':
      return n < 10 ? `0${n}` : String(n);
    case 'decimalFullWidth':
    case 'decimalFullWidth2':
      return String(n).replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
    case 'decimalEnclosedCircle':
    case 'decimalEnclosedCircleChinese':
      return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n);
    case 'ideographTraditional':
      return '甲乙丙丁戊己庚辛壬癸'[n - 1] ?? String(n);
    case 'ideographZodiac':
      return '子丑寅卯辰巳午未申酉戌亥'[n - 1] ?? String(n);
    case 'chineseCounting':
    case 'chineseCountingThousand':
    case 'taiwaneseCounting':
    case 'taiwaneseCountingThousand':
    case 'japaneseCounting':
    case 'koreanCounting':
    case 'ideographDigital':
      return chinese(n);
    case 'none':
      return '';
    default:
      return String(n);
  }
}

/** A symbol-font bullet (Wingdings, Symbol) lives in the private use area; show it as a plain bullet. */
function bulletText(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code >= 0xf000 && code <= 0xf0ff) {
        const low = code - 0xf000;
        if (low === 0xa7 || low === 0x6e) return '▪';
        if (low === 0xd8) return '➢';
        if (low === 0xfc) return '✓';
        if (low === 0x76) return '❖';
        return '•';
      }
      return char;
    })
    .join('');
}

export function readDocxLayout(bytes: Uint8Array): DocxLayout {
  const pkg = openDocx(bytes);
  return new LayoutReader(pkg).read();
}

class LayoutReader {
  private styles = new Map<string, Style>();
  private defaults: { p: ParaProps; r: RunProps } = { p: {}, r: {} };
  private defaultParagraph?: string;
  private defaultTable?: string;
  private numbering = new Map<string, Map<number, Level>>();
  private counters = new Map<string, number[]>();
  private theme = new Map<string, string>();
  private tabStop = 720;
  private counts = new Map<string, number>();
  private media = new Map<string, Uint8Array>();
  private text: string[] = [];
  private fonts = new Map<string, string>();
  private fontUse = new Map<string, number>();
  private sizeUse = new Map<number, number>();
  private fields: Array<{ instr: string; result: boolean; href?: string }> = [];
  private notes: LParagraph[] = [];
  private grid = 0;
  private scaleX = 1;
  private textWidth = 624;
  private insetLeft = 0;
  private insetRight = 0;
  private padding = 0;
  private pendingBreak = false;
  private cjk = false;

  constructor(private pkg: DocxPackage) {}

  read(): DocxLayout {
    const { pkg } = this;
    this.readStyles(pkg.partOf('/styles', 'styles.xml'));
    this.readNumbering(pkg.partOf('/numbering', 'numbering.xml'));
    this.readTheme(pkg.partOf('/theme', 'theme/theme1.xml'));
    const settings = pkg.partOf('/settings', 'settings.xml');
    this.tabStop = num(val(child(settings, 'w:defaultTabStop'))) ?? 720;
    this.cjk = CJK_RE.test(textContent(pkg.body).slice(0, 4000));

    const groups = this.sectionGroups(pkg.body);
    const first = groups[0]?.sectPr ?? child(pkg.body, 'w:sectPr');
    const pgSz = child(first, 'w:pgSz');
    const wordW = num(pgSz?.attrs['w:w']) ?? 11906;
    const wordH = num(pgSz?.attrs['w:h']) ?? 16838;
    const landscape = pgSz?.attrs['w:orient'] === 'landscape' || wordW > wordH;
    const pageSize = nearestPage(px(Math.min(wordW, wordH)), px(Math.max(wordW, wordH)));
    const sheet = PAGE_SIZES[pageSize];
    // Only a page that differs from its sheet (US Letter on A4) is rescaled;
    // A4's twips round to a hair off 794px and should stay exact.
    const scale = (landscape ? sheet.height : sheet.width) / px(wordW);
    this.scaleX = Math.abs(scale - 1) < 0.02 ? 1 : scale;

    const sections: LSection[] = [];
    for (const group of groups) {
      const sectPr = group.sectPr;
      if (
        sectPr &&
        (descendants(sectPr, 'w:headerReference').length > 0 ||
          descendants(sectPr, 'w:footerReference').length > 0)
      ) {
        if (this.hasHeaderFooterText(sectPr)) this.counts.set('headerFooter', 1);
      }
      const continuous = val(child(sectPr, 'w:type')) === 'continuous';
      const margin = child(sectPr, 'w:pgMar');
      const m = (name: string, fallback: number) => num(margin?.attrs[name]) ?? fallback;
      const top = px(m('w:top', 1440));
      const bottom = px(m('w:bottom', 1440));
      const left = this.hx(m('w:left', 1800));
      const right = this.hx(m('w:right', 1800));
      const docGrid = child(sectPr, 'w:docGrid');
      const gridType = docGrid?.attrs['w:type'];
      this.grid =
        gridType === 'lines' || gridType === 'linesAndChars'
          ? px(num(docGrid?.attrs['w:linePitch']) ?? 0)
          : 0;
      const pageWidth = landscape ? sheet.height : sheet.width;
      this.textWidth = pageWidth - left - right;
      // flow() pads all four sides alike, so the page takes the smallest
      // margin and every block makes up the difference on its own sides.
      const padding = Math.max(8, Math.min(top, bottom, left, right));
      this.padding = padding;
      this.insetLeft = round(left - padding);
      this.insetRight = round(right - padding);
      const blocks = this.readBlocks(group.nodes, true);
      // Empty paragraphs at the end of a section print nothing; they only
      // risk pushing a blank sheet out of a page that was full to the margin.
      while (blocks.length > 0 && isEmptyParagraph(blocks[blocks.length - 1])) blocks.pop();
      const previous = sections[sections.length - 1];
      if (continuous && previous) previous.blocks.push(...blocks);
      else sections.push({ padding: round(padding), blocks });
    }

    if (this.notes.length > 0 && sections.length > 0) {
      const last = sections[sections.length - 1].blocks;
      last.push({
        kind: 'p',
        css: {
          margin: `16px ${this.insetRight}px 4px ${this.insetLeft}px`,
          borderTop: '1px solid #000000',
          width: 160,
          height: 0,
        },
        mark: {},
        runs: [],
      });
      last.push(...this.notes);
    }

    const baseFont = top(this.fontUse) ?? this.fontId({});
    const baseSize = top(this.sizeUse) ?? 16;
    const warnings: string[] = [];
    for (const [key, n] of this.counts) if (n > 0) warnings.push(WARNINGS[key](n));

    const title = this.title(sections);
    return {
      pageSize,
      orientation: landscape ? 'landscape' : 'portrait',
      sections,
      fonts: this.fonts,
      baseFont,
      baseSize,
      ...(title ? { title } : {}),
      text: this.text.join(' '),
      media: this.media,
      warnings,
    };
  }

  private hx(twips: number): number {
    return round((twips / 15) * this.scaleX);
  }

  private count(key: string, by = 1) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + by);
  }

  private title(sections: LSection[]): string | undefined {
    const core = this.pkg.xmlPart('docProps/core.xml');
    const fromCore = core ? descendants(core, 'dc:title').map(textContent).join('').trim() : '';
    if (fromCore) return fromCore;
    const blocks = sections.flatMap((section) => section.blocks);
    const plainText = (p: LParagraph) =>
      p.runs
        .map((run) => (run.kind === 'text' ? run.text : run.kind === 'blank' ? ' ' : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    const heading = blocks.find(
      (block): block is LParagraph => block.kind === 'p' && !!block.heading,
    );
    if (heading && plainText(heading)) return plainText(heading).slice(0, 120);
    for (const block of blocks) {
      if (block.kind !== 'p') continue;
      const value = plainText(block);
      if (value) return value.slice(0, 120);
    }
    return undefined;
  }

  private hasHeaderFooterText(sectPr: XmlElement): boolean {
    for (const ref of [
      ...descendants(sectPr, 'w:headerReference'),
      ...descendants(sectPr, 'w:footerReference'),
    ]) {
      const rel = this.pkg.rels.get(ref.attrs['r:id'] ?? '');
      if (!rel) continue;
      const part = this.pkg.xmlPart(resolvePart(this.pkg.mainDir, rel.target));
      if (part && textContent(part).trim() !== '') return true;
    }
    return false;
  }

  /** Splits the body at each section break; the `sectPr` that ends a run of content describes it. */
  private sectionGroups(body: XmlElement): Array<{ nodes: XmlElement[]; sectPr?: XmlElement }> {
    const groups: Array<{ nodes: XmlElement[]; sectPr?: XmlElement }> = [];
    let nodes: XmlElement[] = [];
    for (const node of body.children) {
      if (typeof node === 'string') continue;
      if (node.name === 'w:sectPr') continue;
      nodes.push(node);
      const sectPr = node.name === 'w:p' ? child(child(node, 'w:pPr'), 'w:sectPr') : undefined;
      if (sectPr) {
        groups.push({ nodes, sectPr });
        nodes = [];
      }
    }
    const last = child(body, 'w:sectPr');
    if (nodes.length > 0 || groups.length === 0)
      groups.push({ nodes, ...(last ? { sectPr: last } : {}) });
    return groups;
  }

  private readStyles(xml: XmlElement | undefined) {
    if (!xml) return;
    const defaults = child(xml, 'w:docDefaults');
    this.defaults = {
      p: readPPr(child(child(defaults, 'w:pPrDefault'), 'w:pPr')),
      r: readRPr(child(child(defaults, 'w:rPrDefault'), 'w:rPr')),
    };
    for (const el of elements(xml, 'w:style')) {
      const id = el.attrs['w:styleId'];
      if (!id) continue;
      const type = el.attrs['w:type'] ?? 'paragraph';
      const isDefault = el.attrs['w:default'] === '1' || el.attrs['w:default'] === 'true';
      if (isDefault && type === 'paragraph') this.defaultParagraph = id;
      if (isDefault && type === 'table') this.defaultTable = id;
      this.styles.set(id, {
        id,
        name: (val(child(el, 'w:name')) ?? id).toLowerCase(),
        type,
        basedOn: val(child(el, 'w:basedOn')),
        isDefault,
        p: readPPr(child(el, 'w:pPr')),
        r: readRPr(child(el, 'w:rPr')),
        ...(child(el, 'w:tblPr') ? { tbl: child(el, 'w:tblPr') } : {}),
      });
    }
  }

  private readNumbering(xml: XmlElement | undefined) {
    if (!xml) return;
    const readLevels = (el: XmlElement, into: Map<number, Level>) => {
      for (const lvl of elements(el, 'w:lvl')) {
        into.set(num(lvl.attrs['w:ilvl']) ?? 0, {
          fmt: val(child(lvl, 'w:numFmt')) ?? 'decimal',
          text: val(child(lvl, 'w:lvlText')) ?? '',
          start: num(val(child(lvl, 'w:start'))) ?? 1,
          suff: val(child(lvl, 'w:suff')) ?? 'tab',
          p: readPPr(child(lvl, 'w:pPr')),
          r: readRPr(child(lvl, 'w:rPr')),
        });
      }
    };
    const abstracts = new Map<string, Map<number, Level>>();
    for (const el of elements(xml, 'w:abstractNum')) {
      const levels = new Map<number, Level>();
      readLevels(el, levels);
      abstracts.set(el.attrs['w:abstractNumId'] ?? '', levels);
    }
    for (const el of elements(xml, 'w:num')) {
      const levels = new Map(abstracts.get(val(child(el, 'w:abstractNumId')) ?? '') ?? []);
      for (const override of elements(el, 'w:lvlOverride')) {
        const ilvl = num(override.attrs['w:ilvl']) ?? 0;
        const lvl = child(override, 'w:lvl');
        if (lvl) readLevels({ ...override, children: [lvl] }, levels);
        const start = num(val(child(override, 'w:startOverride')));
        const level = levels.get(ilvl);
        if (start !== undefined && level) levels.set(ilvl, { ...level, start });
      }
      this.numbering.set(el.attrs['w:numId'] ?? '', levels);
    }
  }

  private readTheme(xml: XmlElement | undefined) {
    if (!xml) return;
    for (const kind of ['major', 'minor'] as const) {
      const font = descendants(xml, `a:${kind}Font`)[0];
      if (!font) continue;
      const latin = child(font, 'a:latin')?.attrs.typeface;
      const ea =
        child(font, 'a:ea')?.attrs.typeface ||
        elements(font, 'a:font').find((f) =>
          ['Hant', 'Hans', 'Jpan', 'Hang'].includes(f.attrs.script ?? ''),
        )?.attrs.typeface;
      if (latin) this.theme.set(`${kind}HAnsi`, latin);
      if (latin) this.theme.set(`${kind}Ascii`, latin);
      if (ea) this.theme.set(`${kind}EastAsia`, ea);
    }
  }

  private chain(id: string | undefined): Style[] {
    const out: Style[] = [];
    let current = id ? this.styles.get(id) : undefined;
    while (current && out.length < 12 && !out.includes(current)) {
      out.push(current);
      current = current.basedOn ? this.styles.get(current.basedOn) : undefined;
    }
    return out.reverse();
  }

  private headingLevel(
    styleId: string | undefined,
    direct: number | undefined,
  ): number | undefined {
    if (direct !== undefined && direct < 9) return direct + 1;
    for (const style of this.chain(styleId).reverse()) {
      const match = style.name.match(/^heading\s*([1-9])$/);
      if (match) return Number(match[1]);
      if (style.name === 'title') return 1;
    }
    return undefined;
  }

  private themed(name: string | undefined): string | undefined {
    if (!name?.startsWith('@theme:')) return name;
    return this.theme.get(name.slice(7));
  }

  private fontId(r: RunProps): string {
    const ascii = this.themed(r.ascii);
    const eastAsia = this.themed(r.eastAsia);
    const primary = this.cjk ? (eastAsia ?? ascii) : (ascii ?? eastAsia);
    const kind =
      fontClass(ascii) === 'mono' ? 'mono' : (fontClass(primary) ?? (this.cjk ? 'serif' : 'sans'));
    const named = [...new Set([ascii, eastAsia].filter((name): name is string => !!name))];
    const stack = [...named.map((name) => `"${name.replace(/"/g, '')}"`), STACKS[kind]].join(', ');
    for (const [id, existing] of this.fonts) if (existing === stack) return id;
    const base = `font${kind[0].toUpperCase()}${kind.slice(1)}`;
    let id = base;
    for (let n = 2; [...this.fonts.keys()].includes(id); n++) id = `${base}${n}`;
    this.fonts.set(id, stack);
    return id;
  }

  private runCss(r: RunProps): Css {
    const css: Css = {
      fontFamily: `@font:${this.fontId(r)}`,
      fontSize: round(((r.sz ?? 20) * 2) / 3),
      fontWeight: r.b ? 700 : 400,
      fontStyle: r.i ? 'italic' : 'normal',
    };
    const decorations = [
      ...(r.u && r.u !== 'none' ? ['underline'] : []),
      ...(r.strike ? ['line-through'] : []),
    ];
    if (decorations.length > 0) css.textDecoration = decorations.join(' ');
    if (r.u === 'double') css.textDecorationStyle = 'double';
    if (r.color && r.color !== 'auto') css.color = `#${r.color}`;
    const highlight = r.highlight ? HIGHLIGHT[r.highlight] : undefined;
    const shade =
      r.shd && r.shd !== 'auto' && r.shd.toUpperCase() !== 'FFFFFF' ? `#${r.shd}` : undefined;
    if (highlight ?? shade) css.background = (highlight ?? shade) as string;
    if (r.caps) css.textTransform = 'uppercase';
    if (r.spacing) css.letterSpacing = px(r.spacing);
    return css;
  }

  private lineHeight(p: ParaProps, fontPx: number): string | number {
    const line = p.line ?? 240;
    const rule = p.lineRule ?? 'auto';
    if (rule === 'exact') return `${px(line)}px`;
    if (rule === 'atLeast') return `${round(Math.max(px(line), fontPx * 1.3))}px`;
    const multiple = line / 240;
    if (this.grid > 0 && p.snapToGrid !== false) {
      const lines = Math.max(1, Math.ceil((fontPx * 1.3) / this.grid - 0.05));
      return `${round(lines * this.grid * multiple)}px`;
    }
    return round(1.2 * multiple * 100) / 100;
  }

  private readBlocks(
    nodes: XmlElement[],
    top: boolean,
    inherited?: { p: ParaProps; r: RunProps },
  ): LBlock[] {
    const blocks: LBlock[] = [];
    const push = (block: LBlock) => {
      if (this.pendingBreak && top) {
        block.breakBefore = true;
        this.pendingBreak = false;
      }
      blocks.push(block);
    };
    for (const node of nodes) {
      switch (node.name) {
        case 'w:p':
          for (const block of this.readParagraph(node, top, inherited)) push(block);
          break;
        case 'w:tbl': {
          const table = this.readTable(node, top);
          if (table) push(table);
          break;
        }
        case 'w:sdt':
          for (const block of this.readBlocks(
            elements(child(node, 'w:sdtContent') ?? node),
            top,
            inherited,
          )) {
            push(block);
          }
          break;
        case 'w:customXml':
        case 'w:ins':
        case 'w:moveTo':
          for (const block of this.readBlocks(elements(node), top, inherited)) push(block);
          break;
        case 'w:altChunk':
          this.count('altChunk');
          break;
        default:
          break;
      }
    }
    for (let i = 0; i + 1 < blocks.length; i++) {
      const a = blocks[i];
      const b = blocks[i + 1];
      if (a.kind !== 'p' || b.kind !== 'p' || !a.style || a.style !== b.style) continue;
      if (a.contextual) setSpace(a, 2, 0);
      if (b.contextual) setSpace(b, 0, 0);
    }
    if (top) {
      // A short label right before a table ("Table 1:") should not stay
      // behind at the foot of a page when the table moves on.
      for (let i = 0; i + 1 < blocks.length; i++) {
        const block = blocks[i];
        if (block.kind === 'p' && blocks[i + 1].kind === 'table') {
          const length = block.runs.reduce(
            (sum, run) => sum + (run.kind === 'text' ? run.text.trim().length : 0),
            0,
          );
          if (length > 0 && length <= 40) block.keepNext = true;
        }
      }
    }
    return blocks;
  }

  private readParagraph(
    p: XmlElement,
    top: boolean,
    inherited: { p: ParaProps; r: RunProps } = { p: {}, r: {} },
  ): LBlock[] {
    const pPr = child(p, 'w:pPr');
    const styleId = val(child(pPr, 'w:pStyle')) ?? this.defaultParagraph;
    const styled = this.chain(styleId);
    const direct = readPPr(pPr);
    const styleP = mergeP(this.defaults.p, inherited.p, ...styled.map((style) => style.p));
    const numId = direct.numId ?? styleP.numId;
    const ilvl = direct.ilvl ?? styleP.ilvl ?? 0;
    const level = numId && numId !== '0' ? this.numbering.get(numId)?.get(ilvl) : undefined;
    const props = mergeP(styleP, level?.p ?? {}, direct);
    const baseR = mergeR(this.defaults.r, inherited.r, ...styled.map((style) => style.r));
    const markR = mergeR(baseR, readRPr(child(pPr, 'w:rPr')));
    const heading = this.headingLevel(styleId, num(val(child(pPr, 'w:outlineLvl'))));

    const extra: LBlock[] = [];
    const segments: LRun[][] = [[]];
    const breaks: number[] = [];
    this.readInline(p, baseR, undefined, segments, breaks, extra);

    const fontPx = round(((markR.sz ?? baseR.sz ?? 20) * 2) / 3);
    const blocks: LBlock[] = [];
    segments.forEach((runs, index) => {
      if (index > 0 && runs.length === 0 && index === segments.length - 1) return;
      const block: LParagraph = {
        kind: 'p',
        css: this.paragraphCss(props, runs, fontPx, top),
        mark: this.runCss(markR),
        runs,
        ...(styleId ? { style: styleId } : {}),
        ...(props.contextual ? { contextual: true } : {}),
        ...(heading ? { heading: Math.min(heading, 6) } : {}),
        ...(props.keepNext && top ? { keepNext: true } : {}),
        ...((props.pageBreakBefore || index > 0) && top ? { breakBefore: true } : {}),
      };
      if (index === 0 && level) {
        // A bullet's symbol font is gone once its glyph is mapped to Unicode.
        const markerR =
          level.fmt === 'bullet'
            ? { ...mergeR(markR, level.r), ascii: markR.ascii, eastAsia: markR.eastAsia }
            : mergeR(markR, level.r);
        const marker = this.marker(numId as string, ilvl, level, markerR, props, fontPx);
        if (marker) block.runs.unshift(marker);
      }
      for (const run of runs) {
        if (run.kind === 'text') this.tally(run);
      }
      blocks.push(block);
    });
    if (breaks.length > 0 && segments[segments.length - 1].length === 0 && top)
      this.pendingBreak = true;
    return [...blocks, ...extra];
  }

  private tally(run: Extract<LRun, { kind: 'text' }>) {
    const chars = run.text.replace(/\s/g, '').length;
    if (chars === 0) return;
    const font = String(run.css.fontFamily).slice(6);
    this.fontUse.set(font, (this.fontUse.get(font) ?? 0) + chars);
    const size = Number(run.css.fontSize);
    this.sizeUse.set(size, (this.sizeUse.get(size) ?? 0) + chars);
  }

  private marker(
    numId: string,
    ilvl: number,
    level: Level,
    r: RunProps,
    p: ParaProps,
    fontPx: number,
  ): LRun | null {
    const levels = this.numbering.get(numId);
    const counters = (this.counters.get(numId) ?? []).slice(0, ilvl + 1);
    counters[ilvl] = (counters[ilvl] ?? level.start - 1) + 1;
    this.counters.set(numId, counters);
    let text: string;
    if (level.fmt === 'bullet') text = bulletText(level.text);
    else {
      text = level.text.replace(/%(\d)/g, (_, d: string) => {
        const at = Number(d) - 1;
        const lvl = levels?.get(at);
        const value = counters[at] ?? lvl?.start ?? 1;
        return formatNumber(value, at === ilvl ? level.fmt : (lvl?.fmt ?? 'decimal'));
      });
    }
    if (!text) return null;
    const hanging = p.hanging
      ? this.hx(p.hanging)
      : p.hangingChars
        ? (p.hangingChars / 100) * fontPx
        : 0;
    if (level.suff === 'space') text += ' ';
    const css = this.runCss({ ...r, u: undefined });
    return { kind: 'marker', text, css, width: level.suff === 'tab' ? round(hanging) : 0 };
  }

  private paragraphCss(p: ParaProps, runs: LRun[], fontPx: number, top: boolean): Css {
    const css: Css = {};
    const align = p.jc;
    if (align === 'center') css.textAlign = 'center';
    else if (align === 'right' || align === 'end') css.textAlign = 'right';
    else if (align === 'both' || align === 'distribute' || align === 'thaiDistribute')
      css.textAlign = 'justify';

    // Word writes the twips it laid a character-unit indent out at next to
    // it; those match its page better than any guess at the character width.
    const chars = (value: number | undefined) => (value ? (value / 100) * fontPx : 0);
    let left = p.left !== undefined ? this.hx(p.left) : chars(p.leftChars);
    let right = p.right !== undefined ? this.hx(p.right) : chars(p.rightChars);
    const indent = p.hanging
      ? -this.hx(p.hanging)
      : p.hangingChars
        ? -chars(p.hangingChars)
        : p.firstLine
          ? this.hx(p.firstLine)
          : chars(p.firstLineChars);
    if (!top) {
      // Inside a cell, text pushed past the cell's edge would print over its neighbour.
      left = Math.max(0, left);
      right = Math.max(0, right);
    } else {
      // Word lets a negative indent reach into the margin; the sheet's edge is the limit here.
      left = Math.max(left + this.insetLeft, -this.padding);
      right = Math.max(right + this.insetRight, -this.padding);
    }
    const lines = (value: number | undefined) =>
      value ? (value / 100) * (this.grid || fontPx * 1.2) : 0;
    const before = p.beforeAuto
      ? 14
      : p.beforeLines !== undefined
        ? lines(p.beforeLines)
        : px(p.before ?? 0);
    const after = p.afterAuto
      ? 14
      : p.afterLines !== undefined
        ? lines(p.afterLines)
        : px(p.after ?? 0);
    css.margin = `${round(before)}px ${round(right)}px ${round(after)}px ${round(left)}px`;
    // A hanging first line in a cell would print over the cell to its left.
    const firstLine = top ? indent : Math.max(indent, -left);
    if (firstLine) css.textIndent = round(firstLine);
    css.lineHeight = this.lineHeight(p, fontPx);
    if (p.shd) css.background = p.shd;
    const sides = p.borders;
    if (sides) {
      for (const side of ['top', 'left', 'bottom', 'right'] as const) {
        const border = borderCss(sides[side]);
        if (border && border !== 'none') {
          css[`border${side[0].toUpperCase()}${side.slice(1)}`] = border;
          css[`padding${side[0].toUpperCase()}${side.slice(1)}`] = 2;
        }
      }
    }
    if (runs.some((run) => run.kind === 'text' && /\t| {2}/.test(run.text))) {
      css.whiteSpace = 'pre-wrap';
      css.tabSize = `${this.hx(this.tabStop)}px`;
    }
    return css;
  }

  private fieldHref(): string | undefined {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const field = this.fields[i];
      if (field.result && field.href) return field.href;
    }
    return undefined;
  }

  private readInline(
    node: XmlElement,
    baseR: RunProps,
    href: string | undefined,
    segments: LRun[][],
    breaks: number[],
    extra: LBlock[],
  ) {
    for (const entry of node.children) {
      if (typeof entry === 'string') continue;
      switch (entry.name) {
        case 'w:r':
          this.readRun(entry, baseR, href, segments, breaks, extra);
          break;
        case 'w:hyperlink': {
          const rel = entry.attrs['r:id'] ? this.pkg.rels.get(entry.attrs['r:id']) : undefined;
          const target = rel?.external && isSafeHref(rel.target) ? rel.target : undefined;
          this.readInline(entry, baseR, target ?? href, segments, breaks, extra);
          break;
        }
        case 'w:ins':
        case 'w:moveTo':
          this.count('insertion');
          this.readInline(entry, baseR, href, segments, breaks, extra);
          break;
        case 'w:del':
        case 'w:moveFrom':
          this.count('deletion');
          break;
        case 'w:sdt':
          this.readInline(
            child(entry, 'w:sdtContent') ?? entry,
            baseR,
            href,
            segments,
            breaks,
            extra,
          );
          break;
        case 'w:smartTag':
        case 'w:customXml':
        case 'w:fldSimple':
        case 'w:dir':
        case 'w:bdo':
        case 'm:oMathPara':
          this.readInline(entry, baseR, href, segments, breaks, extra);
          break;
        case 'm:oMath': {
          this.count('math');
          const text = descendants(entry, 'm:t').map(textContent).join('');
          this.text.push(text);
          segments[segments.length - 1].push({
            kind: 'text',
            text,
            css: this.runCss({ ...baseR, i: true }),
          });
          break;
        }
        case 'mc:AlternateContent': {
          const choice = child(entry, 'mc:Choice') ?? child(entry, 'mc:Fallback');
          if (choice) this.readInline(choice, baseR, href, segments, breaks, extra);
          break;
        }
        default:
          break;
      }
    }
  }

  private readRun(
    run: XmlElement,
    baseR: RunProps,
    href: string | undefined,
    segments: LRun[][],
    breaks: number[],
    extra: LBlock[],
  ) {
    const rPr = child(run, 'w:rPr');
    const charStyle = this.chain(val(child(rPr, 'w:rStyle')));
    const r = mergeR(baseR, ...charStyle.map((style) => style.r), readRPr(rPr));
    if (r.vanish) return;
    const css = this.runCss(r);
    const underlined = !!r.u && r.u !== 'none';
    const vert = r.vert === 'superscript' ? 'sup' : r.vert === 'subscript' ? 'sub' : undefined;
    const out = () => segments[segments.length - 1];
    const push = (text: string) => {
      if (text === '' || this.fields.some((field) => !field.result)) return;
      this.text.push(text);
      const link = href ?? this.fieldHref();
      if (underlined) {
        // Underlined spaces are a line to write on; HTML would draw nothing.
        for (const part of text.split(/([\t 　 ]{2,}|\t|　+)/)) {
          if (part === '') continue;
          if (/^[\t 　 ]+$/.test(part) && (part.length > 1 || /[\t　]/.test(part))) {
            out().push({ kind: 'blank', width: this.blankWidth(part), css });
          } else {
            out().push({
              kind: 'text',
              text: part,
              css,
              ...(link ? { href: link } : {}),
              ...(vert ? { vert } : {}),
            });
          }
        }
        return;
      }
      out().push({
        kind: 'text',
        text,
        css,
        ...(link ? { href: link } : {}),
        ...(vert ? { vert } : {}),
      });
    };
    for (const node of run.children) {
      if (typeof node === 'string') continue;
      switch (node.name) {
        case 'w:t':
          push(textContent(node).replace(/\r?\n/g, ' '));
          break;
        case 'w:tab':
        case 'w:ptab':
          push('\t');
          break;
        case 'w:noBreakHyphen':
          push('‑');
          break;
        case 'w:sym': {
          const code = parseInt(node.attrs['w:char'] ?? '', 16);
          if (Number.isFinite(code)) push(bulletText(String.fromCodePoint(code)));
          break;
        }
        case 'w:br': {
          const type = node.attrs['w:type'];
          if (type === 'page') {
            breaks.push(segments.length);
            segments.push([]);
          } else if (type !== 'column') out().push({ kind: 'break' });
          break;
        }
        case 'w:cr':
          out().push({ kind: 'break' });
          break;
        case 'w:drawing':
        case 'w:pict':
        case 'w:object':
          this.readDrawing(node, out(), extra);
          break;
        case 'w:footnoteReference':
        case 'w:endnoteReference':
          this.readNote(node, css, out());
          break;
        case 'w:commentReference':
          this.count('comment');
          break;
        case 'w:fldChar': {
          const type = node.attrs['w:fldCharType'];
          if (type === 'begin') this.fields.push({ instr: '', result: false });
          else if (type === 'separate' && this.fields.length > 0) {
            const field = this.fields[this.fields.length - 1];
            field.result = true;
            const target = field.instr.match(/^\s*HYPERLINK\s+"([^"]+)"/i)?.[1];
            if (target && !/\\l/.test(field.instr.split('"')[0]) && isSafeHref(target)) {
              field.href = target;
            }
          } else if (type === 'end') this.fields.pop();
          break;
        }
        case 'w:instrText':
          if (this.fields.length > 0)
            this.fields[this.fields.length - 1].instr += textContent(node);
          break;
        case 'mc:AlternateContent': {
          const choice = child(node, 'mc:Choice') ?? child(node, 'mc:Fallback');
          if (choice)
            this.readRun(
              { ...run, children: [...(rPr ? [rPr] : []), ...choice.children] },
              baseR,
              href,
              segments,
              breaks,
              extra,
            );
          break;
        }
        default:
          break;
      }
    }
  }

  private blankWidth(space: string): string {
    let em = 0;
    let tabs = 0;
    for (const char of space) {
      if (char === '\t') tabs++;
      else if (char === '　') em += 1;
      else em += 0.5;
    }
    const tabPx = tabs * this.hx(this.tabStop);
    if (tabPx && em) return `calc(${round(em)}em + ${round(tabPx)}px)`;
    return tabPx ? `${round(tabPx)}px` : `${round(em)}em`;
  }

  private readNote(node: XmlElement, css: Css, out: LRun[]) {
    const endnote = node.name === 'w:endnoteReference';
    const part = endnote
      ? this.pkg.partOf('/endnotes', 'endnotes.xml')
      : this.pkg.partOf('/footnotes', 'footnotes.xml');
    const note =
      part &&
      elements(part, endnote ? 'w:endnote' : 'w:footnote').find(
        (el) => el.attrs['w:id'] === node.attrs['w:id'],
      );
    if (!note) return;
    this.count('note');
    const n = this.notes.length + 1;
    out.push({ kind: 'text', text: String(n), css, vert: 'sup' });
    const paragraphs = elements(note, 'w:p').flatMap((p) => this.readParagraph(p, true));
    const first = paragraphs.find((block): block is LParagraph => block.kind === 'p');
    if (first) first.runs.unshift({ kind: 'text', text: `${n} `, css: { ...css }, vert: 'sup' });
    for (const block of paragraphs) if (block.kind === 'p') this.notes.push(block);
  }

  private readDrawing(el: XmlElement, out: LRun[], extra: LBlock[]) {
    const boxes = descendants(el, 'w:txbxContent');
    for (const box of boxes) {
      this.count('textbox');
      extra.push(...this.readBlocks(elements(box), false).map((block) => this.inset(block)));
    }
    const floating = descendants(el, 'wp:anchor').length > 0;
    const extent = descendants(el, 'wp:extent')[0];
    const width = round((num(extent?.attrs.cx) ?? 0) / 9525);
    const height = round((num(extent?.attrs.cy) ?? 0) / 9525);
    const docPr = descendants(el, 'wp:docPr')[0];
    const alt = (docPr?.attrs.descr || docPr?.attrs.title || '').trim();
    const blips = descendants(el, 'a:blip');
    let found = 0;
    for (const blip of blips) {
      const src = this.image(blip.attrs['r:embed'] ?? blip.attrs['r:link']);
      if (src) {
        out.push({ kind: 'image', src, alt, width, height });
        found++;
      }
    }
    for (const image of descendants(el, 'v:imagedata')) {
      const shape = descendants(el, 'v:shape')[0];
      const style = shape?.attrs.style ?? '';
      const size = (key: string) => {
        const match = style.match(new RegExp(`${key}:\\s*([\\d.]+)(pt|px|in)?`));
        if (!match) return 0;
        const value = Number(match[1]);
        return round(match[2] === 'px' ? value : match[2] === 'in' ? value * 96 : (value * 4) / 3);
      };
      const src = this.image(image.attrs['r:id']);
      if (src) {
        out.push({
          kind: 'image',
          src,
          alt: (image.attrs['o:title'] ?? '').trim(),
          width: size('width'),
          height: size('height'),
        });
        found++;
      }
    }
    if (found > 0 && floating) this.count('floating', found);
    if (boxes.length === 0 && blips.length === 0 && descendants(el, 'v:imagedata').length === 0) {
      this.count('drawing');
    }
  }

  private inset(block: LBlock): LBlock {
    if (block.kind !== 'p') return block;
    return {
      ...block,
      css: { ...block.css, marginLeft: this.insetLeft, marginRight: this.insetRight },
    };
  }

  private image(relId: string | undefined): string | null {
    const rel = relId ? this.pkg.rels.get(relId) : undefined;
    if (!rel) {
      this.count('missingImage');
      return null;
    }
    if (rel.external) {
      if (/^https?:\/\//i.test(rel.target)) return rel.target;
      this.count('missingImage');
      return null;
    }
    const part = resolvePart(this.pkg.mainDir, rel.target);
    if (UNSHOWABLE_IMAGE_RE.test(part)) {
      this.count('unshowable');
      return null;
    }
    const data = this.pkg.files[part];
    if (!data) {
      this.count('missingImage');
      return null;
    }
    this.media.set(part, data);
    return part;
  }

  private readTable(tbl: XmlElement, top: boolean): LTable | null {
    const tblPr = child(tbl, 'w:tblPr');
    const styleId = val(child(tblPr, 'w:tblStyle')) ?? this.defaultTable;
    const styled = this.chain(styleId);
    const styleTblPrs = styled.map((style) => style.tbl).filter((el): el is XmlElement => !!el);
    const layers = [...styleTblPrs, ...(tblPr ? [tblPr] : [])];
    const pick = (name: string) => {
      let found: XmlElement | undefined;
      for (const layer of layers) found = child(layer, name) ?? found;
      return found;
    };
    const tableBorders: Sides = {};
    for (const layer of layers)
      Object.assign(tableBorders, readSides(child(layer, 'w:tblBorders')));
    const cellMargins: Record<string, number> = { top: 0, left: 108, bottom: 0, right: 108 };
    for (const layer of layers) {
      const mar = child(layer, 'w:tblCellMar');
      for (const side of ['top', 'left', 'bottom', 'right'] as const) {
        const el =
          child(mar, `w:${side}`) ??
          (side === 'left'
            ? child(mar, 'w:start')
            : side === 'right'
              ? child(mar, 'w:end')
              : undefined);
        const w = num(el?.attrs['w:w']);
        if (w !== undefined) cellMargins[side] = w;
      }
    }
    const inherited = {
      p: mergeP(...styled.map((style) => style.p)),
      r: mergeR(...styled.map((style) => style.r)),
    };

    const cols = elements(child(tbl, 'w:tblGrid') ?? tbl, 'w:gridCol').map((col) =>
      this.hx(num(col.attrs['w:w']) ?? 0),
    );
    const trs = elements(tbl, 'w:tr');
    if (trs.length === 0) return null;

    type Slot = {
      cell: LCell;
      row: number;
      col: number;
      span: number;
      lastRow: number;
      tcPr?: XmlElement;
      bottomPr?: XmlElement;
    };
    const grid: Array<Array<Slot | undefined>> = [];
    const rows: LRow[] = [];
    const slots: Slot[] = [];
    let anyRowSpan = false;

    trs.forEach((tr, r) => {
      const trPr = child(tr, 'w:trPr');
      const header = on(child(trPr, 'w:tblHeader')) === true;
      const heightEl = child(trPr, 'w:trHeight');
      const height = num(heightEl?.attrs['w:val']);
      const row: LRow = { css: height ? { height: px(height) } : {}, cells: [], header };
      grid[r] = [];
      let col = num(val(child(trPr, 'w:gridBefore'))) ?? 0;
      if (col > 0)
        row.cells.push({ colSpan: col, rowSpan: 1, css: { border: 'none' }, blocks: [] });
      const tcs = [
        ...elements(tr, 'w:tc'),
        ...elements(tr, 'w:sdt').flatMap((sdt) =>
          elements(child(sdt, 'w:sdtContent') ?? sdt, 'w:tc'),
        ),
      ];
      for (const tc of tcs) {
        const tcPr = child(tc, 'w:tcPr');
        const span = num(val(child(tcPr, 'w:gridSpan'))) ?? 1;
        const vMerge = child(tcPr, 'w:vMerge');
        if (vMerge && val(vMerge) !== 'restart') {
          const above = grid[r - 1]?.[col];
          if (above) {
            above.cell.rowSpan++;
            above.lastRow = r;
            above.bottomPr = tcPr;
            anyRowSpan = true;
            for (let c = col; c < col + span; c++) grid[r][c] = above;
            col += span;
            continue;
          }
        }
        // Table-style paragraph and run properties sit between the defaults
        // and the paragraph's own style.
        const blocks = this.readBlocks(elements(tc), false, inherited);
        const cell: LCell = { colSpan: span, rowSpan: 1, css: {}, blocks };
        const slot: Slot = { cell, row: r, col, span, lastRow: r, ...(tcPr ? { tcPr } : {}) };
        slots.push(slot);
        for (let c = col; c < col + span; c++) grid[r][c] = slot;
        row.cells.push(cell);
        col += span;
      }
      rows.push(row);
    });

    const columns = Math.max(cols.length, ...grid.map((row) => row.length));
    const lastRow = rows.length - 1;
    for (const slot of slots) {
      const tcPr = slot.tcPr;
      const own = readSides(child(tcPr, 'w:tcBorders')) ?? {};
      const ownBottom = slot.bottomPr
        ? readSides(child(slot.bottomPr, 'w:tcBorders'))?.bottom
        : own.bottom;
      const side = (
        mine: Border | undefined,
        edge: boolean,
        outer: keyof Sides,
        inner: keyof Sides,
      ) => mine ?? (edge ? tableBorders[outer] : tableBorders[inner]);
      const borders = {
        borderTop: side(own.top, slot.row === 0, 'top', 'insideH'),
        borderBottom: side(ownBottom, slot.lastRow === lastRow, 'bottom', 'insideH'),
        borderLeft: side(own.left, slot.col === 0, 'left', 'insideV'),
        borderRight: side(own.right, slot.col + slot.span >= columns, 'right', 'insideV'),
      };
      const css: Css = {};
      for (const [key, border] of Object.entries(borders)) {
        const value = borderCss(border);
        if (value) css[key] = value;
      }
      const mar = child(tcPr, 'w:tcMar');
      const margin = (s: 'top' | 'left' | 'bottom' | 'right') => {
        const el =
          child(mar, `w:${s}`) ??
          (s === 'left' ? child(mar, 'w:start') : s === 'right' ? child(mar, 'w:end') : undefined);
        return this.hx(num(el?.attrs['w:w']) ?? cellMargins[s]);
      };
      css.padding = `${margin('top')}px ${margin('right')}px ${margin('bottom')}px ${margin('left')}px`;
      const background = fill(child(tcPr, 'w:shd'));
      if (background) css.background = background;
      const vAlign = val(child(tcPr, 'w:vAlign'));
      css.verticalAlign = vAlign === 'center' ? 'middle' : vAlign === 'bottom' ? 'bottom' : 'top';
      slot.cell.css = css;
    }

    const tblW = pick('w:tblW');
    const wType = tblW?.attrs['w:type'];
    const wValue = num(tblW?.attrs['w:w']);
    const gridWidth = round(cols.reduce((sum, w) => sum + w, 0));
    let width: number | string = gridWidth;
    if (wType === 'dxa' && wValue) width = this.hx(wValue);
    else if (wType === 'pct' && wValue) {
      const percent = String(tblW?.attrs['w:w']).endsWith('%')
        ? Number.parseFloat(String(tblW?.attrs['w:w']))
        : wValue / 50;
      width = round((this.textWidth * percent) / 100);
    }
    const widthPx = typeof width === 'number' ? width : gridWidth;
    const jc = val(pick('w:jc'));
    const indent = this.hx(num(pick('w:tblInd')?.attrs['w:w']) ?? 0);
    let left = indent;
    if (top) {
      if (jc === 'center') left = (this.textWidth - widthPx) / 2;
      else if (jc === 'right' || jc === 'end') left = this.textWidth - widthPx;
      left += this.insetLeft;
      const room = this.textWidth + this.insetLeft + this.insetRight + 2 * this.padding;
      left = Math.max(-this.padding, Math.min(left, room - this.padding - widthPx));
    } else if (jc === 'center') left = 0;
    const css: Css = {
      width: widthPx,
      tableLayout: 'fixed',
      borderCollapse: 'collapse',
      margin: top
        ? `0 0 0 ${round(left)}px`
        : jc === 'center'
          ? '0 auto'
          : `0 0 0 ${round(left)}px`,
    };
    const scale = gridWidth > 0 ? widthPx / gridWidth : 1;
    return {
      kind: 'table',
      css,
      cols: cols.map((w) => round(w * scale)),
      rows,
      splittable: !anyRowSpan && rows.length > 1 && top,
    };
  }
}

/** Rewrites one side of a `margin: top right bottom left` shorthand. */
function setSpace(p: LParagraph, index: number, value: number) {
  const parts = String(p.css.margin ?? '0px 0px 0px 0px').split(' ');
  parts[index] = `${value}px`;
  p.css.margin = parts.join(' ');
}

function isEmptyParagraph(block: LBlock): boolean {
  return (
    block.kind === 'p' &&
    !block.breakBefore &&
    block.runs.every((run) => run.kind === 'text' && run.text.trim() === '')
  );
}

function top<K>(counts: Map<K, number>): K | undefined {
  let best: K | undefined;
  let most = -1;
  for (const [key, n] of counts) {
    if (n > most) {
      best = key;
      most = n;
    }
  }
  return best;
}

function nearestPage(width: number, height: number): PageSizeName {
  let best: PageSizeName = PAGE_SIZE_NAMES[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const name of PAGE_SIZE_NAMES) {
    const size = PAGE_SIZES[name];
    const d = Math.abs(size.width - width) + Math.abs(size.height - height);
    if (d < distance) {
      best = name;
      distance = d;
    }
  }
  return best;
}

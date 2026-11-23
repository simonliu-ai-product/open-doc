import { isSafeHref } from '../app/lib/href.ts';
import { PAGE_SIZE_NAMES, PAGE_SIZES, type PageSizeName } from '../app/lib/sdk.ts';
import {
  DocxError,
  type DocxPackage,
  dirOf,
  num,
  on,
  openDocx,
  type Rel,
  readRels,
  relsPathFor,
  resolvePart,
  symbolText,
  val,
} from './docx-package.ts';
import { metafileToSvg } from './metafile.ts';
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
  | {
      kind: 'text';
      text: string;
      css: Css;
      href?: string;
      vert?: 'sup' | 'sub';
      /** Text Word draws but does not store (a note number, a checkbox's box). */
      generated?: true;
      /** In a header or footer: the sheet's number, or the document's sheet count. */
      field?: 'page' | 'pages';
    }
  | { kind: 'blank'; width: string; css: Css }
  | { kind: 'marker'; text: string; css: Css; width: number }
  | { kind: 'break' }
  | {
      kind: 'image';
      src: string;
      alt: string;
      width: number;
      height: number;
      /** Word floats it: it takes no room in the text, so it pushes nothing down. */
      floating?: true;
      /**
       * Where a floating picture sits: over the text at an offset from the
       * paragraph (`over`), at one side with the text running around it, or
       * on a line of its own.
       */
      place?: {
        mode: 'over' | 'left' | 'right' | 'line';
        left: number;
        top: number;
        /** Space Word keeps between it and the text: top, right, bottom, left. */
        gap: [number, number, number, number];
        behind?: true;
      };
      /** A picture group: each picture at its place inside the group's box. */
      parts?: Array<{
        src: string;
        alt: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }>;
    }
  | { kind: 'ruby'; base: string; rt: string; css: Css }
  /** A drop capital: Word's frame, floated at the start of the paragraph it opens. */
  | { kind: 'drop'; text: string; css: Css }
  /** A bookmark an internal hyperlink points at. */
  | { kind: 'anchor'; id: string }
  /** A footnote: its marker here, its text at the foot of whichever page this lands on. */
  | { kind: 'note'; blocks: LParagraph[] }
  /** A drawn shape with no text or picture in it: a rule across the page, a bar of colour. */
  | { kind: 'shape'; css: Css }
  /** A Word chart, kept as data: open-doc draws it, and it stays editable. */
  | { kind: 'chart'; chart: LChart }
  | {
      /** A text box Word positioned against the paragraph; absolute here too. */
      kind: 'box';
      left: number;
      top: number;
      width: number;
      height: number;
      /**
       * Set when the box spans the line and wraps the text: the paragraph's
       * text starts this far down, under the box, as Word moves it.
       */
      clear?: number;
      /** A spanning box set lower than the text: the paragraph ends this far past its last line. */
      after?: number;
      css: Css;
      blocks: LBlock[];
    };

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
export type LRow = {
  css: Css;
  cells: LCell[];
  header: boolean;
  /** Index of the Word row it came from; a row cut in pieces repeats it. */
  source?: number;
};
export type LTable = BlockFlags & {
  kind: 'table';
  css: Css;
  cols: number[];
  rows: LRow[];
  /** No cell spans rows, so the table may break between any two rows. */
  splittable: boolean;
  /** Index of the Word table (top level, document order) it came from; pieces share it. */
  source?: number;
};

export type LBlock = LParagraph | LTable;

export type LChart = {
  type: 'bar' | 'horizontal-bar' | 'line' | 'pie' | 'area';
  /** One row per category: `category`, then a key per series. */
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; name: string }>;
  stacked: boolean;
  values: boolean;
  colors: string[];
  width: number;
  height: number;
  title?: string;
};

/** A header or footer: what Word prints in the margin band of every sheet. */
export type LRunning = {
  /** Distance from the sheet's top edge (header) or bottom edge (footer), px. */
  offset: number;
  /** Word's left and right margins: the band's text runs between them. */
  left: number;
  right: number;
  blocks: LBlock[];
  /** Different first page: what the section's first sheet prints instead. */
  first?: LBlock[];
};

export type LSection = {
  /** The page's padding: Word's top and bottom margins, the smaller side margin. */
  padding: { top: number; right: number; bottom: number; left: number };
  blocks: LBlock[];
  header?: LRunning;
  footer?: LRunning;
  /** Word's newspaper columns, as many as `flow()` sets (up to three). */
  columns?: { count: 2 | 3; gap: number };
};

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
  bdr?: Border;
  smallCaps?: boolean;
  position?: number;
  rtl?: boolean;
  eastAsianLayout?: boolean;
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
  bidi?: boolean;
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
  /** Conditional formats a table style sets for its first row, bands, corners… */
  conditional?: Map<string, XmlElement>;
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
const FONT_REF = '@font:';
const CJK_FONT_RE =
  /[\u3000-\u9fff\uac00-\ud7af]|ming|song|hei|kai|mincho|gothic|batang|gulim|dotum|simsun|yahei|meiryo|fangsong/i;

/**
 * Word's single line is the font's own line height, not a fixed 1.2. It
 * matters most under a line grid, where a line one hair taller than the
 * pitch takes two grid lines: 新細明體 jumps there from 14pt on 18pt grids,
 * while 標楷體's tighter metrics keep 16pt on one line.
 */
function lineFactor(name: string | undefined): number {
  if (!name) return 1.17;
  for (const [re, factor] of LINE_FACTORS) if (re.test(name)) return factor;
  if (KAI_RE.test(name)) return LINE_KAI;
  if (CJK_FONT_RE.test(name)) return LINE_CJK;
  return 1.17;
}

/**
 * Single line spacing as a multiple of the font size — the font's ascent,
 * descent and line gap, which is what Word sets a "single" line to. Measured
 * from the fonts' metrics; the CJK defaults are calibrated against the line
 * breaks Word recorded in real files (scripts/docx-corpus.mjs).
 */
const LINE_FACTORS: Array<[RegExp, number]> = [
  [/calibri|verdana/i, 1.22],
  [/tahoma/i, 1.21],
  [/segoe/i, 1.33],
  [/aptos/i, 1.2],
  [/cambria|courier|consolas/i, 1.17],
  [/times|arial|helvetica|georgia|garamond|liberation/i, 1.15],
  [/ms (p)?(mincho|gothic)|ｍｓ/i, 1.0],
  [/jhenghei|yahei|正黑|雅黑/i, 1.3],
];
const LINE_KAI = 1.1;
const LINE_CJK = 1.3;

/**
 * Free fonts drawn to another font's widths, so lines break where they did in
 * Word when the original is not installed. Each goes right after the font it
 * stands in for. 全字庫正楷體 (TW-Kai) is close to 標楷體 but not exact; nothing
 * free matches 新細明體's widths.
 */
const METRIC_TWINS: Array<[RegExp, string[]]> = [
  [/^calibri$/i, ['Carlito']],
  [/^cambria$/i, ['Caladea']],
  [/^arial$/i, ['Liberation Sans', 'Arimo']],
  [/^times new roman$/i, ['Liberation Serif', 'Tinos']],
  [/^courier new$/i, ['Liberation Mono', 'Cousine']],
  [/^(標楷體|dfkai-sb|biaukai)$/i, ['TW-Kai', '全字庫正楷體']],
];

function withTwins(name: string): string[] {
  for (const [re, twins] of METRIC_TWINS) if (re.test(name.trim())) return [name, ...twins];
  return [name];
}

const STACKS = {
  serif:
    '"PMingLiU", "MingLiU", "Apple LiSung", "Songti TC", "LiSong Pro", "STSong", "Noto Serif CJK TC", "Noto Serif TC", "Times New Roman", serif',
  kai: '"DFKai-SB", "TW-Kai", "Kaiti TC", "BiauKaiTC", "BiauKai", "STKaiti", "KaiTi", "Noto Serif CJK TC", serif',
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

const UNSHOWABLE_IMAGE_RE = /\.(?:emf|wmf|tiff?|wdp|pdf)$/i;

const WARNINGS: Record<string, (n: number) => string> = {
  textbox: (n) => `${n} text box(es) kept as paragraphs after the text they sit beside`,
  floating: (n) => `${n} floating picture(s) placed in line with the text`,
  comment: (n) => `${n} comment(s) not imported`,
  insertion: (n) => `${n} tracked insertion(s) accepted`,
  deletion: (n) => `${n} tracked deletion(s) accepted (their text is gone)`,
  math: (n) => `${n} equation(s) kept as plain text`,
  drawing: (n) => `${n} chart(s), SmartArt or shape(s) without a picture not imported`,
  unshowable: (n) =>
    `${n} image(s) in a format browsers cannot show (EMF, WMF, TIFF, PDF) not imported`,
  missingImage: (n) => `${n} image(s) missing from the file not imported`,
  evenPages: () => 'even pages print the odd pages’ header and footer',
  hidden: (n) => `${n} passage(s) of hidden text left out, as Word does when printing`,
  eastAsianLayout: (n) =>
    `${n} passage(s) of combined or vertical East Asian characters shown as ordinary text`,
  frame: (n) => `${n} framed paragraph(s) placed in the text flow`,
  columns: (n) => `${n} section(s) with more than three columns set in three`,
  orientation: (n) =>
    `${n} section(s) in the other page orientation printed in the document's own; wide tables there are scaled to fit`,
  tableScaled: (n) => `${n} table(s) wider than the page scaled down to fit`,
  embeddedFonts: () =>
    "the document's embedded fonts were not imported; text falls back to similar installed fonts",
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
  const bdr = readBorder(child(rPr, 'w:bdr'));
  if (bdr) r.bdr = bdr;
  const smallCaps = on(child(rPr, 'w:smallCaps'));
  if (smallCaps !== undefined) r.smallCaps = smallCaps;
  const position = num(val(child(rPr, 'w:position')));
  if (position !== undefined) r.position = position;
  const rtl = on(child(rPr, 'w:rtl'));
  if (rtl !== undefined) r.rtl = rtl;
  if (child(rPr, 'w:eastAsianLayout')) r.eastAsianLayout = true;
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
  const bidi = on(child(pPr, 'w:bidi'));
  if (bidi !== undefined) p.bidi = bidi;
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

export function readDocxLayout(bytes: Uint8Array): DocxLayout {
  const pkg = openDocx(bytes);
  try {
    return new LayoutReader(pkg).read();
  } catch (err) {
    // A damaged part is a fault in the file, and the user needs to hear that,
    // not a stack trace.
    if (err instanceof DocxError) throw err;
    throw new DocxError(
      `could not read this Word document (${err instanceof Error ? err.message : String(err)}) — try opening it in Word and saving it again`,
    );
  }
}

class LayoutReader {
  private styles = new Map<string, Style>();
  private defaults: { p: ParaProps; r: RunProps } = { p: {}, r: {} };
  private defaultParagraph?: string;
  private defaultTable?: string;
  private numbering = new Map<string, Map<number, Level>>();
  private counters = new Map<string, number[]>();
  private theme = new Map<string, string>();
  /** The theme's colour scheme: accent1–6, dk1, lt1, dk2, lt2, hyperlinks. */
  private themeColors = new Map<string, string>();
  private tabStop = 720;
  private counts = new Map<string, number>();
  private media = new Map<string, Uint8Array>();
  private text: string[] = [];
  private fonts = new Map<string, string>();
  private fontUse = new Map<string, number>();
  private sizeUse = new Map<number, number>();
  private fields: Array<{
    instr: string;
    result: boolean;
    href?: string;
    page?: 'page' | 'pages';
    shown?: boolean;
  }> = [];
  /** The part being read and its relationships: the body, or a header or footer. */
  private partRels?: Map<string, Rel>;
  private partDir?: string;
  private inRunning = false;
  /** While reading a header or footer: which, and its distance from the sheet's edge. */
  private runningEdge?: { kind: 'header' | 'footer'; offset: number };
  private pageHeight = 1123;
  private marginTop = 96;
  private marginBottom = 96;
  /** The headers and footers each section inherits unless it names its own. */
  private running: Record<string, Record<string, LBlock[] | undefined>> = {
    header: {},
    footer: {},
  };
  private notes: LParagraph[] = [];
  private grid = 0;
  private scaleX = 1;
  private textWidth = 624;
  private insetLeft = 0;
  private insetRight = 0;
  private padding = 0;
  private pendingBreak = false;
  private pendingDrop: LRun | null = null;
  private anchors = new Set<string>();
  private tables = 0;
  private cjk = false;

  constructor(private pkg: DocxPackage) {}

  read(): DocxLayout {
    const { pkg } = this;
    this.readStyles(pkg.partOf('/styles', 'styles.xml'));
    this.readNumbering(pkg.partOf('/numbering', 'numbering.xml'));
    this.readTheme(pkg.partOf('/theme', 'theme/theme1.xml'));
    if (Object.keys(pkg.files).some((name) => /\.odttf$/i.test(name))) {
      this.counts.set('embeddedFonts', 1);
    }
    const settings = pkg.partOf('/settings', 'settings.xml');
    this.tabStop = num(val(child(settings, 'w:defaultTabStop'))) ?? 720;
    this.cjk = CJK_RE.test(textContent(pkg.body).slice(0, 4000));
    for (const link of descendants(pkg.body, 'w:hyperlink')) {
      if (link.attrs['w:anchor']) this.anchors.add(link.attrs['w:anchor']);
    }

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
      const continuous = val(child(sectPr, 'w:type')) === 'continuous';
      const margin = child(sectPr, 'w:pgMar');
      const m = (name: string, fallback: number) => num(margin?.attrs[name]) ?? fallback;
      // A negative top or bottom is an exact margin a tall header may not push.
      const exactTop = m('w:top', 1440) < 0;
      const exactBottom = m('w:bottom', 1440) < 0;
      const top = px(Math.abs(m('w:top', 1440)));
      const bottom = px(Math.abs(m('w:bottom', 1440)));
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
      this.pageHeight = landscape ? sheet.width : sheet.height;
      this.marginTop = top;
      this.marginBottom = bottom;
      // The page pads both sides with the smaller side margin, and every block
      // makes up the difference on its own side.
      const padding = Math.max(8, Math.min(left, right));
      this.padding = padding;
      this.insetLeft = round(left - padding);
      this.insetRight = round(right - padding);
      const header = this.readRunning(sectPr, 'header', px(m('w:header', 720)));
      const footer = this.readRunning(sectPr, 'footer', px(m('w:footer', 720)));
      // A header taller than its band pushes the text down, as Word does; a
      // footer pushes it up. Floating pictures and boxes take no room. The
      // padding holds for every sheet, so a first page's own (a cover's tall
      // artwork) is left to that page: it would cost every other sheet room.
      const reach = (running: LRunning | undefined, blocks = running?.blocks ?? []) =>
        running
          ? running.offset +
            blocks.reduce((sum, block) => sum + estimateHeight(block, this.textWidth, true), 0)
          : 0;
      const pageTop = round(exactTop ? top : Math.max(top, reach(header)));
      const pageBottom = round(exactBottom ? bottom : Math.max(bottom, reach(footer)));
      const sectSz = child(sectPr, 'w:pgSz');
      const sectLandscape =
        sectSz?.attrs['w:orient'] === 'landscape' ||
        (num(sectSz?.attrs['w:w']) ?? 0) > (num(sectSz?.attrs['w:h']) ?? Number.POSITIVE_INFINITY);
      if (sectSz && sectLandscape !== landscape) this.count('orientation');
      this.pendingBreak = false;
      const blocks = collapseBlankPages(this.readBlocks(group.nodes, true));
      // Empty paragraphs at the end of a section print nothing; they only
      // risk pushing a blank sheet out of a page that was full to the margin.
      while (blocks.length > 0 && isBlank(blocks[blocks.length - 1])) blocks.pop();
      const previous = sections[sections.length - 1];
      // The document's first sheet carries its own header (a cover's banner):
      // a taller one pushes that sheet's text down without costing the rest.
      if (!previous && header?.first && blocks.length > 0) {
        const extra = round(reach(header, header.first) - pageTop);
        if (extra > 0)
          blocks.unshift({ kind: 'p', css: { margin: 0, height: extra }, mark: {}, runs: [] });
      }
      // A section already starts a new sheet; a break on its first block would leave one blank.
      if (blocks[0] && !(continuous && previous)) blocks[0].breakBefore = false;
      if (continuous && previous) previous.blocks.push(...blocks);
      else {
        const cols = child(sectPr, 'w:cols');
        const count = num(cols?.attrs['w:num']) ?? 1;
        if (count > 3) this.count('columns');
        sections.push({
          padding: {
            top: pageTop,
            right: round(padding),
            bottom: pageBottom,
            left: round(padding),
          },
          blocks,
          ...(header ? { header } : {}),
          ...(footer ? { footer } : {}),
          ...(count > 1
            ? {
                columns: {
                  count: Math.min(count, 3) as 2 | 3,
                  gap: this.hx(num(cols?.attrs['w:space']) ?? 720),
                },
              }
            : {}),
        });
      }
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

  /**
   * A section's header or footer. A section that names none keeps the one
   * before it, as Word does; a first-page one prints only with
   * "different first page" set. Even pages print the odd pages' one.
   */
  private readRunning(
    sectPr: XmlElement | undefined,
    kind: 'header' | 'footer',
    offset: number,
  ): LRunning | undefined {
    const memory = this.running[kind];
    for (const ref of sectPr ? descendants(sectPr, `w:${kind}Reference`) : []) {
      const type = ref.attrs['w:type'] ?? 'default';
      this.runningEdge = { kind, offset };
      const blocks = this.readRunningPart(ref.attrs['r:id']);
      this.runningEdge = undefined;
      if (type === 'even') {
        if (blocks.length > 0) this.count('evenPages');
        continue;
      }
      memory[type] = blocks;
    }
    const titlePg = sectPr ? on(child(sectPr, 'w:titlePg')) : false;
    const blocks = memory.default ?? [];
    const first = titlePg ? (memory.first ?? []) : undefined;
    if (blocks.length === 0 && !first?.length) return undefined;
    return {
      offset,
      left: round(this.padding + this.insetLeft),
      right: round(this.padding + this.insetRight),
      blocks,
      ...(first ? { first } : {}),
    };
  }

  private readRunningPart(relId: string | undefined): LBlock[] {
    const rel = relId ? this.pkg.rels.get(relId) : undefined;
    if (!rel || rel.external) return [];
    const partName = resolvePart(this.pkg.mainDir, rel.target);
    const part = this.pkg.xmlPart(partName);
    if (!part) return [];
    const drawn =
      descendants(part, 'w:drawing').length > 0 || descendants(part, 'w:pict').length > 0;
    if (textContent(part).trim() === '' && !drawn) return [];
    // What the margin prints is not body text: the body's tallies stay its own.
    const saved = {
      text: this.text.length,
      fontUse: new Map(this.fontUse),
      sizeUse: new Map(this.sizeUse),
      fields: this.fields,
      pendingBreak: this.pendingBreak,
    };
    this.partRels = readRels(this.pkg.xmlPart(relsPathFor(partName)));
    this.partDir = dirOf(partName);
    this.inRunning = true;
    this.fields = [];
    try {
      const blocks = this.readBlocks(elements(part), false);
      while (blocks.length > 0 && isBlank(blocks[blocks.length - 1])) blocks.pop();
      return blocks.some((block) => !isBlank(block)) ? blocks : [];
    } finally {
      this.text.length = saved.text;
      this.fontUse = saved.fontUse;
      this.sizeUse = saved.sizeUse;
      this.fields = saved.fields;
      this.pendingBreak = saved.pendingBreak;
      this.partRels = undefined;
      this.partDir = undefined;
      this.inRunning = false;
    }
  }

  /** A chart part's type, series and cached values; null for a kind open-doc cannot draw. */
  private readChart(relId: string | undefined, width: number, height: number): LChart | null {
    const rel = this.rel(relId);
    if (!rel || rel.external) return null;
    const xml = this.pkg.xmlPart(resolvePart(this.partDir ?? this.pkg.mainDir, rel.target));
    const plot = xml && descendants(xml, 'c:plotArea')[0];
    if (!plot) return null;
    const kinds: Array<[string, LChart['type']]> = [
      ['c:barChart', 'bar'],
      ['c:bar3DChart', 'bar'],
      ['c:lineChart', 'line'],
      ['c:line3DChart', 'line'],
      ['c:pieChart', 'pie'],
      ['c:pie3DChart', 'pie'],
      ['c:doughnutChart', 'pie'],
      ['c:areaChart', 'area'],
      ['c:area3DChart', 'area'],
    ];
    const found = kinds.find(([name]) => elements(plot, name).length > 0);
    if (!found) return null;
    const group = elements(plot, found[0])[0];
    let type = found[1];
    if (type === 'bar' && val(child(group, 'c:barDir')) === 'bar') type = 'horizontal-bar';
    const grouping = val(child(group, 'c:grouping')) ?? '';
    const points = (el: XmlElement | undefined): string[] => {
      const cache =
        el && descendants(el, 'c:strCache')[0]
          ? descendants(el, 'c:strCache')[0]
          : el && descendants(el, 'c:numCache')[0];
      const lit = el && (child(el, 'c:strLit') ?? child(el, 'c:numLit'));
      const source = cache ?? lit;
      if (!source) return [];
      const out: string[] = [];
      for (const pt of elements(source, 'c:pt')) {
        out[num(pt.attrs.idx) ?? out.length] = textContent(child(pt, 'c:v') ?? pt);
      }
      return out;
    };
    const series = elements(group, 'c:ser');
    if (series.length === 0) return null;
    const categories = points(child(series[0], 'c:cat'));
    const rows: Array<Record<string, string | number>> = [];
    const named: LChart['series'] = [];
    const colors: string[] = [];
    series.forEach((ser, index) => {
      const key = `s${index + 1}`;
      const tx = child(ser, 'c:tx');
      const name =
        (tx && (points(tx)[0] ?? textContent(child(tx, 'c:v') ?? tx))) || `Series ${index + 1}`;
      named.push({ key, name: name.trim() });
      const values = points(child(ser, 'c:val'));
      values.forEach((value, i) => {
        rows[i] ??= { category: categories[i] ?? String(i + 1) };
        rows[i][key] = Number(value) || 0;
      });
      const fill = child(child(ser, 'c:spPr'), 'a:solidFill');
      const color = this.drawingColor(fill);
      if (color && type !== 'pie') colors.push(color);
    });
    if (type === 'pie') {
      // A pie colours its slices, one data point at a time.
      for (const dPt of elements(series[0], 'c:dPt')) {
        const color = this.drawingColor(child(child(dPt, 'c:spPr'), 'a:solidFill'));
        if (color) colors[num(val(child(dPt, 'c:idx'))) ?? colors.length] = color;
      }
    }
    const labels = descendants(group, 'c:showVal')[0];
    const titleEl = descendants(xml, 'c:title')[0];
    const title = titleEl ? descendants(titleEl, 'a:t').map(textContent).join('').trim() : '';
    return {
      type,
      data: rows.filter(Boolean),
      series: named,
      stacked: grouping === 'stacked' || grouping === 'percentStacked',
      values: !!on(labels),
      colors: colors.filter(Boolean),
      width,
      height,
      ...(title ? { title } : {}),
    };
  }

  private pageField(instr: string): 'page' | 'pages' | undefined {
    const name = instr.trim().split(/\s+/)[0]?.toUpperCase();
    if (name === 'PAGE') return 'page';
    if (name === 'NUMPAGES') return 'pages';
    return undefined;
  }

  private rel(relId: string | undefined): Rel | undefined {
    if (!relId) return undefined;
    return (this.partRels ?? this.pkg.rels).get(relId);
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
        ...(elements(el, 'w:tblStylePr').length > 0
          ? {
              conditional: new Map(
                elements(el, 'w:tblStylePr').map((cond) => [cond.attrs['w:type'] ?? '', cond]),
              ),
            }
          : {}),
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
    const scheme = descendants(xml, 'a:clrScheme')[0];
    for (const slot of scheme ? elements(scheme) : []) {
      const color = elements(slot)[0];
      const value = color?.attrs.val ?? color?.attrs.lastClr;
      if (value) this.themeColors.set(slot.name.replace(/^a:/, ''), `#${value}`);
    }
  }

  /** A drawing colour: written out, or the theme's, as a shape's fill or line names it. */
  private drawingColor(fill: XmlElement | undefined): string | undefined {
    const rgb = child(fill, 'a:srgbClr')?.attrs.val;
    if (rgb) return `#${rgb}`;
    const scheme = child(fill, 'a:schemeClr')?.attrs.val;
    if (!scheme) return undefined;
    const alias: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    return this.themeColors.get(alias[scheme] ?? scheme);
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
    const named = [
      ...new Set([ascii, eastAsia].filter((name): name is string => !!name).flatMap(withTwins)),
    ];
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
    const border = borderCss(r.bdr);
    if (border && border !== 'none') css.border = border;
    if (r.smallCaps) css.fontVariant = 'small-caps';
    // w:position raises or lowers the run in half-points.
    if (r.position) css.verticalAlign = `${round(((r.position / 2) * 4) / 3)}px`;
    if (r.rtl) {
      css.direction = 'rtl';
      css.unicodeBidi = 'embed';
    }
    return css;
  }

  private lineHeight(p: ParaProps, fontPx: number, factor: number): string | number {
    const line = p.line ?? 240;
    const rule = p.lineRule ?? 'auto';
    if (rule === 'exact') return `${px(line)}px`;
    if (rule === 'atLeast') return `${round(Math.max(px(line), fontPx * factor))}px`;
    const multiple = line / 240;
    if (this.grid > 0 && p.snapToGrid !== false) {
      const lines = Math.max(1, Math.ceil((fontPx * factor) / this.grid - 0.001));
      return `${round(lines * this.grid * multiple)}px`;
    }
    return Math.round(factor * multiple * 100) / 100;
  }

  /** The font a paragraph's lines are measured in: East Asian in a CJK document. */
  private primaryFont(r: RunProps): string | undefined {
    const ascii = this.themed(r.ascii);
    const eastAsia = this.themed(r.eastAsia);
    return this.cjk ? (eastAsia ?? ascii) : (ascii ?? eastAsia);
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
        case 'w:tbl':
          for (const table of this.readTable(node, top)) push(table);
          break;
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
    const frame = child(pPr, 'w:framePr');
    const dropCap = frame?.attrs['w:dropCap'];
    if (dropCap === 'drop' || dropCap === 'margin') {
      const texts = segments.flat().filter((run) => run.kind === 'text');
      const first = texts[0];
      if (first && first.kind === 'text') {
        const text = texts.map((run) => (run.kind === 'text' ? run.text : '')).join('');
        this.pendingDrop = {
          kind: 'drop',
          text,
          css: { ...first.css, float: 'left', lineHeight: 0.85, marginRight: '0.06em' },
        };
        return [];
      }
    }
    // A frame Word aligns in its band (a page number centred in the footer)
    // lines its text up the same way; one pinned at an offset from the page
    // stays in the text flow.
    const frameCss: Css = {};
    if (frame && dropCap !== 'drop' && dropCap !== 'margin') {
      const xAlign = frame.attrs['w:xAlign'];
      const w = num(frame.attrs['w:w']);
      const x = num(frame.attrs['w:x']);
      if (w) frameCss.width = this.hx(w);
      if (xAlign === 'center' || xAlign === 'right' || xAlign === 'left') {
        if (w) {
          frameCss.marginLeft = xAlign === 'left' ? 0 : 'auto';
          frameCss.marginRight = xAlign === 'right' ? 0 : 'auto';
        } else frameCss.textAlign = xAlign;
      } else if (x !== undefined && (frame.attrs['w:hAnchor'] ?? 'page') !== 'page') {
        frameCss.marginLeft = this.hx(x);
      } else if (frame.attrs['w:vAnchor'] === 'page' || frame.attrs['w:hAnchor'] === 'page') {
        this.count('frame');
      }
    }
    if (this.pendingDrop) {
      segments[0].unshift(this.pendingDrop);
      this.pendingDrop = null;
    }
    // An instruction that never reached its result would hide everything after it.
    this.fields = this.fields.filter((field) => field.result);

    const fontPx = round(((markR.sz ?? baseR.sz ?? 20) * 2) / 3);
    const blocks: LBlock[] = [];
    segments.forEach((runs, index) => {
      if (index > 0 && runs.length === 0 && index === segments.length - 1) return;
      const block: LParagraph = {
        kind: 'p',
        css: {
          ...this.paragraphCss(props, runs, ...this.tallest(runs, fontPx, markR), top),
          ...frameCss,
        },
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
      const indent = props.left !== undefined ? this.hx(props.left) : 0;
      for (const run of runs) {
        if (run.kind === 'text') this.tally(run);
        // A box is placed from the text column; the paragraph it sits in starts at its indent.
        if (run.kind === 'box') run.left = round(run.left - (top ? indent : Math.max(0, indent)));
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
    if (level.fmt === 'bullet') text = symbolText(level.text);
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

  /** A line is as tall as its tallest run, in that run's own font. */
  private tallest(runs: LRun[], markPx: number, markR: RunProps): [number, number] {
    let size = markPx;
    let factor = lineFactor(this.primaryFont(markR));
    for (const run of runs) {
      if (run.kind !== 'text' || !run.text.trim()) continue;
      const px = Number(run.css.fontSize);
      const stack = this.fonts.get(String(run.css.fontFamily).slice(FONT_REF.length)) ?? '';
      const f = lineFactor(stack.match(/^"([^"]+)"/)?.[1]);
      if (px * f > size * factor) {
        size = px;
        factor = f;
      }
    }
    return [size, factor];
  }

  private paragraphCss(
    p: ParaProps,
    runs: LRun[],
    fontPx: number,
    factor: number,
    top: boolean,
  ): Css {
    const css: Css = {};
    if (p.bidi) css.direction = 'rtl';
    const align = p.jc;
    if (align === 'center') css.textAlign = 'center';
    // In a right-to-left paragraph Word's left and right are its start and end.
    else if (align === 'right' || align === 'end') css.textAlign = p.bidi ? 'end' : 'right';
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
    // As with indents, the twips Word writes beside a line-unit spacing are
    // what it laid the paragraph out with.
    const before = p.beforeAuto ? 14 : p.before !== undefined ? px(p.before) : lines(p.beforeLines);
    const after = p.afterAuto ? 14 : p.after !== undefined ? px(p.after) : lines(p.afterLines);
    css.margin = `${round(before)}px ${round(right)}px ${round(after)}px ${round(left)}px`;
    // A hanging first line in a cell would print over the cell to its left.
    const firstLine = top ? indent : Math.max(indent, -left);
    if (firstLine) css.textIndent = round(firstLine);
    css.lineHeight = this.lineHeight(p, fontPx, factor);
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
    // Word breaks a word longer than the line (a URL, an equation written out)
    // wherever it must; a browser lets it run off the page.
    const joined = runs.map((run) => (run.kind === 'text' ? run.text : ' ')).join('');
    if (/[^\s\u3000-\u9fff]{30,}/u.test(joined)) css.overflowWrap = 'anywhere';
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
          const rel = this.rel(entry.attrs['r:id']);
          const anchor = entry.attrs['w:anchor'];
          const target =
            rel?.external && isSafeHref(rel.target)
              ? rel.target
              : anchor && this.anchors.has(anchor)
                ? `#${anchor}`
                : undefined;
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
        case 'w:sdt': {
          const content = child(entry, 'w:sdtContent') ?? entry;
          // A checkbox control with no glyph of its own still shows its state.
          const checkbox = descendants(child(entry, 'w:sdtPr') ?? entry, 'w14:checkbox')[0];
          if (checkbox && textContent(content).trim() === '') {
            const state = child(checkbox, 'w14:checked')?.attrs['w14:val'];
            const checked = state === '1' || state === 'true';
            const text = checked ? '☒' : '☐';
            this.text.push(text);
            segments[segments.length - 1].push({
              kind: 'text',
              text,
              css: this.runCss(baseR),
              generated: true,
            });
            break;
          }
          this.readInline(content, baseR, href, segments, breaks, extra);
          break;
        }
        case 'w:fldSimple': {
          const instr = entry.attrs['w:instr'] ?? '';
          const page = this.pageField(instr);
          this.fields.push({ instr, result: true, ...(page ? { page } : {}) });
          this.readInline(entry, baseR, href, segments, breaks, extra);
          this.fields.pop();
          break;
        }
        case 'w:smartTag':
        case 'w:customXml':
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
        case 'w:bookmarkStart': {
          const name = entry.attrs['w:name'];
          if (name && this.anchors.has(name))
            segments[segments.length - 1].push({ kind: 'anchor', id: name });
          break;
        }
        case 'w:pPr':
        case 'w:rPr':
          break;
        default:
          // Any other wrapper Word may put around runs (w:sdtContent,
          // w:permStart's siblings, a vendor's custom element) still holds
          // text that must not be lost.
          this.readInline(entry, baseR, href, segments, breaks, extra);
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
    if (r.vanish) {
      if (descendants(run, 'w:t').some((t) => textContent(t).trim() !== '')) this.count('hidden');
      return;
    }
    if (r.eastAsianLayout) this.count('eastAsianLayout');
    const css = this.runCss(r);
    const underlined = !!r.u && r.u !== 'none';
    const vert = r.vert === 'superscript' ? 'sup' : r.vert === 'subscript' ? 'sub' : undefined;
    const out = () => segments[segments.length - 1];
    const push = (text: string) => {
      if (text === '' || this.fields.some((field) => !field.result)) return;
      // A page number in a header or footer is worked out on each sheet;
      // Word's stored result is only what the last sheet it drew showed.
      const pageField = this.inRunning
        ? [...this.fields].reverse().find((field) => field.page)
        : undefined;
      if (pageField?.page) {
        if (pageField.shown) return;
        pageField.shown = true;
        out().push({ kind: 'text', text, css, field: pageField.page });
        return;
      }
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
        case 'w:softHyphen':
          push('\u00ad');
          break;
        case 'w:noBreakHyphen':
          push('‑');
          break;
        case 'w:sym': {
          const code = parseInt(node.attrs['w:char'] ?? '', 16);
          if (Number.isFinite(code))
            push(symbolText(String.fromCodePoint(code), true, node.attrs['w:font']));
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
            const page = this.pageField(field.instr);
            if (page) field.page = page;
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
        case 'w:ruby': {
          const text = (name: string) =>
            descendants(child(node, name) ?? node, 'w:t')
              .map(textContent)
              .join('');
          const base = text('w:rubyBase');
          const rt = text('w:rt');
          if (base && !this.fields.some((field) => !field.result)) {
            this.text.push(base, rt);
            out().push({ kind: 'ruby', base, rt, css });
          }
          break;
        }
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
        case 'w:rPr':
        case 'w:delText':
          break;
        default:
          if (descendants(node, 'w:t').length > 0) {
            this.readRun(
              { ...run, children: [...(rPr ? [rPr] : []), ...node.children] },
              baseR,
              href,
              segments,
              breaks,
              extra,
            );
          }
          break;
      }
    }
  }

  /**
   * How wide a run of underlined spaces draws. A half-width space is a
   * quarter em — even in a CJK face: forms laid out in 標楷體 only fit their
   * lines with Word's blanks at that width, whatever the font's own space.
   */
  private blankWidth(space: string): string {
    const half = 0.25;
    let em = 0;
    let tabs = 0;
    for (const char of space) {
      if (char === '\t') tabs++;
      else if (char === '\u3000') em += 1;
      else em += half;
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
    if (!endnote) {
      // The page's own foot, numbered by the document: flow() keeps room for it.
      const blocks = elements(note, 'w:p')
        .flatMap((p) => this.readParagraph(p, true))
        .filter((block): block is LParagraph => block.kind === 'p');
      out.push({ kind: 'note', blocks });
      return;
    }
    // Endnotes print after the text, where Word puts them.
    const n = this.notes.length + 1;
    out.push({ kind: 'text', text: String(n), css, vert: 'sup', generated: true });
    const paragraphs = elements(note, 'w:p').flatMap((p) => this.readParagraph(p, true));
    const first = paragraphs.find((block): block is LParagraph => block.kind === 'p');
    if (first) {
      first.runs.unshift({
        kind: 'text',
        text: `${n} `,
        css: { ...css },
        vert: 'sup',
        generated: true,
      });
    }
    for (const block of paragraphs) if (block.kind === 'p') this.notes.push(block);
  }

  private readDrawing(el: XmlElement, out: LRun[], extra: LBlock[]) {
    // An empty <w:pict/> draws nothing.
    if (elements(el).length === 0) return;
    const anchor = descendants(el, 'wp:anchor')[0];
    const boxes = descendants(el, 'w:txbxContent');
    // A shape drawn on its own, with no picture: a box, a circle, a line.
    const drawnOnly =
      descendants(el, 'wps:wsp').length > 0 &&
      descendants(el, 'a:blip').length === 0 &&
      descendants(el, 'pic:pic').length === 0;
    if (anchor && (boxes.length > 0 || drawnOnly)) {
      // An empty text box draws nothing, as in Word; a shape that should show
      // and cannot is reported.
      if (!this.anchoredBox(anchor, out) && boxes.length === 0) this.count('drawing');
      return;
    }
    // A chart comes across as its data, drawn by open-doc.
    const chartRef = descendants(el, 'c:chart')[0];
    if (chartRef) {
      const extentEl = descendants(el, 'wp:extent')[0];
      const chart = this.readChart(
        chartRef.attrs['r:id'],
        round((num(extentEl?.attrs.cx) ?? 0) / 9525),
        round((num(extentEl?.attrs.cy) ?? 0) / 9525),
      );
      if (chart) {
        out.push({ kind: 'chart', chart });
        return;
      }
    }
    // The horizontal line Word inserts from HTML: a thin bar across the column.
    const rule = descendants(el, 'v:rect').find((rect) => rect.attrs['o:hr'] === 't');
    if (rule) {
      const height = (rule.attrs.style ?? '').match(/height:\s*([\d.]+)pt/)?.[1];
      const pct = num(rule.attrs['o:hrpct']);
      const align = rule.attrs['o:hralign'] ?? 'center';
      out.push({
        kind: 'shape',
        css: {
          display: 'block',
          width: pct ? `${pct / 10}%` : '100%',
          height: Math.max(1, round(Number(height ?? 1.5) * (4 / 3))),
          background: rule.attrs.fillcolor ?? '#a0a0a0',
          ...(align === 'center'
            ? { margin: '0 auto' }
            : align === 'right'
              ? { marginLeft: 'auto' }
              : {}),
        },
      });
      return;
    }
    const vml = elements(el)
      .flatMap((node) => [
        node,
        ...descendants(node, 'v:shape'),
        ...descendants(node, 'v:rect'),
        ...descendants(node, 'v:oval'),
        ...descendants(node, 'v:roundrect'),
      ])
      .filter(
        (shape, i, all) =>
          all.indexOf(shape) === i &&
          /^v:(shape|rect|oval|roundrect)$/.test(shape.name) &&
          /position:\s*absolute/.test(shape.attrs.style ?? '') &&
          !descendants(shape, 'v:imagedata').length,
      );
    if (vml.length > 0) {
      let drawn = 0;
      for (const shape of vml) if (this.vmlBox(shape, out)) drawn++;
      if (drawn === 0 && boxes.length === 0) this.count('drawing');
      return;
    }
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
    // Pictures Word grouped (a logo cut into pieces) keep their places on
    // the group's own grid; sized by the group alone, they would each fill it.
    const group = descendants(el, 'wpg:wgp')[0];
    const pictures = group ? descendants(group, 'pic:pic') : [];
    if (pictures.length > 1 && width > 0 && height > 0) {
      const gx = child(child(group, 'wpg:grpSpPr'), 'a:xfrm');
      const at = (xfrm: XmlElement | undefined, name: string, a: string, b: string) => [
        num(child(xfrm, name)?.attrs[a]) ?? 0,
        num(child(xfrm, name)?.attrs[b]) ?? 0,
      ];
      const [chX, chY] = at(gx, 'a:chOff', 'x', 'y');
      const [chW, chH] = at(gx, 'a:chExt', 'cx', 'cy');
      const sx = chW ? width / chW : 0;
      const sy = chH ? height / chH : 0;
      const parts = pictures.flatMap((picture) => {
        const blip = descendants(picture, 'a:blip')[0];
        const src = blip && this.image(blip.attrs['r:embed'] ?? blip.attrs['r:link']);
        const xfrm = child(child(picture, 'pic:spPr'), 'a:xfrm');
        const [x, y] = at(xfrm, 'a:off', 'x', 'y');
        const [cx, cy] = at(xfrm, 'a:ext', 'cx', 'cy');
        if (!src || !cx || !cy) return [];
        const name = descendants(picture, 'pic:cNvPr')[0]?.attrs;
        return [
          {
            src,
            alt: (name?.descr || '').trim(),
            left: round((x - chX) * sx),
            top: round((y - chY) * sy),
            width: round(cx * sx),
            height: round(cy * sy),
          },
        ];
      });
      if (parts.length > 0 && sx && sy) {
        out.push({
          kind: 'image',
          src: parts[0].src,
          alt,
          width,
          height,
          parts,
          ...(floating ? { floating: true as const } : {}),
        });
        if (floating) this.count('floating', 1);
        return;
      }
    }
    // A picture that cannot come across keeps its place as an empty frame,
    // so the page around it still lays out as Word's does.
    const placeholder = () => {
      if (width > 0 && height > 0)
        out.push({
          kind: 'image',
          src: '',
          alt,
          width,
          height,
          ...(floating ? { floating: true as const } : {}),
        });
    };
    const place =
      anchor && blips.length === 1 && !group ? this.floatPlace(anchor, width, height) : undefined;
    for (const blip of blips) {
      const src = this.image(blip.attrs['r:embed'] ?? blip.attrs['r:link']);
      if (src && place) {
        out.push({ kind: 'image', src, alt, width, height, floating: true, place });
        found++;
        continue;
      }
      if (src) {
        out.push({
          kind: 'image',
          src,
          alt,
          width,
          height,
          ...(floating ? { floating: true as const } : {}),
        });
        found++;
      } else placeholder();
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
    if (found > 0 && floating && !place) this.count('floating', found);
    if (boxes.length === 0 && blips.length === 0 && descendants(el, 'v:imagedata').length === 0) {
      this.count('drawing');
      placeholder();
    }
  }

  /**
   * A text box Word floats at an offset from its paragraph (`wp:anchor`):
   * placed the same way here, absolutely inside the paragraph, with its own
   * border, fill and insets. One with no text, border or fill draws nothing.
   */
  /**
   * Where Word anchors a floating object, in px from the paragraph's left
   * text edge and top: offsets measured from the page or its left margin are
   * moved onto the text column.
   */
  private anchorPlace(anchor: XmlElement, width: number, height: number) {
    const emu = (value: string | undefined) => round((num(value) ?? 0) / 9525);
    const pageWidth = this.textWidth + this.insetLeft + this.insetRight + 2 * this.padding;
    const axis = (name: string, size: number, room: number) => {
      // Word 2010 writes a percentage offset inside a compatibility wrapper.
      const wrapped = elements(anchor, 'mc:AlternateContent').flatMap((alt) =>
        elements(alt).flatMap((branch) => elements(branch, name)),
      );
      const position = child(anchor, name) ?? wrapped[0];
      const from = position?.attrs.relativeFrom ?? 'column';
      const pct = child(
        position,
        name === 'wp:positionH' ? 'wp14:pctPosHOffset' : 'wp14:pctPosVOffset',
      );
      if (pct && name === 'wp:positionH' && from === 'page') {
        return {
          value: round(((num(textContent(pct)) ?? 0) / 100000) * pageWidth),
          from,
          align: '',
        };
      }
      const offset = child(position, 'wp:posOffset');
      const align = textContent(
        child(position, 'wp:align') ?? { name: '', attrs: {}, children: [] },
      );
      let value = offset ? emu(textContent(offset)) : 0;
      if (!offset && align) {
        if (align === 'center') value = (room - size) / 2;
        else if (align === 'right' || align === 'bottom' || align === 'outside')
          value = room - size;
      }
      return { value, from, align };
    };
    const hFrom =
      (
        child(anchor, 'wp:positionH') ??
        elements(anchor, 'mc:AlternateContent').flatMap((alt) =>
          elements(alt).flatMap((branch) => elements(branch, 'wp:positionH')),
        )[0]
      )?.attrs.relativeFrom ?? 'column';
    const h = axis('wp:positionH', width, hFrom === 'page' ? pageWidth : this.textWidth);
    const vFrom = (
      child(anchor, 'wp:positionV') ??
      elements(anchor, 'mc:AlternateContent').flatMap((alt) =>
        elements(alt).flatMap((branch) => elements(branch, 'wp:positionV')),
      )[0]
    )?.attrs.relativeFrom;
    const marginHeight = this.pageHeight - this.marginTop - this.marginBottom;
    const v = axis(
      'wp:positionV',
      height,
      vFrom === 'page' ? this.pageHeight : vFrom === 'margin' ? marginHeight : 0,
    );
    // An offset from the sheet or its margin, made one from the paragraph:
    // a header's starts at its band, a body's (roughly) at the top margin.
    if (vFrom === 'page' || vFrom === 'margin') {
      const edge = this.runningEdge;
      const paragraphTop = !edge
        ? this.marginTop
        : edge.kind === 'header'
          ? edge.offset
          : this.pageHeight - edge.offset - 20;
      v.value = round(v.value + (vFrom === 'margin' ? this.marginTop : 0) - paragraphTop);
    }
    let left = h.value;
    // Offsets measured from the page or its left margin, not the text column.
    if (h.from === 'page') left -= this.padding + this.insetLeft;
    else if (h.from === 'leftMargin') left -= this.insetLeft + this.padding;
    return { left: round(left), h, v };
  }

  /** How a floating picture sits against the text, from Word's wrapping. */
  private floatPlace(
    anchor: XmlElement,
    width: number,
    height: number,
  ): NonNullable<Extract<LRun, { kind: 'image' }>['place']> {
    const emu = (value: string | undefined) => round((num(value) ?? 0) / 9525);
    const { left, h, v } = this.anchorPlace(anchor, width, height);
    const gap: [number, number, number, number] = [
      emu(anchor.attrs.distT),
      emu(anchor.attrs.distR),
      emu(anchor.attrs.distB),
      emu(anchor.attrs.distL),
    ];
    const top = v.value;
    const around = ['wp:wrapSquare', 'wp:wrapTight', 'wp:wrapThrough'].some(
      (name) => !!child(anchor, name),
    );
    if (child(anchor, 'wp:wrapTopAndBottom')) return { mode: 'line', left, top, gap };
    if (around) {
      // The side it is nearer: text runs down the other one.
      const right = h.align === 'right' || (!h.align && left + width / 2 > this.textWidth / 2);
      return { mode: right ? 'right' : 'left', left, top, gap };
    }
    return {
      mode: 'over',
      left,
      top,
      gap,
      ...(anchor.attrs.behindDoc === '1' ? { behind: true as const } : {}),
    };
  }

  private anchoredBox(anchor: XmlElement, out: LRun[]): boolean {
    const emu = (value: string | undefined) => round((num(value) ?? 0) / 9525);
    const extent = child(anchor, 'wp:extent');
    let width = emu(extent?.attrs.cx);
    let height = emu(extent?.attrs.cy);
    // Word 2010 sizes a shape as a share of the page or margin instead.
    const share = (name: string, pct: string, page: number, margin: number) => {
      const rel = descendants(anchor, name)[0];
      const value = num(textContent(child(rel, pct) ?? { name: '', attrs: {}, children: [] }));
      if (!rel || !value) return undefined;
      return round((value / 100000) * (rel.attrs.relativeFrom === 'page' ? page : margin));
    };
    const pageWidth = this.textWidth + this.insetLeft + this.insetRight + 2 * this.padding;
    width = share('wp14:sizeRelH', 'wp14:pctWidth', pageWidth, this.textWidth) ?? width;
    height =
      share(
        'wp14:sizeRelV',
        'wp14:pctHeight',
        this.pageHeight,
        this.pageHeight - this.marginTop - this.marginBottom,
      ) ?? height;
    const { left, v } = this.anchorPlace(anchor, width, height);

    // A group (wpg) places each shape on its own child grid, scaled to the
    // group's extent; a lone shape fills the anchor.
    const group = descendants(anchor, 'wpg:grpSpPr')[0];
    const gx = child(group, 'a:xfrm');
    const point = (el: XmlElement | undefined, a: string, b: string) => [
      num(el?.attrs[a]) ?? 0,
      num(el?.attrs[b]) ?? 0,
    ];
    const [extX, extY] = point(child(gx, 'a:ext'), 'cx', 'cy');
    const [chX, chY] = point(child(gx, 'a:chOff'), 'x', 'y');
    const [chW, chH] = point(child(gx, 'a:chExt'), 'cx', 'cy');
    const sx = chW ? extX / chW : 1;
    const sy = chH ? extY / chH : 1;
    let drawn = 0;
    for (const shape of descendants(anchor, 'wps:wsp')) {
      const spPr = child(shape, 'wps:spPr');
      let box = { x: left, y: v.value, w: width, h: height };
      if (group) {
        const xfrm = child(spPr, 'a:xfrm');
        const [x, y] = point(child(xfrm, 'a:off'), 'x', 'y');
        const [cx, cy] = point(child(xfrm, 'a:ext'), 'cx', 'cy');
        box = {
          x: round(left + ((x - chX) * sx) / 9525),
          y: round(v.value + ((y - chY) * sy) / 9525),
          w: round((cx * sx) / 9525),
          h: round((cy * sy) / 9525),
        };
      }
      const content = descendants(shape, 'w:txbxContent')[0];
      if (this.shapeBox(shape, spPr, content, box, out)) drawn++;
    }
    // Text wraps around a box on its sides; one as wide as the column leaves
    // it no side, and the paragraph's text goes on under it.
    const last = out[out.length - 1];
    const wraps =
      !!child(anchor, 'wp:wrapTopAndBottom') ||
      (!!child(anchor, 'wp:wrapSquare') && width >= this.textWidth * 0.8);
    if (!group && wraps && last?.kind === 'box' && v.from === 'paragraph') {
      const gap = emu(anchor.attrs.distB ?? '0');
      // From the paragraph's first line, the box takes it and the text goes
      // under; set lower, the text stays above and the box follows it.
      if (v.value < 12) {
        const below = round(v.value + height + gap);
        if (below > 0) last.clear = below;
      } else last.after = round(height + gap);
    }
    return drawn > 0;
  }

  /** An old-style (VML) text box: `v:shape` positioned by its CSS-like style. */
  private vmlBox(shape: XmlElement, out: LRun[]): boolean {
    const style = shape.attrs.style ?? '';
    const length = (key: string) => {
      const match = style.match(new RegExp(`(?:^|;)\\s*${key}:\\s*(-?[\\d.]+)(pt|px|in|cm|mm)?`));
      if (!match) return 0;
      const value = Number(match[1]);
      const unit = match[2] ?? 'px';
      const factor = { pt: 4 / 3, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[unit] ?? 1;
      return round(value * factor);
    };
    const relative = style.match(/mso-position-horizontal-relative:\s*([\w-]+)/)?.[1];
    let left = length('margin-left') || length('left');
    if (relative === 'page') left -= this.padding + this.insetLeft;
    const css: Css = {};
    if (shape.attrs.stroked !== 'f' && shape.attrs.stroked !== 'false') {
      const weight = (shape.attrs.strokeweight ?? '0.75pt').match(/([\d.]+)(pt|px)?/);
      const width = weight ? round(Number(weight[1]) * (weight[2] === 'px' ? 1 : 4 / 3)) : 1;
      const color = shape.attrs.strokecolor?.replace(/\s.*$/, '') ?? '#000000';
      css.border = `${Math.max(0.5, width)}px solid ${color.startsWith('#') ? color : 'black'}`;
    }
    if (shape.attrs.filled !== 'f' && shape.attrs.fillcolor) {
      const color = shape.attrs.fillcolor.replace(/\s.*$/, '');
      if (color.startsWith('#')) css.background = color;
    }
    css.padding = '3.75px 7.5px';
    if (shape.name === 'v:oval') css.borderRadius = '50%';
    else if (shape.name === 'v:roundrect') css.borderRadius = 8;
    const content = descendants(shape, 'w:txbxContent')[0];
    const blocks = content ? this.readBlocks(elements(content), false) : [];
    const text = content ? textContent(content).trim() : '';
    if (!text && !css.border && !css.background) return false;
    if (text.length <= 12 && blocks.length === 1) css.whiteSpace = 'nowrap';
    out.push({
      kind: 'box',
      left,
      top: length('margin-top') || length('top'),
      width: length('width'),
      height: length('height'),
      css,
      blocks,
    });
    return true;
  }

  private shapeBox(
    shape: XmlElement,
    spPr: XmlElement | undefined,
    content: XmlElement | undefined,
    box: { x: number; y: number; w: number; h: number },
    out: LRun[],
  ): boolean {
    const emu = (value: string | undefined) => round((num(value) ?? 0) / 9525);
    const line = child(spPr, 'a:ln');
    const lineFill = child(line, 'a:solidFill');
    const color = (fill: XmlElement | undefined) => this.drawingColor(fill) ?? '#000000';
    const css: Css = {};
    if (line && !child(line, 'a:noFill') && (lineFill || child(line, 'a:prstDash'))) {
      css.border = `${Math.max(0.5, emu(line.attrs.w ?? '9525'))}px solid ${color(lineFill)}`;
    }
    const fillEl = child(spPr, 'a:solidFill');
    if (fillEl) css.background = color(fillEl);
    const body = child(shape, 'wps:bodyPr')?.attrs ?? {};
    const inset = (key: string, fallback: number) => emu(body[key] ?? String(fallback));
    css.padding = `${inset('tIns', 45720)}px ${inset('rIns', 91440)}px ${inset('bIns', 45720)}px ${inset('lIns', 91440)}px`;
    const blocks = content ? this.readBlocks(elements(content), false) : [];
    const text = content ? textContent(content).trim() : '';
    // The shape's outline: a circle rounds the box, a line keeps one edge.
    const geometry = child(spPr, 'a:prstGeom')?.attrs.prst ?? 'rect';
    if (geometry === 'ellipse') css.borderRadius = '50%';
    else if (geometry === 'roundRect') css.borderRadius = Math.min(box.w, box.h) * 0.16;
    else if (/^(line|straightConnector1)$/.test(geometry) && css.border) {
      if (box.h > 4 && box.w > 4) return false;
      css[box.h <= 4 ? 'borderTop' : 'borderLeft'] = css.border;
      delete css.border;
      css.padding = 0;
    }
    if (!text && !css.border && !css.background && !css.borderTop && !css.borderLeft) return false;
    // A one-line label ("附表一") sized to fit Word's font must not wrap in a
    // fallback face a hair wider.
    if (text.length <= 12 && blocks.length === 1) css.whiteSpace = 'nowrap';
    // Without "resize shape to fit text" the box keeps Word's height, and
    // whatever runs past it (a trailing empty line) does not stretch it over
    // the text below.
    const bodyPr = child(shape, 'wps:bodyPr');
    if (box.h > 0 && !child(bodyPr, 'a:spAutoFit')) css.height = box.h;
    out.push({ kind: 'box', left: box.x, top: box.y, width: box.w, height: box.h, css, blocks });
    return true;
  }

  private inset(block: LBlock): LBlock {
    if (block.kind !== 'p') return block;
    return {
      ...block,
      css: { ...block.css, marginLeft: this.insetLeft, marginRight: this.insetRight },
    };
  }

  private image(relId: string | undefined): string | null {
    const rel = this.rel(relId);
    if (!rel) {
      this.count('missingImage');
      return null;
    }
    if (rel.external) {
      if (/^https?:\/\//i.test(rel.target)) return rel.target;
      this.count('missingImage');
      return null;
    }
    const part = resolvePart(this.partDir ?? this.pkg.mainDir, rel.target);
    // A Windows metafile (an old equation, a Visio or Excel paste) is played
    // into SVG, which a browser can show.
    if (/\.(emf|wmf)$/i.test(part) && this.pkg.files[part]) {
      const svgPart = part.replace(/\.(emf|wmf)$/i, '.svg');
      if (this.media.has(svgPart)) return svgPart;
      const svg = metafileToSvg(this.pkg.files[part]);
      if (svg) {
        this.media.set(svgPart, new TextEncoder().encode(svg));
        return svgPart;
      }
    }
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

  private readTable(tbl: XmlElement, top: boolean): LTable[] {
    const source = top ? this.tables++ : undefined;
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

    let cols = elements(child(tbl, 'w:tblGrid') ?? tbl, 'w:gridCol').map((col) =>
      this.hx(num(col.attrs['w:w']) ?? 0),
    );
    const trs = unwrap(tbl, 'w:tr');
    if (trs.length === 0) return [];

    // Which of the style's conditional formats a cell takes, in Word's order
    // of precedence (later wins), as tblLook switches them on.
    const conditional = new Map<string, XmlElement>();
    for (const style of styled)
      for (const [type, el] of style.conditional ?? []) conditional.set(type, el);
    const look = pick('w:tblLook');
    const lookBits = Number.parseInt(look?.attrs['w:val'] ?? '', 16);
    const flag = (name: string, bit: number) => {
      const value = look?.attrs[`w:${name}`];
      if (value !== undefined) return value === '1' || value === 'true';
      return Number.isFinite(lookBits) ? (lookBits & bit) !== 0 : false;
    };
    const firstRow = flag('firstRow', 0x20);
    const lastRowOn = flag('lastRow', 0x40);
    const firstCol = flag('firstColumn', 0x80);
    const lastCol = flag('lastColumn', 0x100);
    const hBand = !flag('noHBand', 0x200);
    const vBand = !flag('noVBand', 0x400);
    const conditionsFor = (r: number, c: number, span: number, columns: number): XmlElement[] => {
      if (conditional.size === 0) return [];
      const types: string[] = ['wholeTable'];
      const bodyRow = r - (firstRow ? 1 : 0);
      const bodyCol = c - (firstCol ? 1 : 0);
      if (vBand && bodyCol >= 0) types.push(bodyCol % 2 === 0 ? 'band1Vert' : 'band2Vert');
      if (hBand && bodyRow >= 0) types.push(bodyRow % 2 === 0 ? 'band1Horz' : 'band2Horz');
      const isFirstCol = firstCol && c === 0;
      const isLastCol = lastCol && c + span >= columns;
      const isFirstRow = firstRow && r === 0;
      const isLastRow = lastRowOn && r === trs.length - 1;
      if (isFirstCol) types.push('firstCol');
      if (isLastCol) types.push('lastCol');
      if (isFirstRow) types.push('firstRow');
      if (isLastRow) types.push('lastRow');
      if (isFirstRow && isFirstCol) types.push('nwCell');
      if (isFirstRow && isLastCol) types.push('neCell');
      if (isLastRow && isFirstCol) types.push('swCell');
      if (isLastRow && isLastCol) types.push('seCell');
      return types.flatMap((type) =>
        conditional.has(type) ? [conditional.get(type) as XmlElement] : [],
      );
    };
    // A table some producers write without a grid takes its first row's
    // cell widths, or shares the column evenly.
    if (cols.length === 0 || cols.every((w) => w === 0)) {
      const first = unwrap(trs[0], 'w:tc');
      const widths = first.flatMap((tc) => {
        const tcPr = child(tc, 'w:tcPr');
        const span = num(val(child(tcPr, 'w:gridSpan'))) ?? 1;
        const w = child(tcPr, 'w:tcW');
        const each = w?.attrs['w:type'] === 'dxa' ? this.hx(num(w.attrs['w:w']) ?? 0) / span : 0;
        return Array.from({ length: span }, () => each);
      });
      const fallback = round(this.textWidth / Math.max(1, widths.length));
      cols = widths.map((w) => w || fallback);
    }

    type Slot = {
      cell: LCell;
      row: number;
      col: number;
      span: number;
      lastRow: number;
      tcPr?: XmlElement;
      bottomPr?: XmlElement;
      conds: XmlElement[];
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
      const row: LRow = { css: height ? { height: px(height) } : {}, cells: [], header, source: r };
      grid[r] = [];
      let col = num(val(child(trPr, 'w:gridBefore'))) ?? 0;
      if (col > 0)
        row.cells.push({ colSpan: col, rowSpan: 1, css: { border: 'none' }, blocks: [] });
      const tcs = unwrap(tr, 'w:tc');
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
        const conds = conditionsFor(r, col, span, Math.max(cols.length, col + span));
        const cellInherited = conds.length
          ? {
              p: mergeP(inherited.p, ...conds.map((cond) => readPPr(child(cond, 'w:pPr')))),
              r: mergeR(inherited.r, ...conds.map((cond) => readRPr(child(cond, 'w:rPr')))),
            }
          : inherited;
        const blocks = this.readBlocks(elements(tc), false, cellInherited);
        const cell: LCell = { colSpan: span, rowSpan: 1, css: {}, blocks };
        const slot: Slot = {
          cell,
          row: r,
          col,
          span,
          lastRow: r,
          conds,
          ...(tcPr ? { tcPr } : {}),
        };
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
      const own: Sides = {};
      for (const cond of slot.conds) {
        Object.assign(own, readSides(child(child(cond, 'w:tcPr'), 'w:tcBorders')));
      }
      Object.assign(own, readSides(child(tcPr, 'w:tcBorders')));
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
      const condFill = slot.conds
        .map((cond) => fill(child(child(cond, 'w:tcPr'), 'w:shd')))
        .filter((value): value is string => !!value)
        .pop();
      const background = fill(child(tcPr, 'w:shd')) ?? condFill;
      if (background) css.background = background;
      const direction = val(child(tcPr, 'w:textDirection'));
      if (direction === 'tbRl' || direction === 'tbRlV' || direction === 'tbLrV') {
        css.writingMode = 'vertical-rl';
      } else if (direction === 'btLr') {
        css.writingMode = 'sideways-lr';
      }
      const vAlign = val(child(tcPr, 'w:vAlign'));
      css.verticalAlign = vAlign === 'center' ? 'middle' : vAlign === 'bottom' ? 'bottom' : 'top';
      slot.cell.css = css;
    }

    // Word lets a row break across pages. A row too tall for one sheet is
    // cut here into rows of a few paragraphs each, with no rule between them.
    const covered = new Set<number>();
    for (const slot of slots) {
      if (slot.lastRow > slot.row) for (let r = slot.row; r <= slot.lastRow; r++) covered.add(r);
    }
    const sheet = 600;
    const expanded: LRow[] = [];
    rows.forEach((row, r) => {
      let gridCol = 0;
      const chunked = row.cells.map((cell) => {
        const width = cols.slice(gridCol, gridCol + cell.colSpan).reduce((a, b) => a + b, 0) || 200;
        gridCol += cell.colSpan;
        const chunks: LBlock[][] = [[]];
        let height = 0;
        for (const block of cell.blocks) {
          const h = estimateHeight(block, width);
          if (height > 0 && height + h > sheet) {
            chunks.push([]);
            height = 0;
          }
          chunks[chunks.length - 1].push(block);
          height += h;
        }
        return chunks;
      });
      const pieces = Math.max(1, ...chunked.map((chunks) => chunks.length));
      if (pieces === 1 || covered.has(r)) {
        expanded.push(row);
        return;
      }
      for (let k = 0; k < pieces; k++) {
        expanded.push({
          css: {},
          header: false,
          ...(row.source !== undefined ? { source: row.source } : {}),
          cells: row.cells.map((cell, index) => ({
            ...cell,
            blocks: chunked[index][k] ?? [],
            css: {
              ...cell.css,
              ...(k > 0 ? { borderTop: 'none' } : {}),
              ...(k < pieces - 1 ? { borderBottom: 'none' } : {}),
            },
          })),
        });
      }
    });
    rows.splice(0, rows.length, ...expanded);

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
    let widthPx = typeof width === 'number' ? width : gridWidth;
    const room = this.textWidth + this.insetLeft + this.insetRight + 2 * this.padding;
    // Wider than the sheet itself — usually a landscape section's table on a
    // portrait page. Word would print past the paper; fit it to the column.
    if (top && widthPx > room) {
      this.count('tableScaled');
      widthPx = round(this.textWidth);
    }
    const jc = val(pick('w:jc'));
    const indent = this.hx(num(pick('w:tblInd')?.attrs['w:w']) ?? 0);
    let left = indent;
    if (top) {
      if (jc === 'center') left = (this.textWidth - widthPx) / 2;
      else if (jc === 'right' || jc === 'end') left = this.textWidth - widthPx;
      left += this.insetLeft;
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
    const widths = cols.map((w) => round(w * scale));
    const table = (part: LRow[], splittable: boolean, first: boolean): LTable => ({
      kind: 'table',
      // Pieces of one table meet edge to edge, so the seam draws one rule.
      css: first ? css : { ...css, margin: `-1px 0 0 ${round(left)}px` },
      cols: widths,
      rows: part,
      splittable: splittable && part.length > 1,
      ...(source !== undefined ? { source } : {}),
    });
    if (!top || !anyRowSpan) return [table(rows, top && !anyRowSpan, true)];

    // Merged rows cannot be cut apart, but the table can break between them:
    // each run of rows a merge holds together is its own piece, and rows no
    // merge crosses are one splittable piece.
    const parts: Array<{ rows: LRow[]; simple: boolean }> = [];
    let group: LRow[] = [];
    let open = -1;
    rows.forEach((row, r) => {
      group.push(row);
      for (const cell of row.cells) open = Math.max(open, r + cell.rowSpan - 1);
      if (open > r) return;
      const simple = group.length === 1;
      const last = parts[parts.length - 1];
      if (simple && last?.simple) last.rows.push(...group);
      else parts.push({ rows: group, simple });
      group = [];
    });
    if (group.length > 0) parts.push({ rows: group, simple: false });
    return parts.map((part, index) => table(part.rows, part.simple, index === 0));
  }
}

/** Every character the layout prints, in order — what an import must never lose. */
export function layoutText(layout: DocxLayout): string {
  const out: string[] = [];
  const walk = (blocks: LBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'table') {
        for (const row of block.rows) for (const cell of row.cells) walk(cell.blocks);
        continue;
      }
      for (const run of block.runs) {
        if (run.kind === 'text' || run.kind === 'marker' || run.kind === 'drop') out.push(run.text);
        else if (run.kind === 'ruby') out.push(run.base, run.rt);
        else if (run.kind === 'box' || run.kind === 'note') walk(run.blocks);
      }
      out.push('\n');
    }
  };
  for (const section of layout.sections) walk(section.blocks);
  return out.join('');
}

/** A rough height for a block set in a column `width` px wide — enough to cut a row in pieces. */
function estimateHeight(block: LBlock, width: number, skipFloating = false): number {
  if (block.kind === 'table') {
    return block.rows.reduce(
      (sum, row) =>
        sum +
        Math.max(
          20,
          ...row.cells.map((cell) =>
            cell.blocks.reduce((h, b) => h + estimateHeight(b, width, skipFloating), 0),
          ),
        ),
      0,
    );
  }
  let line = 0;
  let size = 16;
  let advance = 0;
  let pictures = 0;
  for (const run of block.runs) {
    if (run.kind === 'image' && !(skipFloating && run.floating)) pictures += run.height;
    if (run.kind === 'box') pictures += (run.clear ?? 0) + (run.after ?? 0);
    if (run.kind !== 'text') continue;
    size = Math.max(size, Number(run.css.fontSize) || 16);
    for (const char of run.text) advance += (char.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.55;
  }
  line =
    typeof block.css.lineHeight === 'string' ? Number.parseFloat(block.css.lineHeight) : size * 1.3;
  const lines = Math.max(1, Math.ceil((advance * size) / Math.max(40, width)));
  return lines * line + pictures + 8;
}

/** Rows or cells in order, through the content controls and custom XML that may wrap them. */
function unwrap(parent: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const node of elements(parent)) {
    if (node.name === name) out.push(node);
    else if (node.name === 'w:sdt') out.push(...unwrap(child(node, 'w:sdtContent') ?? node, name));
    else if (node.name === 'w:customXml' || node.name === 'w:ins' || node.name === 'w:moveTo') {
      out.push(...unwrap(node, name));
    }
  }
  return out;
}

/** Rewrites one side of a `margin: top right bottom left` shorthand. */
function setSpace(p: LParagraph, index: number, value: number) {
  const parts = String(p.css.margin ?? '0px 0px 0px 0px').split(' ');
  parts[index] = `${value}px`;
  p.css.margin = parts.join(' ');
}

/**
 * A page break whose page would hold nothing but empty paragraphs (two
 * breaks in a row, a break just before a section break) prints a blank
 * sheet; Word's reader never sees one, so neither does ours.
 */
function collapseBlankPages(blocks: LBlock[]): LBlock[] {
  const out: LBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (isBlank(blocks[i])) {
      let j = i;
      while (j < blocks.length && isBlank(blocks[j]) && (j === i || !blocks[j].breakBefore)) j++;
      const next = blocks[j];
      // Empty lines just before a page break only pad the foot of a page —
      // or, pushed over, fill one alone.
      if (!next || next.breakBefore) {
        if (blocks[i].breakBefore && next) next.breakBefore = true;
        i = j;
        continue;
      }
    }
    out.push(blocks[i]);
    i++;
  }
  return out;
}

function isBlank(block: LBlock): boolean {
  return (
    block.kind === 'p' &&
    block.runs.every(
      (run) =>
        (run.kind === 'text' && run.text.trim() === '') ||
        run.kind === 'break' ||
        run.kind === 'anchor',
    )
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

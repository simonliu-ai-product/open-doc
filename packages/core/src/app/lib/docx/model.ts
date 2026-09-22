import type { FontDeclaration } from './fonts';

/**
 * What a document looks like once it has been read out of the DOM and before
 * it is written as WordprocessingML.
 *
 * Everything is already in Word's units — twips (1/20 pt) for lengths,
 * half-points for type sizes, EMU for drawings, six-digit hex for colours — so
 * the writer is plain string assembly and can be tested without a browser.
 */

export type FontSet = {
  /** Latin text: `w:ascii`, `w:hAnsi`, `w:cs`. */
  ascii: string;
  /** Han, kana, hangul: `w:eastAsia`. Absent when the theme names no CJK face. */
  eastAsia?: string;
};

export type RunStyle = {
  fonts: FontSet;
  /** Half-points. */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  /** Background behind the run — inline code, a highlight. */
  shading?: string;
  vertAlign?: 'superscript' | 'subscript';
  caps?: boolean;
  smallCaps?: boolean;
  /** Letter spacing, twips. */
  spacing?: number;
};

export type LinkTarget = { url: string } | { anchor: string };

export type Inline =
  | { type: 'text'; text: string; style: RunStyle; link?: LinkTarget }
  /** `style` keeps an empty line in preformatted text at the text's own size. */
  | { type: 'break'; style?: RunStyle }
  | { type: 'tab' }
  | { type: 'field'; instr: string; cached: string; style: RunStyle; link?: LinkTarget }
  /** `style` is the marker as it rendered; its colour becomes the reference style's. */
  | { type: 'footnote'; id: number; style: RunStyle }
  | { type: 'image'; image: ImageRef; link?: LinkTarget };

export type ImageRef = {
  /** Index into `DocxModel.media`. */
  media: number;
  /** EMU. */
  width: number;
  height: number;
  alt: string;
};

export type BorderStyle = 'single' | 'dashed' | 'dotted' | 'double';

export type Border = {
  style: BorderStyle;
  /** Eighths of a point. */
  size: number;
  color: string;
  /** Distance from the text, points. */
  space: number;
};

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type Sides = Record<Side, number>;

export type Borders = Partial<Record<Side, Border>>;

export type TabStop = {
  align: 'left' | 'center' | 'right';
  /** Twips from the text column's leading edge. */
  pos: number;
  leader?: 'dot' | 'hyphen' | 'underscore';
};

export type ParagraphProps = {
  align?: 'left' | 'center' | 'right' | 'both';
  spaceBefore?: number;
  spaceAfter?: number;
  /** Line height, twips. `atLeast` unless `lineExact`. */
  line?: number;
  lineExact?: boolean;
  indentLeft?: number;
  indentRight?: number;
  /** Negative is a hanging indent. */
  firstLine?: number;
  borders?: Borders;
  shading?: string;
  tabs?: TabStop[];
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  /** Right to left. */
  bidi?: boolean;
  /** Size of the paragraph mark, half-points — keeps an empty rule paragraph thin. */
  markSize?: number;
};

export type ParagraphRole =
  | 'body'
  | 'heading'
  | 'title'
  | 'subtitle'
  | 'toc'
  | 'caption'
  | 'list'
  | 'footnote'
  | 'header'
  | 'footer';

export type Paragraph = {
  type: 'paragraph';
  role: ParagraphRole;
  /** Heading level 1–6, or contents level 1–9. */
  level?: number;
  inlines: Inline[];
  props: ParagraphProps;
  list?: { num: number; level: number };
  bookmark?: string;
  /** A field that spans paragraphs — the table of contents. */
  field?: { begin?: string; end?: boolean };
};

export type TableCell = {
  blocks: Block[];
  span: number;
  merge?: 'restart' | 'continue';
  width: number;
  shading?: string;
  borders: Borders;
  /** Cell padding, twips. */
  margins: Sides;
  vAlign?: 'center' | 'bottom';
};

export type TableRow = { cells: TableCell[]; header: boolean };

export type Table = {
  type: 'table';
  /** Twips, one per grid column. */
  columns: number[];
  rows: TableRow[];
  align?: 'center';
  indent?: number;
};

export type Block = Paragraph | Table;

export type PageSetup = {
  /** Twips; wider than tall is landscape. */
  width: number;
  height: number;
  margin: Sides;
  /** Distance from the top edge of the sheet to the top of the header. */
  header: number;
  /** Distance from the bottom edge of the sheet to the bottom of the footer. */
  footer: number;
};

export type Section = {
  blocks: Block[];
  header?: Paragraph[];
  footer?: Paragraph[];
  /** The section's first page, when its footer is not the running one there — empty is hidden. */
  footerFirst?: Paragraph[];
  page: PageSetup;
};

export type Footnote = { id: number; blocks: Block[] };

export type ListKind =
  | 'disc'
  | 'circle'
  | 'square'
  | 'decimal'
  | 'lowerLetter'
  | 'upperLetter'
  | 'lowerRoman'
  | 'upperRoman';

export type ListInstance = { id: number; kind: ListKind; level: number; start: number };

export type Media = { name: string; contentType: string; bytes: Uint8Array };

export type DocxModel = {
  title: string;
  subject?: string;
  author?: string;
  /** ISO 8601. */
  created?: string;
  sections: Section[];
  footnotes: Footnote[];
  lists: ListInstance[];
  media: Media[];
  /** Heading sizes from the design, half-points — for levels the document never uses. */
  headingSizes?: number[];
  /** Page colour, when the design's paper is not white. */
  background?: string;
  /** Every face the runs name, with what Word should use in its place. */
  fonts?: FontDeclaration[];
};

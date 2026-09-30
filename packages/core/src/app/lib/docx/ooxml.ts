/*
 * A .docx is a zip of XML parts. This file writes those parts from a small
 * document model — paragraphs, tables, a contents field, footnotes — and knows
 * nothing about the DOM, so everything about the output can be tested in Node.
 *
 * The aim is a document Word flows itself, not a picture of the pages: Word
 * repaginates the moment anyone edits, so the structure (styles, headings,
 * real footnotes, a TOC field) is what survives review, and the page breaks
 * are Word's to decide.
 */

export type TextRun = {
  type: 'text';
  text: string;
  /** `false` turns off what the paragraph style turns on — plain words in a heading. */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** `text-transform: uppercase`, kept as a property so the words stay as typed. */
  caps?: boolean;
  /** Letter spacing in twips. */
  tracking?: number;
  mono?: boolean;
  /** `rrggbb`, no hash. */
  color?: string;
  /** Font size in half-points, only when it differs from the paragraph style's. */
  halfPoints?: number;
  vert?: 'superscript' | 'subscript';
};

export type Run =
  | TextRun
  | { type: 'break' }
  | { type: 'tab' }
  /** A field Word computes itself — `PAGE`, `NUMPAGES`. */
  | { type: 'field'; instr: string; cached: string }
  | { type: 'footnote'; id: number }
  /** The note's own number, at the start of its text in footnotes.xml. */
  | { type: 'footnoteRef' }
  | { type: 'image'; image: string };

export type Inline = Run | { type: 'link'; href: string; runs: Run[] };

export type StyleId =
  | 'Normal'
  | 'Title'
  | 'Heading1'
  | 'Heading2'
  | 'Heading3'
  | 'Heading4'
  | 'Heading5'
  | 'Heading6'
  | 'Caption'
  | 'Code'
  | 'Quote'
  | 'ListParagraph'
  | 'FootnoteText'
  /** A heading kept out of the contents — "Contents" itself, a list heading. */
  | 'TOCHeading';

export type Paragraph = {
  type: 'paragraph';
  style?: StyleId;
  align?: 'left' | 'center' | 'right' | 'both';
  inlines: Inline[];
  list?: { numId: number; level: number };
  pageBreakBefore?: boolean;
  keepNext?: boolean;
  /** Twips. */
  spacingBefore?: number;
  spacingAfter?: number;
  /** Left indent, twips, over the style's own. */
  indent?: number;
  /** An exact line height, twips — a spacer that holds open a gap. */
  lineExact?: number;
  /**
   * Ends a section here — whether that section's pages carry the footer.
   * Fixed sheets print their own running lines, so they sit in sections
   * without one.
   */
  sectionEnd?: { footer: boolean };
  /** Right-aligned tab stop, twips from the left margin — a footer's page number. */
  rightTab?: number;
  /** Dots leading to the right tab, as a contents entry has. */
  leader?: boolean;
  /** A bookmark round the paragraph, for a PAGEREF to find its page. */
  bookmark?: string;
};

export type CellBorder = { color: string /** Eighths of a point. */; size: number };

export type TableCell = {
  blocks: Paragraph[];
  span?: number;
  borders?: Partial<Record<'top' | 'left' | 'bottom' | 'right', CellBorder>>;
  /** `rrggbb`. */
  fill?: string;
  /** Twips. */
  padding?: { top: number; left: number; bottom: number; right: number };
};

export type Table = {
  type: 'table';
  /** Twips per column. */
  columns: number[];
  rows: Array<{ header: boolean; cells: TableCell[] }>;
  /** Left and right cell margins for the whole table, twips. Pages reads these, not a cell's own. */
  cellMargin?: { left: number; right: number };
};

/** A contents field Word fills in; the entries are what shows until it does. */
export type TocField = { type: 'toc'; entries: Array<{ text: string; level: number }> };

export type Block = Paragraph | Table | TocField;

export type ImagePart = {
  name: string;
  ext: 'png' | 'jpeg' | 'gif';
  bytes: Uint8Array;
  /** EMU. */
  width: number;
  height: number;
};

export type FontSpec = {
  ascii: string;
  eastAsia: string;
  kind: 'sans' | 'serif' | 'mono';
};

export type DocxModel = {
  title: string;
  author?: string;
  page: {
    /** Twips. */
    width: number;
    height: number;
    landscape: boolean;
    margin: number;
  };
  fonts: { body: FontSpec; heading: FontSpec; mono: FontSpec };
  /** Half-points. */
  sizes: {
    title: number;
    h1: number;
    h2: number;
    h3: number;
    body: number;
    caption: number;
  };
  /** `rrggbb`. */
  colors: { text: string; muted: string; accent: string };
  /**
   * Body line height in twips, as a minimum. CSS `line-height: 1.55` is 1.55 ×
   * the font size; Word's "multiple" spacing is 1.55 × the font's own single
   * line, which is already taller than its size — about 15% looser than the
   * page. A minimum keeps the page's rhythm and still lets a line holding a
   * picture grow.
   */
  line: number;
  blocks: Block[];
  footnotes: Array<{ id: number; paragraphs: Paragraph[] }>;
  footer?: Paragraph;
  /** Whether the last section carries the footer. Defaults to true. */
  finalFooter?: boolean;
  images: ImagePart[];
  /** One entry per list; ordered lists restart at 1 each. */
  lists: Array<'bullet' | 'decimal'>;
};

export const PX_TO_TWIPS = 15;
export const PX_TO_EMU = 9525;
export const PX_TO_HALF_POINTS = 1.5;

export function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // XML 1.0 has no way to write most control characters, even escaped.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being removed
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  );
}

const GENERIC = new Set([
  '-apple-system',
  'blinkmacsystemfont',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'inherit',
]);

const CJK_FONT =
  /noto (sans|serif) (tc|sc|jp|kr|hk|cjk)|pingfang|hiragino|jhenghei|yahei|正黑|明體|楷|source han|思源|yu gothic|yu mincho|meiryo|malgun|ms mincho|ms gothic|heiti|songti|kaiti|biaukai|dfkai|simsun|simhei|mingliu|gulim|batang|lxgw|霞鶩/i;

/**
 * A CSS font stack as the two names Word needs. Word has no fallback stack, so
 * the first family that names a real font wins; system aliases mean nothing
 * to it. A CJK family anywhere in the stack becomes the East Asian font — the
 * one Word uses for Han, kana and hangul — because leaving it to Word's
 * default changes glyph widths, and with them every line break.
 */
export function fontsFor(stack: string, fallback: 'sans' | 'serif' | 'mono'): FontSpec {
  const families = stack
    .split(',')
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ''))
    .filter((family) => family !== '');
  const real = families.filter((family) => !GENERIC.has(family.toLowerCase()));
  const generic =
    families.find((family) => ['serif', 'monospace', 'ui-monospace'].includes(family)) ?? '';
  const kind = generic === 'serif' ? 'serif' : generic.includes('monospace') ? 'mono' : fallback;
  const fallbackFont =
    kind === 'serif' ? 'Times New Roman' : kind === 'mono' ? 'Courier New' : 'Arial';
  const latin = real.find((family) => !CJK_FONT.test(family)) ?? fallbackFont;
  const eastAsia = real.find((family) => CJK_FONT.test(family)) ?? latin;
  return { ascii: latin, eastAsia, kind };
}

const FONT_CLASS = {
  sans: { family: 'swiss', pitch: 'variable', alt: 'Arial' },
  serif: { family: 'roman', pitch: 'variable', alt: 'Times New Roman' },
  mono: { family: 'modern', pitch: 'fixed', alt: 'Courier New' },
} as const;

/**
 * Word has no fallback stack, so a family the reader has not installed — a
 * web font like JetBrains Mono — would otherwise come out in the app's default,
 * which is a serif. The font table says what kind of face each one is and names
 * a stand-in every machine has, so code stays monospaced wherever it opens.
 */
function fontTableXml(fonts: DocxModel['fonts']): string {
  const entries = new Map<string, FontSpec['kind']>();
  for (const font of [fonts.body, fonts.heading, fonts.mono]) {
    if (!entries.has(font.ascii)) entries.set(font.ascii, font.kind);
    if (!entries.has(font.eastAsia)) entries.set(font.eastAsia, font.kind);
  }
  const body = Array.from(entries, ([name, kind]) => {
    const { family, pitch, alt } = FONT_CLASS[kind];
    const altName = name === alt ? '' : `<w:altName w:val="${alt}"/>`;
    return `<w:font w:name="${escapeXml(name)}">${altName}<w:family w:val="${family}"/><w:pitch w:val="${pitch}"/></w:font>`;
  }).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:fonts>`
  );
}

/** `rgb(22, 24, 29)` or `#16181d` as `16181d`; null for anything transparent. */
export function hexColor(css: string): string | null {
  const hex = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) return hex[1].toLowerCase();
  const short = css.trim().match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short)
    return `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const rgb = css.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?/i);
  if (!rgb) return null;
  if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null;
  return [rgb[1], rgb[2], rgb[3]]
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('');
}

function fontsXml(font: FontSpec): string {
  return `<w:rFonts w:ascii="${escapeXml(font.ascii)}" w:hAnsi="${escapeXml(font.ascii)}" w:eastAsia="${escapeXml(font.eastAsia)}" w:cs="${escapeXml(font.ascii)}"/>`;
}

type WriteContext = {
  model: DocxModel;
  /** Relationship ids for this part — document and footer each have their own. */
  rels: Array<{ id: string; type: string; target: string; external?: boolean }>;
  imageIds: Map<string, string>;
  drawingId: { value: number };
  bookmarkId?: { value: number };
  /** A section's properties, with or without the footer. */
  section?: (footer: boolean) => string;
};

const REL_HYPERLINK =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

function relFor(ctx: WriteContext, type: string, target: string, external = false): string {
  const existing = ctx.rels.find((rel) => rel.type === type && rel.target === target);
  if (existing) return existing.id;
  const id = `rId${ctx.rels.length + 1}`;
  ctx.rels.push({ id, type, target, ...(external ? { external: true } : {}) });
  return id;
}

function runPropsXml(run: TextRun, ctx: WriteContext): string {
  const parts: string[] = [];
  if (run.mono) parts.push(fontsXml(ctx.model.fonts.mono));
  if (run.bold !== undefined) {
    parts.push(run.bold ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>');
  }
  if (run.italic !== undefined) {
    parts.push(run.italic ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>');
  }
  if (run.caps) parts.push('<w:caps/>');
  if (run.strike) parts.push('<w:strike/>');
  // Code is not prose; a spelling checker underlines every identifier in it.
  if (run.mono) parts.push('<w:noProof/>');
  if (run.color) parts.push(`<w:color w:val="${run.color}"/>`);
  if (run.tracking) parts.push(`<w:spacing w:val="${Math.round(run.tracking)}"/>`);
  if (run.halfPoints)
    parts.push(`<w:sz w:val="${run.halfPoints}"/><w:szCs w:val="${run.halfPoints}"/>`);
  if (run.underline) parts.push('<w:u w:val="single"/>');
  if (run.vert) parts.push(`<w:vertAlign w:val="${run.vert}"/>`);
  return parts.length > 0 ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

function textXml(text: string): string {
  return `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;
}

function imageXml(name: string, ctx: WriteContext): string {
  const image = ctx.model.images.find((candidate) => candidate.name === name);
  if (!image) return '';
  let rel = ctx.imageIds.get(name);
  if (!rel) {
    rel = relFor(ctx, REL_IMAGE, `media/${image.name}.${image.ext}`);
    ctx.imageIds.set(name, rel);
  }
  const id = ctx.drawingId.value++;
  const extent = `cx="${Math.round(image.width)}" cy="${Math.round(image.height)}"`;
  return (
    '<w:r><w:drawing>' +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent ${extent}/>` +
    `<wp:docPr id="${id}" name="Picture ${id}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${escapeXml(image.name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext ${extent}/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

function runXml(run: Run, ctx: WriteContext, linked = false): string {
  switch (run.type) {
    case 'text': {
      const props = runPropsXml(run, ctx);
      const style = linked ? '<w:rStyle w:val="Hyperlink"/>' : '';
      const rPr = style
        ? props
          ? props.replace('<w:rPr>', `<w:rPr>${style}`)
          : `<w:rPr>${style}</w:rPr>`
        : props;
      return `<w:r>${rPr}${textXml(run.text)}</w:r>`;
    }
    case 'break':
      return '<w:r><w:br/></w:r>';
    case 'tab':
      return '<w:r><w:tab/></w:r>';
    case 'field':
      return `<w:fldSimple w:instr=" ${escapeXml(run.instr)} "><w:r>${textXml(run.cached)}</w:r></w:fldSimple>`;
    case 'footnote':
      return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${run.id}"/></w:r>`;
    case 'footnoteRef':
      return '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>';
    case 'image':
      return imageXml(run.image, ctx);
  }
}

function inlineXml(inline: Inline, ctx: WriteContext): string {
  if (inline.type !== 'link') return runXml(inline, ctx);
  const inner = inline.runs.map((run) => runXml(run, ctx, true)).join('');
  // An in-document anchor has no bookmark to point at in Word; its words stay.
  if (inline.href.startsWith('#')) return inner;
  const rel = relFor(ctx, REL_HYPERLINK, inline.href, true);
  return `<w:hyperlink r:id="${rel}">${inner}</w:hyperlink>`;
}

export function paragraphXml(paragraph: Paragraph, ctx: WriteContext): string {
  const props: string[] = [];
  if (paragraph.style && paragraph.style !== 'Normal') {
    props.push(`<w:pStyle w:val="${paragraph.style}"/>`);
  }
  if (paragraph.keepNext) props.push('<w:keepNext/>');
  if (paragraph.pageBreakBefore) props.push('<w:pageBreakBefore/>');
  if (paragraph.list) {
    props.push(
      `<w:numPr><w:ilvl w:val="${paragraph.list.level}"/><w:numId w:val="${paragraph.list.numId}"/></w:numPr>`,
    );
  }
  if (paragraph.rightTab !== undefined) {
    const leader = paragraph.leader ? ' w:leader="dot"' : '';
    props.push(
      `<w:tabs><w:tab w:val="right"${leader} w:pos="${Math.round(paragraph.rightTab)}"/></w:tabs>`,
    );
  }
  if (
    paragraph.spacingBefore !== undefined ||
    paragraph.spacingAfter !== undefined ||
    paragraph.lineExact !== undefined
  ) {
    const before =
      paragraph.spacingBefore !== undefined
        ? ` w:before="${Math.round(paragraph.spacingBefore)}"`
        : '';
    const after =
      paragraph.spacingAfter !== undefined
        ? ` w:after="${Math.round(paragraph.spacingAfter)}"`
        : '';
    const line =
      paragraph.lineExact !== undefined
        ? ` w:line="${Math.max(20, Math.round(paragraph.lineExact))}" w:lineRule="exact"`
        : '';
    props.push(`<w:spacing${before}${after}${line}/>`);
  }
  if (paragraph.indent !== undefined)
    props.push(`<w:ind w:left="${Math.round(paragraph.indent)}"/>`);
  if (paragraph.align && paragraph.align !== 'left')
    props.push(`<w:jc w:val="${paragraph.align}"/>`);
  if (paragraph.sectionEnd && ctx.section) props.push(ctx.section(paragraph.sectionEnd.footer));
  const pPr = props.length > 0 ? `<w:pPr>${props.join('')}</w:pPr>` : '';
  const runs = paragraph.inlines.map((inline) => inlineXml(inline, ctx)).join('');
  if (!paragraph.bookmark) return `<w:p>${pPr}${runs}</w:p>`;
  ctx.bookmarkId ??= { value: 0 };
  const id = ctx.bookmarkId.value++;
  return (
    `<w:p>${pPr}<w:bookmarkStart w:id="${id}" w:name="${escapeXml(paragraph.bookmark)}"/>` +
    `${runs}<w:bookmarkEnd w:id="${id}"/></w:p>`
  );
}

function tableXml(table: Table, ctx: WriteContext): string {
  const total = table.columns.reduce((sum, width) => sum + width, 0);
  const grid = table.columns.map((width) => `<w:gridCol w:w="${Math.round(width)}"/>`).join('');
  const rows = table.rows
    .map((row) => {
      const trPr = row.header
        ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>'
        : '<w:trPr><w:cantSplit/></w:trPr>';
      let column = 0;
      const cells = row.cells
        .map((cell) => {
          const span = cell.span ?? 1;
          const width = table.columns
            .slice(column, column + span)
            .reduce((sum, value) => sum + value, 0);
          column += span;
          const props: string[] = [`<w:tcW w:w="${Math.round(width)}" w:type="dxa"/>`];
          if (span > 1) props.push(`<w:gridSpan w:val="${span}"/>`);
          const sides = (['top', 'left', 'bottom', 'right'] as const)
            .map((side) => {
              const border = cell.borders?.[side];
              return border
                ? `<w:${side} w:val="single" w:sz="${border.size}" w:space="0" w:color="${border.color}"/>`
                : `<w:${side} w:val="nil"/>`;
            })
            .join('');
          props.push(`<w:tcBorders>${sides}</w:tcBorders>`);
          if (cell.fill) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${cell.fill}"/>`);
          if (cell.padding) {
            const { top, left, bottom, right } = cell.padding;
            props.push(
              `<w:tcMar><w:top w:w="${Math.round(top)}" w:type="dxa"/><w:left w:w="${Math.round(left)}" w:type="dxa"/><w:bottom w:w="${Math.round(bottom)}" w:type="dxa"/><w:right w:w="${Math.round(right)}" w:type="dxa"/></w:tcMar>`,
            );
          }
          // A cell must end in a paragraph, even an empty one.
          const body =
            cell.blocks.length > 0
              ? cell.blocks.map((block) => paragraphXml(block, ctx)).join('')
              : '<w:p/>';
          return `<w:tc><w:tcPr>${props.join('')}</w:tcPr>${body}</w:tc>`;
        })
        .join('');
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(total)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="${Math.round(table.cellMargin?.left ?? 0)}" w:type="dxa"/><w:right w:w="${Math.round(table.cellMargin?.right ?? 0)}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>` +
    // Word joins two tables that touch; a paragraph keeps them apart.
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>'
  );
}

function tocXml(toc: TocField): string {
  const begin =
    '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>';
  const entries = toc.entries
    .map(
      (entry) =>
        `<w:p><w:pPr><w:pStyle w:val="TOC${Math.min(3, Math.max(1, entry.level))}"/></w:pPr><w:r>${textXml(entry.text)}</w:r></w:p>`,
    )
    .join('');
  return `${begin}${entries}<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
}

function blockXml(block: Block, ctx: WriteContext): string {
  if (block.type === 'paragraph') return paragraphXml(block, ctx);
  if (block.type === 'table') return tableXml(block, ctx);
  return tocXml(block);
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function relsXml(rels: WriteContext['rels']): string {
  const body = rels
    .map(
      (rel) =>
        `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeXml(rel.target)}"${rel.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

function stylesXml(model: DocxModel): string {
  const { fonts, sizes, colors } = model;
  const heading = (id: string, name: string, size: number, level: number, color = colors.text) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="${level}"/></w:pPr>` +
    `<w:rPr>${fontsXml(fonts.heading)}<w:b/><w:bCs/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const h4 = Math.max(sizes.body, Math.round((sizes.h3 + sizes.body) / 2));
  // Page numbers sit on a right tab at the text block's edge, led by dots — the
  // shape the contents has on the page, and Word's own.
  const textWidth = Math.round(model.page.width - model.page.margin * 2);
  const toc = (level: number) =>
    `<w:style w:type="paragraph" w:styleId="TOC${level}"><w:name w:val="toc ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${textWidth}"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="${(level - 1) * 240}"/></w:pPr></w:style>`;
  return (
    `${XML_HEAD}<w:styles ${NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${fontsXml(fonts.body)}<w:color w:val="${colors.text}"/><w:sz w:val="${sizes.body}"/><w:szCs w:val="${sizes.body}"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="${Math.round(model.line)}" w:lineRule="atLeast"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>${fontsXml(fonts.heading)}<w:b/><w:sz w:val="${sizes.title}"/><w:szCs w:val="${sizes.title}"/></w:rPr></w:style>` +
    heading('Heading1', 'heading 1', sizes.h1, 0) +
    heading('Heading2', 'heading 2', sizes.h2, 1) +
    heading('Heading3', 'heading 3', sizes.h3, 2) +
    heading('Heading4', 'heading 4', h4, 3) +
    heading('Heading5', 'heading 5', sizes.body, 4) +
    heading('Heading6', 'heading 6', sizes.body, 5, colors.muted) +
    `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="60" w:after="200"/></w:pPr><w:rPr><w:color w:val="${colors.muted}"/><w:sz w:val="${sizes.caption}"/><w:szCs w:val="${sizes.caption}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>${fontsXml(fonts.mono)}<w:noProof/><w:sz w:val="${Math.max(12, sizes.body - 2)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="${colors.muted}"/></w:rPr></w:style>` +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
    `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="${colors.muted}"/><w:sz w:val="${sizes.caption}"/><w:szCs w:val="${sizes.caption}"/></w:rPr></w:style>` +
    '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${colors.accent}"/><w:u w:val="single"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${colors.muted}"/><w:sz w:val="${sizes.caption}"/><w:szCs w:val="${sizes.caption}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>` +
    toc(1) +
    toc(2) +
    toc(3) +
    '</w:styles>'
  );
}

function numberingXml(model: DocxModel): string {
  const levels = (kind: 'bullet' | 'decimal') =>
    Array.from({ length: 9 }, (_, level) => {
      const text = kind === 'bullet' ? ['•', '◦', '▪'][level % 3] : `%${level + 1}.`;
      const format =
        kind === 'bullet' ? 'bullet' : ['decimal', 'lowerLetter', 'lowerRoman'][level % 3];
      return (
        `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`
      );
    }).join('');
  const abstracts =
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels('bullet')}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels('decimal')}</w:abstractNum>`;
  // One num per list, so each ordered list counts from 1 on its own.
  const nums = model.lists
    .map(
      (kind, index) =>
        `<w:num w:numId="${index + 1}"><w:abstractNumId w:val="${kind === 'bullet' ? 0 : 1}"/>` +
        (kind === 'decimal'
          ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'
          : '') +
        '</w:num>',
    )
    .join('');
  return `${XML_HEAD}<w:numbering ${NS}>${abstracts}${nums}</w:numbering>`;
}

/** Every part of the package, keyed by its path inside the zip. */
export function buildDocxParts(model: DocxModel): Record<string, string | Uint8Array> {
  const drawingId = { value: 1 };

  const docCtx: WriteContext = { model, rels: [], imageIds: new Map(), drawingId };
  const fixedRels = [
    ['http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', 'styles.xml'],
    [
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
      'settings.xml',
    ],
    [
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
      'footnotes.xml',
    ],
    [
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
      'numbering.xml',
    ],
    [
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable',
      'fontTable.xml',
    ],
  ] as const;
  for (const [type, target] of fixedRels) relFor(docCtx, type, target);
  const REL_FOOTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
  const footerRel = model.footer ? relFor(docCtx, REL_FOOTER, 'footer1.xml') : null;
  // A section with no footer reference inherits the one before it, so a
  // section meant to have none points at an empty footer instead.
  const bareFooter =
    footerRel &&
    (model.finalFooter === false ||
      model.blocks.some(
        (block) => block.type === 'paragraph' && block.sectionEnd?.footer === false,
      ));
  const bareRel = bareFooter ? relFor(docCtx, REL_FOOTER, 'footer2.xml') : null;

  const { page } = model;
  const margin = Math.round(page.margin);
  docCtx.section = (footer) => {
    const rel = footer ? footerRel : bareRel;
    return (
      '<w:sectPr>' +
      (rel ? `<w:footerReference w:type="default" r:id="${rel}"/>` : '') +
      `<w:pgSz w:w="${Math.round(page.width)}" w:h="${Math.round(page.height)}"${page.landscape ? ' w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="${Math.round(margin / 2)}" w:footer="${Math.round(margin / 2)}" w:gutter="0"/>` +
      '</w:sectPr>'
    );
  };
  const body = model.blocks.map((block) => blockXml(block, docCtx)).join('');
  const sectPr = docCtx.section(model.finalFooter !== false);
  const documentXml = `${XML_HEAD}<w:document ${NS}><w:body>${body}${sectPr}</w:body></w:document>`;

  // Footnotes and the footer are parts of their own, with their own rels.
  const noteCtx: WriteContext = { model, rels: [], imageIds: new Map(), drawingId };
  const notes = model.footnotes
    .map((note) => {
      const paragraphs = note.paragraphs.map((paragraph, index) =>
        paragraphXml(
          {
            ...paragraph,
            style: 'FootnoteText',
            inlines:
              index === 0
                ? [{ type: 'footnoteRef' }, { type: 'text', text: ' ' }, ...paragraph.inlines]
                : paragraph.inlines,
          },
          noteCtx,
        ),
      );
      return `<w:footnote w:id="${note.id}">${paragraphs.join('')}</w:footnote>`;
    })
    .join('');
  const footnotesXml =
    `${XML_HEAD}<w:footnotes ${NS}>` +
    '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>' +
    '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>' +
    `${notes}</w:footnotes>`;

  const footerCtx: WriteContext = { model, rels: [], imageIds: new Map(), drawingId };
  const footerXml = model.footer
    ? `${XML_HEAD}<w:ftr ${NS}>${paragraphXml({ ...model.footer, style: model.footer.style ?? ('Footer' as StyleId) }, footerCtx)}</w:ftr>`
    : null;

  const settingsXml =
    `${XML_HEAD}<w:settings ${NS}>` +
    // Word reads settings in schema order and calls the file damaged when an
    // element is out of place: updateFields belongs after the spacing control.
    '<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="compressPunctuation"/>' +
    // The contents field is written with the entries it had on screen; Word
    // brings the page numbers up to date as it opens the file.
    '<w:updateFields w:val="true"/>' +
    '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '</w:settings>';

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const coreXml =
    `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${escapeXml(model.title)}</dc:title>` +
    (model.author ? `<dc:creator>${escapeXml(model.author)}</dc:creator>` : '') +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>';

  const imageTypes = [...new Set(model.images.map((image) => image.ext))]
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext}"/>`)
    .join('');
  const contentTypes =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    `<Default Extension="xml" ContentType="application/xml"/>${imageTypes}` +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
    (footerXml
      ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      : '') +
    (bareRel
      ? '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      : '') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  const packageRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';

  const parts: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': packageRels,
    'docProps/core.xml': coreXml,
    'word/document.xml': documentXml,
    'word/_rels/document.xml.rels': relsXml(docCtx.rels),
    'word/styles.xml': stylesXml(model),
    'word/settings.xml': settingsXml,
    'word/numbering.xml': numberingXml(model),
    'word/fontTable.xml': fontTableXml(model.fonts),
    'word/footnotes.xml': footnotesXml,
  };
  if (noteCtx.rels.length > 0) parts['word/_rels/footnotes.xml.rels'] = relsXml(noteCtx.rels);
  if (footerXml) {
    parts['word/footer1.xml'] = footerXml;
    if (footerCtx.rels.length > 0) parts['word/_rels/footer1.xml.rels'] = relsXml(footerCtx.rels);
  }
  if (bareRel) parts['word/footer2.xml'] = `${XML_HEAD}<w:ftr ${NS}><w:p/></w:ftr>`;
  for (const image of model.images) parts[`word/media/${image.name}.${image.ext}`] = image.bytes;
  return parts;
}

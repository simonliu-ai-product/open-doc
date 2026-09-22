/**
 * Word styles, inferred from the document rather than declared by it.
 *
 * Each paragraph role votes, weighted by how much text it carries: whatever the
 * body text mostly looks like becomes Normal, whatever the second-level
 * headings mostly look like becomes Heading 2, and a paragraph only carries
 * direct formatting where it departs from that. Read from the rendered page, so
 * it is right for a document whatever the design, theme, or inline styles did.
 */

import type { Block, DocxModel, Paragraph, RunStyle } from './model';
import { cellMarginsXml, dxa, paraPropsXml, runPropsXml, type StylePara } from './props';
import { el, W_NS, XML_DECLARATION } from './xml';

export type StyleDef = {
  id: string;
  /** Word matches built-in styles by this name, so it stays lower-case where Word's is. */
  name: string;
  run: RunStyle;
  para: StylePara;
  outlineLevel?: number;
  keepLines?: boolean;
};

export type StyleSheet = {
  normal: StyleDef;
  byId: Map<string, StyleDef>;
  /** The footnote marker's colour; set once there are footnotes. */
  footnoteColor?: string;
};

type StyleKey = { id: string; name: string; outlineLevel?: number; keepLines?: boolean };

export function styleKeyOf(paragraph: Paragraph): StyleKey {
  switch (paragraph.role) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, paragraph.level ?? 1));
      return {
        id: `Heading${level}`,
        name: `heading ${level}`,
        outlineLevel: level - 1,
        keepLines: true,
      };
    }
    case 'title':
      return { id: 'Title', name: 'Title' };
    case 'subtitle':
      return { id: 'Subtitle', name: 'Subtitle' };
    case 'toc': {
      const level = Math.min(9, Math.max(1, paragraph.level ?? 1));
      return { id: `TOC${level}`, name: `toc ${level}` };
    }
    case 'caption':
      return { id: 'Caption', name: 'caption' };
    case 'list':
      return { id: 'ListParagraph', name: 'List Paragraph' };
    case 'footnote':
      return { id: 'FootnoteText', name: 'footnote text' };
    case 'header':
      return { id: 'Header', name: 'header' };
    case 'footer':
      return { id: 'Footer', name: 'footer' };
    default:
      return { id: 'Normal', name: 'Normal' };
  }
}

const FALLBACK_RUN: RunStyle = {
  fonts: { ascii: 'Arial' },
  size: 21,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: '000000',
};

class Tally<T> {
  private readonly weights = new Map<string, { value: T; weight: number }>();

  add(value: T, weight: number): void {
    const key = JSON.stringify(value);
    const entry = this.weights.get(key);
    if (entry) entry.weight += weight;
    else this.weights.set(key, { value, weight });
  }

  winner(): T | undefined {
    let best: { value: T; weight: number } | undefined;
    for (const entry of this.weights.values()) {
      if (!best || entry.weight > best.weight) best = entry;
    }
    return best?.value;
  }
}

/** Only what a style can sensibly own; underline, shading, and super/subscript stay local. */
function styleableRun(run: RunStyle): RunStyle {
  return {
    fonts: run.fonts,
    size: run.size,
    bold: run.bold,
    italic: run.italic,
    underline: false,
    strike: false,
    color: run.color,
    caps: run.caps,
    smallCaps: run.smallCaps,
    spacing: run.spacing,
  };
}

type Votes = {
  key: StyleKey;
  run: Tally<RunStyle>;
  align: Tally<StylePara['align']>;
  before: Tally<number>;
  after: Tally<number>;
  line: Tally<number | undefined>;
  keepNext: Tally<boolean>;
};

function textLength(paragraph: Paragraph): number {
  let length = 0;
  for (const inline of paragraph.inlines) if (inline.type === 'text') length += inline.text.length;
  return length;
}

/** Every paragraph in the blocks, table cells included, and whether it sits in one. */
export function* paragraphsOf(blocks: Block[], inCell = false): Generator<[Paragraph, boolean]> {
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      yield [block, inCell];
      continue;
    }
    for (const row of block.rows) {
      for (const cell of row.cells) yield* paragraphsOf(cell.blocks, true);
    }
  }
}

function* allParagraphs(model: DocxModel): Generator<[Paragraph, boolean]> {
  for (const section of model.sections) {
    yield* paragraphsOf(section.blocks);
    yield* paragraphsOf(section.header ?? []);
    yield* paragraphsOf(section.footer ?? []);
    yield* paragraphsOf(section.footerFirst ?? []);
  }
  for (const note of model.footnotes) yield* paragraphsOf(note.blocks);
}

export function inferStyles(model: DocxModel): StyleSheet {
  const votes = new Map<string, Votes>();
  const markers = new Tally<string>();

  for (const [paragraph, inCell] of allParagraphs(model)) {
    const key = styleKeyOf(paragraph);
    // Table text is usually set smaller than the body. Letting it vote would
    // make a table-heavy report's Normal the size of its cells.
    if (inCell && key.id === 'Normal') continue;

    let entry = votes.get(key.id);
    if (!entry) {
      entry = {
        key,
        run: new Tally(),
        align: new Tally(),
        before: new Tally(),
        after: new Tally(),
        line: new Tally(),
        keepNext: new Tally(),
      };
      votes.set(key.id, entry);
    }
    const weight = Math.max(1, textLength(paragraph));
    for (const inline of paragraph.inlines) {
      if (inline.type === 'text' && inline.text.trim()) {
        entry.run.add(styleableRun(inline.style), inline.text.length);
      }
      if (inline.type === 'footnote') markers.add(inline.style.color, 1);
    }
    entry.align.add(paragraph.props.align, weight);
    entry.before.add(paragraph.props.spaceBefore ?? 0, weight);
    entry.after.add(paragraph.props.spaceAfter ?? 0, weight);
    entry.line.add(paragraph.props.lineExact ? undefined : paragraph.props.line, weight);
    entry.keepNext.add(Boolean(paragraph.props.keepNext), weight);
  }

  const define = (entry: Votes, fallbackRun: RunStyle): StyleDef => ({
    id: entry.key.id,
    name: entry.key.name,
    run: entry.run.winner() ?? fallbackRun,
    para: {
      spaceBefore: entry.before.winner() ?? 0,
      spaceAfter: entry.after.winner() ?? 0,
      align: entry.align.winner(),
      line: entry.line.winner(),
      keepNext: entry.keepNext.winner(),
    },
    outlineLevel: entry.key.outlineLevel,
    keepLines: entry.key.keepLines,
  });

  const normalVotes = votes.get('Normal');
  const normal: StyleDef = normalVotes
    ? define(normalVotes, FALLBACK_RUN)
    : { id: 'Normal', name: 'Normal', run: FALLBACK_RUN, para: { spaceBefore: 0, spaceAfter: 0 } };

  const byId = new Map<string, StyleDef>([['Normal', normal]]);
  for (const [id, entry] of votes) {
    if (id !== 'Normal') byId.set(id, define(entry, normal.run));
  }

  // Headings the document never used still get defined, so a reviewer who adds
  // one in Word gets the document's heading face rather than Word's own.
  for (let level = 1; level <= 3; level++) {
    const id = `Heading${level}`;
    if (byId.has(id)) continue;
    const nearest = [1, 2, 3, 4, 5, 6]
      .map((n) => byId.get(`Heading${n}`))
      .find((def): def is StyleDef => def !== undefined);
    const run = nearest?.run ?? { ...normal.run, bold: true };
    byId.set(id, {
      id,
      name: `heading ${level}`,
      run: { ...run, size: model.headingSizes?.[level - 1] ?? run.size },
      para: nearest?.para ?? { spaceBefore: 240, spaceAfter: 120, keepNext: true },
      outlineLevel: level - 1,
      keepLines: true,
    });
  }

  return { normal, byId, footnoteColor: markers.winner() };
}

function hiddenStyle(type: string, id: string, name: string, priority: number, extra = ''): string {
  return el(
    'w:style',
    { 'w:type': type, 'w:default': '1', 'w:styleId': id },
    [
      el('w:name', { 'w:val': name }),
      el('w:uiPriority', { 'w:val': priority }),
      el('w:semiHidden'),
      el('w:unhideWhenUsed'),
      extra,
    ].join(''),
  );
}

export function stylesXml(sheet: StyleSheet, eastAsiaLang?: string): string {
  const normal = sheet.normal;
  const lang = el('w:lang', { 'w:val': 'en-US', 'w:eastAsia': eastAsiaLang });

  const paragraphStyle = (def: StyleDef): string => {
    const isNormal = def.id === 'Normal';
    return el(
      'w:style',
      { 'w:type': 'paragraph', 'w:default': isNormal ? '1' : undefined, 'w:styleId': def.id },
      [
        el('w:name', { 'w:val': def.name }),
        isNormal ? '' : el('w:basedOn', { 'w:val': 'Normal' }),
        isNormal || def.id.startsWith('TOC') ? '' : el('w:next', { 'w:val': 'Normal' }),
        el('w:qFormat'),
        paraPropsXml(def.para, null, { keepLines: def.keepLines, outlineLevel: def.outlineLevel }),
        runPropsXml(def.run, isNormal ? null : normal.run),
      ].join(''),
    );
  };

  const styles = [
    `<w:docDefaults><w:rPrDefault>${runPropsXml(normal.run, null, { lang })}</w:rPrDefault>`,
    `<w:pPrDefault><w:pPr>${el('w:spacing', { 'w:after': 0, 'w:line': 240, 'w:lineRule': 'auto' })}</w:pPr></w:pPrDefault></w:docDefaults>`,
    paragraphStyle(normal),
    hiddenStyle('character', 'DefaultParagraphFont', 'Default Paragraph Font', 1),
    hiddenStyle(
      'table',
      'TableNormal',
      'Normal Table',
      99,
      `<w:tblPr>${dxa('w:tblInd', 0)}${cellMarginsXml('w:tblCellMar', { top: 0, left: 108, bottom: 0, right: 108 })}</w:tblPr>`,
    ),
    hiddenStyle('numbering', 'NoList', 'No List', 99),
  ];

  for (const def of sheet.byId.values()) {
    if (def.id !== 'Normal') styles.push(paragraphStyle(def));
  }

  if (sheet.footnoteColor) {
    styles.push(
      el(
        'w:style',
        { 'w:type': 'character', 'w:styleId': 'FootnoteReference' },
        [
          el('w:name', { 'w:val': 'footnote reference' }),
          el('w:basedOn', { 'w:val': 'DefaultParagraphFont' }),
          el('w:uiPriority', { 'w:val': 99 }),
          el('w:unhideWhenUsed'),
          `<w:rPr>${el('w:color', { 'w:val': sheet.footnoteColor })}${el('w:vertAlign', { 'w:val': 'superscript' })}</w:rPr>`,
        ].join(''),
      ),
    );
  }

  return `${XML_DECLARATION}<w:styles xmlns:w="${W_NS}">${styles.join('')}</w:styles>`;
}

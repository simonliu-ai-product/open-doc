import { strToU8, type Zippable, zipSync } from 'fflate';
import { eastAsiaLangFromFonts, standInFor } from './fonts';
import type {
  Block,
  DocxModel,
  Inline,
  LinkTarget,
  ListKind,
  Media,
  Paragraph,
  RunStyle,
  Section,
  Table,
} from './model';
import { bordersXml, cellMarginsXml, dxa, paraPropsXml, runPropsXml, shadingXml } from './props';
import { inferStyles, type StyleSheet, styleKeyOf, stylesXml } from './styles';
import { el, W_NS, XML_DECLARATION, xmlAttr, xmlText } from './xml';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PART_NS = [
  `xmlns:w="${W_NS}"`,
  `xmlns:r="${REL}"`,
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');

const CJK = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;

/** One relationship list per part: a footer's picture is the footer's relationship, not the body's. */
class Rels {
  private readonly entries: string[] = [];
  private readonly known = new Map<string, string>();

  /** `type` is a full URI, or a name under the officeDocument relationships. */
  add(type: string, target: string, external = false): string {
    const key = `${type}\n${target}`;
    const existing = this.known.get(key);
    if (existing) return existing;
    const id = `rId${this.entries.length + 1}`;
    this.entries.push(
      el('Relationship', {
        Id: id,
        Type: type.includes(':') ? type : `${REL}/${type}`,
        Target: target,
        TargetMode: external ? 'External' : undefined,
      }),
    );
    this.known.set(key, id);
    return id;
  }

  get empty(): boolean {
    return this.entries.length === 0;
  }

  xml(): string {
    return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.entries.join('')}</Relationships>`;
  }
}

type Env = {
  styles: StyleSheet;
  media: Media[];
  rels: Rels;
  /** Drawing and bookmark ids are unique across every part of the package. */
  ids: { drawing: number; bookmark: number };
};

function sameLink(a: LinkTarget | undefined, b: LinkTarget | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function linkOf(inline: Inline): LinkTarget | undefined {
  return 'link' in inline ? inline.link : undefined;
}

function textRun(text: string, style: RunStyle, base: RunStyle): string {
  const rPr = runPropsXml(style, base, { eastAsiaHint: CJK.test(text) });
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function referenceRPr(styles: StyleSheet): string {
  return styles.footnoteColor
    ? `<w:rPr>${el('w:rStyle', { 'w:val': 'FootnoteReference' })}</w:rPr>`
    : `<w:rPr>${el('w:vertAlign', { 'w:val': 'superscript' })}</w:rPr>`;
}

function drawingXml(inline: Extract<Inline, { type: 'image' }>, env: Env): string {
  const media = env.media[inline.image.media];
  if (!media) return '';
  const rel = env.rels.add('image', `media/${media.name}`);
  const id = ++env.ids.drawing;
  const { width, height, alt } = inline.image;
  const cx = Math.max(1, width);
  const cy = Math.max(1, height);
  return [
    '<w:r><w:drawing>',
    `<wp:inline distT="0" distB="0" distL="0" distR="0">`,
    el('wp:extent', { cx, cy }),
    el('wp:effectExtent', { l: 0, t: 0, r: 0, b: 0 }),
    el('wp:docPr', { id, name: `Picture ${id}`, descr: alt || undefined }),
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    '<pic:pic>',
    `<pic:nvPicPr>${el('pic:cNvPr', { id, name: media.name })}<pic:cNvPicPr/></pic:nvPicPr>`,
    `<pic:blipFill>${el('a:blip', { 'r:embed': rel })}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>`,
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/>${el('a:ext', { cx, cy })}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`,
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
  ].join('');
}

function inlineXml(inline: Inline, base: RunStyle, env: Env): string {
  switch (inline.type) {
    case 'text':
      return textRun(inline.text, inline.style, base);
    case 'break':
      return `<w:r>${inline.style ? runPropsXml(inline.style, base) : ''}<w:br/></w:r>`;
    case 'tab':
      return '<w:r><w:tab/></w:r>';
    case 'field':
      return el(
        'w:fldSimple',
        { 'w:instr': ` ${inline.instr} ` },
        textRun(inline.cached, inline.style, base),
      );
    case 'footnote':
      return `<w:r>${referenceRPr(env.styles)}${el('w:footnoteReference', { 'w:id': inline.id })}</w:r>`;
    case 'image':
      return drawingXml(inline, env);
  }
}

/** Adjacent text in the same style is one run: Word writes it that way, and editing is saner. */
function coalesce(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const last = out[out.length - 1];
    if (
      inline.type === 'text' &&
      last?.type === 'text' &&
      sameLink(last.link, inline.link) &&
      JSON.stringify(last.style) === JSON.stringify(inline.style)
    ) {
      out[out.length - 1] = { ...last, text: last.text + inline.text };
    } else {
      out.push(inline);
    }
  }
  return out;
}

function inlinesXml(inlines: Inline[], base: RunStyle, env: Env): string {
  const merged = coalesce(inlines);
  let out = '';
  let i = 0;
  while (i < merged.length) {
    const first = merged[i];
    if (!first) break;
    const link = linkOf(first);
    let runs = '';
    while (i < merged.length) {
      const inline = merged[i];
      if (!inline || !sameLink(linkOf(inline), link)) break;
      runs += inlineXml(inline, base, env);
      i++;
    }
    if (!link) out += runs;
    else if ('url' in link) {
      out += `<w:hyperlink r:id="${env.rels.add('hyperlink', link.url, true)}" w:history="1">${runs}</w:hyperlink>`;
    } else {
      out += `<w:hyperlink w:anchor="${xmlAttr(link.anchor)}" w:history="1">${runs}</w:hyperlink>`;
    }
  }
  return out;
}

function paragraphXml(
  paragraph: Paragraph,
  env: Env,
  opts: { sectPr?: string; lead?: string } = {},
): string {
  const key = styleKeyOf(paragraph);
  const style = env.styles.byId.get(key.id) ?? env.styles.normal;
  const pPr = paraPropsXml(paragraph.props, style.para, {
    pStyle: key.id === 'Normal' ? undefined : key.id,
    numPr: paragraph.list,
    sectPr: opts.sectPr,
  });

  let body = opts.lead ?? '';
  if (paragraph.field?.begin) {
    body +=
      '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
      `<w:r><w:instrText xml:space="preserve"> ${xmlText(paragraph.field.begin)} </w:instrText></w:r>` +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  }
  const bookmarkId = paragraph.bookmark ? env.ids.bookmark++ : undefined;
  if (paragraph.bookmark) {
    body += el('w:bookmarkStart', { 'w:id': bookmarkId, 'w:name': paragraph.bookmark });
  }
  body += inlinesXml(paragraph.inlines, style.run, env);
  if (paragraph.bookmark) body += el('w:bookmarkEnd', { 'w:id': bookmarkId });
  if (paragraph.field?.end) body += '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

  return `<w:p>${pPr}${body}</w:p>`;
}

function tableXml(table: Table, env: Env): string {
  const width = table.columns.reduce((sum, column) => sum + column, 0);
  const tblPr = [
    dxa('w:tblW', width),
    table.align ? el('w:jc', { 'w:val': table.align }) : '',
    table.indent ? dxa('w:tblInd', table.indent) : '',
    el('w:tblLayout', { 'w:type': 'fixed' }),
    cellMarginsXml('w:tblCellMar', { left: 0, right: 0 }),
  ].join('');
  const grid = table.columns.map((column) => el('w:gridCol', { 'w:w': column })).join('');

  const rows = table.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const tcPr = [
            dxa('w:tcW', cell.width),
            cell.span > 1 ? el('w:gridSpan', { 'w:val': cell.span }) : '',
            cell.merge
              ? el('w:vMerge', cell.merge === 'restart' ? { 'w:val': 'restart' } : {})
              : '',
            bordersXml('w:tcBorders', cell.borders),
            shadingXml(cell.shading),
            cellMarginsXml('w:tcMar', cell.margins),
            cell.vAlign ? el('w:vAlign', { 'w:val': cell.vAlign }) : '',
          ].join('');
          // A cell has to end in a paragraph, or Word will not open the file.
          const last = cell.blocks[cell.blocks.length - 1];
          const content =
            blocksXml(cell.blocks, env) + (last?.type === 'paragraph' ? '' : '<w:p/>');
          return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content}</w:tc>`;
        })
        .join('');
      const trPr = row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

function blocksXml(blocks: Block[], env: Env): string {
  let out = '';
  let previous: Block | undefined;
  for (const block of blocks) {
    // Two tables with nothing between them are one table to Word.
    if (block.type === 'table' && previous?.type === 'table') out += '<w:p/>';
    out += block.type === 'paragraph' ? paragraphXml(block, env) : tableXml(block, env);
    previous = block;
  }
  return out;
}

type Band = 'header' | 'footer';

type BandRefs = { header?: string; footer?: string; footerFirst?: string };

function sectPrXml(section: Section, refs: BandRefs): string {
  const { page } = section;
  return [
    '<w:sectPr>',
    refs.header ? el('w:headerReference', { 'w:type': 'default', 'r:id': refs.header }) : '',
    refs.footer ? el('w:footerReference', { 'w:type': 'default', 'r:id': refs.footer }) : '',
    refs.footerFirst
      ? el('w:footerReference', { 'w:type': 'first', 'r:id': refs.footerFirst })
      : '',
    el('w:type', { 'w:val': 'nextPage' }),
    el('w:pgSz', {
      'w:w': page.width,
      'w:h': page.height,
      'w:orient': page.width > page.height ? 'landscape' : undefined,
    }),
    el('w:pgMar', {
      'w:top': page.margin.top,
      'w:right': page.margin.right,
      'w:bottom': page.margin.bottom,
      'w:left': page.margin.left,
      'w:header': page.header,
      'w:footer': page.footer,
      'w:gutter': 0,
    }),
    el('w:cols', { 'w:space': 720 }),
    // Word's "different first page", which is what takes the `first` footer.
    refs.footerFirst ? el('w:titlePg') : '',
    el('w:docGrid', { 'w:linePitch': 360 }),
    '</w:sectPr>',
  ].join('');
}

const BULLETS: Partial<Record<ListKind, string>> = { disc: '•', circle: '◦', square: '▪' };

function numberingXml(model: DocxModel): string {
  const kinds = [...new Set(model.lists.map((list) => list.kind))];
  const abstractId = new Map(kinds.map((kind, index) => [kind, index]));

  const abstracts = kinds.map((kind) => {
    const bullet = BULLETS[kind];
    const levels = Array.from({ length: 9 }, (_, level) =>
      el(
        'w:lvl',
        { 'w:ilvl': level },
        [
          el('w:start', { 'w:val': 1 }),
          el('w:numFmt', { 'w:val': bullet ? 'bullet' : kind }),
          el('w:lvlText', { 'w:val': bullet ?? `%${level + 1}.` }),
          el('w:lvlJc', { 'w:val': 'left' }),
          `<w:pPr>${el('w:ind', { 'w:left': 720 * (level + 1), 'w:hanging': 360 })}</w:pPr>`,
        ].join(''),
      ),
    ).join('');
    return el(
      'w:abstractNum',
      { 'w:abstractNumId': abstractId.get(kind) },
      `${el('w:multiLevelType', { 'w:val': 'hybridMultilevel' })}${levels}`,
    );
  });

  // Every list gets its own instance with an explicit start. Instances of one
  // abstract definition otherwise continue each other's count, and the second
  // numbered list in a document would open at 4.
  const instances = model.lists.map((list) =>
    el(
      'w:num',
      { 'w:numId': list.id },
      [
        el('w:abstractNumId', { 'w:val': abstractId.get(list.kind) }),
        el(
          'w:lvlOverride',
          { 'w:ilvl': list.level },
          el('w:startOverride', { 'w:val': list.start }),
        ),
      ].join(''),
    ),
  );

  return `${XML_DECLARATION}<w:numbering xmlns:w="${W_NS}">${abstracts.join('')}${instances.join('')}</w:numbering>`;
}

function fontTableXml(model: DocxModel, lang: string | undefined): string {
  const fonts = (model.fonts ?? []).map((font) => {
    const standIn = standInFor(font, lang);
    return el(
      'w:font',
      { 'w:name': font.name },
      [
        standIn.altName ? el('w:altName', { 'w:val': standIn.altName }) : '',
        el('w:charset', { 'w:val': standIn.charset }),
        el('w:family', { 'w:val': standIn.family }),
        el('w:pitch', { 'w:val': standIn.pitch }),
      ].join(''),
    );
  });
  return `${XML_DECLARATION}<w:fonts xmlns:w="${W_NS}">${fonts.join('')}</w:fonts>`;
}

function settingsXml(model: DocxModel): string {
  const footnotes =
    model.footnotes.length > 0
      ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>'
      : '';
  return [
    XML_DECLARATION,
    `<w:settings xmlns:w="${W_NS}">`,
    '<w:zoom w:percent="100"/>',
    // Without it Word keeps the page colour to itself and shows white paper.
    model.background ? '<w:displayBackgroundShape/>' : '',
    '<w:defaultTabStop w:val="720"/>',
    '<w:characterSpacingControl w:val="doNotCompress"/>',
    footnotes,
    // Without this Word opens the file in compatibility mode and lays it out
    // with Word 2007's rules.
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>',
    '</w:settings>',
  ].join('');
}

function w3cdtf(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function corePropsXml(model: DocxModel, now: Date): string {
  const created =
    model.created && !Number.isNaN(Date.parse(model.created)) ? new Date(model.created) : now;
  return [
    XML_DECLARATION,
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<dc:title>${xmlText(model.title)}</dc:title>`,
    model.subject ? `<dc:subject>${xmlText(model.subject)}</dc:subject>` : '',
    model.author ? `<dc:creator>${xmlText(model.author)}</dc:creator>` : '',
    `<dcterms:created xsi:type="dcterms:W3CDTF">${w3cdtf(created)}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${w3cdtf(now)}</dcterms:modified>`,
    '</cp:coreProperties>',
  ].join('');
}

const CONTENT = 'application/vnd.openxmlformats-officedocument';

/**
 * The model as a `.docx`: WordprocessingML parts in an OPC zip. Hand-written
 * rather than a dependency for the same reason as the Markdown and CSV readers
 * — core ships to every user — and the part of OOXML a document needs is small.
 */
export function writeDocx(model: DocxModel, now = new Date()): Uint8Array {
  const styles = inferStyles(model);
  // Which language the CJK text is in, as the faces say; the text alone does
  // not tell Traditional from Simplified.
  const lang = eastAsiaLangFromFonts(
    (model.fonts ?? []).filter((font) => font.eastAsia).map((font) => font.name),
  );
  const ids = { drawing: 0, bookmark: 0 };
  const documentRels = new Rels();
  const files: Zippable = {};
  const overrides: string[] = [];
  const part = (name: string, contentType: string, xml: string) => {
    files[name] = strToU8(xml);
    overrides.push(el('Override', { PartName: `/${name}`, ContentType: contentType }));
  };

  documentRels.add('styles', 'styles.xml');
  documentRels.add('settings', 'settings.xml');

  // Word carries a section's header and footer into the next section unless
  // that section names its own, so once any section has one, the sections
  // without it get an explicitly empty one.
  const used = {
    header: model.sections.some((section) => section.header),
    footer: model.sections.some((section) => section.footer),
  };
  const written = { header: 0, footer: 0 };
  const previous: Partial<Record<Band, string>> = {};
  const bandPart = (band: Band, paragraphs: Paragraph[] | undefined): string => {
    const rels = new Rels();
    const content = paragraphs?.length
      ? blocksXml(paragraphs, { styles, media: model.media, rels, ids })
      : '<w:p/>';
    written[band] += 1;
    const name = `${band}${written[band]}.xml`;
    const root = band === 'header' ? 'w:hdr' : 'w:ftr';
    part(
      `word/${name}`,
      `${CONTENT}.wordprocessingml.${band}+xml`,
      `${XML_DECLARATION}<${root} ${PART_NS}>${content}</${root}>`,
    );
    if (!rels.empty) files[`word/_rels/${name}.rels`] = strToU8(rels.xml());
    return documentRels.add(band, name);
  };
  const bandFor = (band: Band, paragraphs: Paragraph[] | undefined): string | undefined => {
    if (!used[band]) return undefined;
    // The same as the section before: leaving the reference out is Word's own
    // "link to previous", so a reviewer edits one footer, not one per section.
    const key = JSON.stringify(paragraphs ?? []);
    if (previous[band] === key) return undefined;
    previous[band] = key;
    return bandPart(band, paragraphs);
  };

  const env: Env = { styles, media: model.media, rels: documentRels, ids };
  let body = '';
  model.sections.forEach((section, index) => {
    const header = bandFor('header', section.header);
    const footer = bandFor('footer', section.footer);
    const footerFirst = section.footerFirst && bandPart('footer', section.footerFirst);
    const sectPr = sectPrXml(section, { header, footer, footerFirst });
    const blocks = section.blocks;
    const last = blocks[blocks.length - 1];

    if (index === model.sections.length - 1) {
      body += blocksXml(blocks, env);
      if (last?.type !== 'paragraph') body += '<w:p/>';
      body += sectPr;
    } else if (last?.type === 'paragraph') {
      // A section ends at the paragraph that carries its properties.
      body += blocksXml(blocks.slice(0, -1), env);
      body += paragraphXml(last, env, { sectPr });
    } else {
      body += `${blocksXml(blocks, env)}<w:p><w:pPr>${sectPr}</w:pPr></w:p>`;
    }
  });

  part(
    'word/document.xml',
    `${CONTENT}.wordprocessingml.document.main+xml`,
    `${XML_DECLARATION}<w:document ${PART_NS}>${model.background ? el('w:background', { 'w:color': model.background }) : ''}<w:body>${body}</w:body></w:document>`,
  );

  if (model.footnotes.length > 0) {
    const rels = new Rels();
    const noteEnv: Env = { styles, media: model.media, rels, ids };
    const separator = (kind: 'separator' | 'continuationSeparator', id: number) =>
      el(
        'w:footnote',
        { 'w:type': kind, 'w:id': id },
        `<w:p><w:pPr>${el('w:spacing', { 'w:after': 0, 'w:line': 240, 'w:lineRule': 'auto' })}</w:pPr><w:r><w:${kind}/></w:r></w:p>`,
      );
    const lead = `<w:r>${referenceRPr(styles)}<w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>`;
    const notes = model.footnotes.map((note) => {
      const [first, ...rest] = note.blocks;
      const content =
        first?.type === 'paragraph'
          ? paragraphXml(first, noteEnv, { lead }) + blocksXml(rest, noteEnv)
          : `<w:p>${lead}</w:p>${blocksXml(note.blocks, noteEnv)}`;
      return el('w:footnote', { 'w:id': note.id }, content);
    });
    part(
      'word/footnotes.xml',
      `${CONTENT}.wordprocessingml.footnotes+xml`,
      `${XML_DECLARATION}<w:footnotes ${PART_NS}>${separator('separator', -1)}${separator('continuationSeparator', 0)}${notes.join('')}</w:footnotes>`,
    );
    if (!rels.empty) files['word/_rels/footnotes.xml.rels'] = strToU8(rels.xml());
    documentRels.add('footnotes', 'footnotes.xml');
  }

  if (model.lists.length > 0) {
    part('word/numbering.xml', `${CONTENT}.wordprocessingml.numbering+xml`, numberingXml(model));
    documentRels.add('numbering', 'numbering.xml');
  }

  part('word/styles.xml', `${CONTENT}.wordprocessingml.styles+xml`, stylesXml(styles, lang));
  if (model.fonts?.length) {
    part(
      'word/fontTable.xml',
      `${CONTENT}.wordprocessingml.fontTable+xml`,
      fontTableXml(model, lang),
    );
    documentRels.add('fontTable', 'fontTable.xml');
  }
  part('word/settings.xml', `${CONTENT}.wordprocessingml.settings+xml`, settingsXml(model));
  part(
    'docProps/core.xml',
    'application/vnd.openxmlformats-package.core-properties+xml',
    corePropsXml(model, now),
  );
  part(
    'docProps/app.xml',
    `${CONTENT}.extended-properties+xml`,
    `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>open-doc</Application></Properties>`,
  );

  const extensions = new Map<string, string>();
  for (const media of model.media) {
    const extension = media.name.slice(media.name.lastIndexOf('.') + 1);
    extensions.set(extension, media.contentType);
    // Pictures are already compressed; deflating them again only costs time.
    files[`word/media/${media.name}`] = [media.bytes, { level: 0 }];
  }

  files['word/_rels/document.xml.rels'] = strToU8(documentRels.xml());
  const packageRels = new Rels();
  packageRels.add('officeDocument', 'word/document.xml');
  packageRels.add(
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    'docProps/core.xml',
  );
  packageRels.add('extended-properties', 'docProps/app.xml');
  files['_rels/.rels'] = strToU8(packageRels.xml());

  const defaults = [
    el('Default', {
      Extension: 'rels',
      ContentType: 'application/vnd.openxmlformats-package.relationships+xml',
    }),
    el('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    ...[...extensions].map(([Extension, ContentType]) => el('Default', { Extension, ContentType })),
  ];
  const contentTypes = strToU8(
    `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.join('')}${overrides.join('')}</Types>`,
  );

  return zipSync({ '[Content_Types].xml': contentTypes, ...files });
}

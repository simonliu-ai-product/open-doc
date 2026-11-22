import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DocxError, parseDocx } from './docx.ts';
import { detectLang } from './lang.ts';
import { generateDocumentSource } from './to-tsx.ts';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

type Parts = {
  styles?: string;
  numbering?: string;
  rels?: string;
  footnotes?: string;
  files?: Record<string, Uint8Array>;
};

function docx(body: string, parts: Parts = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W} ${R}><w:body>${body}<w:sectPr/></w:body></w:document>`,
    ),
    ...(parts.files ?? {}),
  };
  if (parts.styles) files['word/styles.xml'] = strToU8(`<w:styles ${W}>${parts.styles}</w:styles>`);
  if (parts.numbering) {
    files['word/numbering.xml'] = strToU8(`<w:numbering ${W}>${parts.numbering}</w:numbering>`);
  }
  if (parts.footnotes) {
    files['word/footnotes.xml'] = strToU8(`<w:footnotes ${W}>${parts.footnotes}</w:footnotes>`);
  }
  if (parts.rels) {
    files['word/_rels/document.xml.rels'] = strToU8(
      `<?xml version="1.0"?><Relationships>${parts.rels}</Relationships>`,
    );
  }
  return zipSync(files);
}

const p = (inner: string, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
const r = (text: string, rPr = '') =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const styled = (style: string, text: string) => p(r(text), `<w:pStyle w:val="${style}"/>`);

const STYLES = `
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>`;

const NUMBERING = `
<w:abstractNum w:abstractNumId="0">
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl>
  <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="1">
  <w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/></w:lvl>
  <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>`;

const item = (numId: number, ilvl: number, text: string) =>
  p(r(text), `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`);

describe('parseDocx', () => {
  it('reads headings through the style chain and the title into front matter', () => {
    const parsed = parseDocx(
      docx(
        styled('Title', 'Annual Report') +
          styled('Subtitle', 'Fiscal 2026') +
          styled('Heading1', 'Overview') +
          p(r('Body text.')) +
          styled('MyHeading', 'Custom heading') +
          styled('Heading2', 'Details'),
        {
          styles: `${STYLES}<w:style w:type="paragraph" w:styleId="MyHeading"><w:name w:val="My Heading"/><w:basedOn w:val="Heading1"/></w:style>`,
        },
      ),
    );
    expect(parsed.frontmatter).toEqual({ title: 'Annual Report', subtitle: 'Fiscal 2026' });
    expect(
      parsed.blocks.map((block) => [block.type, 'level' in block ? block.level : null]),
    ).toEqual([
      ['heading', 1],
      ['heading', 1],
      ['paragraph', null],
      ['heading', 1],
      ['heading', 2],
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('reads bold, italic, code-font runs, hyperlinks and line breaks', () => {
    const parsed = parseDocx(
      docx(
        p(
          r('Plain ') +
            r('bold ', '<w:b/>') +
            r('strong', '<w:rStyle w:val="Strong"/>') +
            r(' and ') +
            r('italic', '<w:i/>') +
            r(' then ') +
            r('npm i', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>') +
            '<w:hyperlink r:id="rId9">' +
            r(' a link') +
            '</w:hyperlink>' +
            '<w:hyperlink r:id="rId10">' +
            r(' unsafe') +
            '</w:hyperlink>' +
            '<w:r><w:br/><w:t>next line</w:t></w:r>',
        ),
        {
          styles: STYLES,
          rels:
            '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"/>' +
            '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>',
        },
      ),
    );
    expect(parsed.blocks).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Plain ' },
          { type: 'strong', children: [{ type: 'text', value: 'bold strong' }] },
          { type: 'text', value: ' and ' },
          { type: 'em', children: [{ type: 'text', value: 'italic' }] },
          { type: 'text', value: ' then ' },
          { type: 'code', value: 'npm i' },
          {
            type: 'link',
            href: 'https://example.com/a?b=1&c=2',
            children: [{ type: 'text', value: ' a link' }],
          },
          { type: 'text', value: ' unsafe' },
          { type: 'break' },
          { type: 'text', value: 'next line' },
        ],
      },
    ]);
  });

  it('builds bulleted and numbered lists with nesting from numbering.xml', () => {
    const parsed = parseDocx(
      docx(
        item(1, 0, 'Apples') +
          item(1, 1, 'Green') +
          item(1, 0, 'Pears') +
          p(r('Between')) +
          item(2, 0, 'Third') +
          item(2, 1, 'sub a') +
          item(2, 0, 'Fourth'),
        { styles: STYLES, numbering: NUMBERING },
      ),
    );
    const text = (value: string) => [{ type: 'paragraph', children: [{ type: 'text', value }] }];
    expect(parsed.blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [...text('Apples'), { type: 'list', ordered: false, start: 1, items: [text('Green')] }],
          text('Pears'),
        ],
      },
      { type: 'paragraph', children: [{ type: 'text', value: 'Between' }] },
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          [...text('Third'), { type: 'list', ordered: true, start: 1, items: [text('sub a')] }],
          text('Fourth'),
        ],
      },
    ]);
  });

  it('reads tables with the first row as the header, and unwraps one-cell boxes', () => {
    const cell = (text: string, tcPr = '', pPr = '') =>
      `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}${p(r(text), pPr)}</w:tc>`;
    const parsed = parseDocx(
      docx(
        `<w:tbl><w:tblPr/>` +
          `<w:tr>${cell('Region')}${cell('Revenue')}</w:tr>` +
          `<w:tr>${cell('North')}${cell('1,200', '', '<w:jc w:val="right"/>')}</w:tr>` +
          `<w:tr>${cell('Total', '<w:gridSpan w:val="2"/>')}</w:tr>` +
          `</w:tbl>` +
          `<w:tbl><w:tr><w:tc>${p(r('const x = 1;', '<w:rFonts w:ascii="Courier New"/>'))}${p(r('x++;', '<w:rFonts w:ascii="Courier New"/>'))}</w:tc></w:tr></w:tbl>`,
      ),
    );
    const t = (value: string) => [{ type: 'text', value }];
    expect(parsed.blocks).toEqual([
      {
        type: 'table',
        head: [t('Region'), t('Revenue')],
        rows: [
          [t('North'), t('1,200')],
          [t('Total'), []],
        ],
        align: [null, 'right'],
      },
      { type: 'code', lang: null, value: 'const x = 1;\nx++;' },
    ]);
    expect(parsed.warnings).toEqual(['1 merged table cell(s) split into separate cells']);
  });

  it('turns an embedded picture into a figure, captioned by the next Caption paragraph', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const drawing = `<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:docPr id="1" name="Picture 1" descr="A chart"/><a:graphic xmlns:a="a"><a:graphicData><pic:pic xmlns:pic="pic"><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const parsed = parseDocx(
      docx(p(drawing) + styled('Caption', 'Figure 1. Sales by month') + p(drawing), {
        styles: STYLES,
        rels: '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>',
        files: { 'word/media/image1.png': png },
      }),
    );
    expect(parsed.blocks).toEqual([
      { type: 'figure', src: 'word/media/image1.png', alt: 'Figure 1. Sales by month' },
      { type: 'figure', src: 'word/media/image1.png', alt: 'A chart' },
    ]);
    expect(parsed.media.get('word/media/image1.png')).toEqual(png);
  });

  it('accepts tracked insertions, drops deletions, and reports what it could not keep', () => {
    const parsed = parseDocx(
      docx(
        p(
          r('Kept ') +
            `<w:ins w:id="1">${r('inserted ')}</w:ins>` +
            `<w:del w:id="2"><w:r><w:delText>deleted </w:delText></w:r></w:del>` +
            r('text') +
            '<w:r><w:footnoteReference w:id="2"/></w:r>' +
            '<w:commentRangeStart w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>',
        ) +
          p(
            '<w:r><w:drawing><wps:txbx xmlns:wps="wps"><w:txbxContent>' +
              p(r('Inside a box')) +
              '</w:txbxContent></wps:txbx></w:drawing></w:r>',
          ) +
          styled('TOC1', 'Overview ........ 1'),
        {
          styles: STYLES,
          footnotes: `<w:footnote w:type="separator" w:id="-1">${p('<w:r><w:separator/></w:r>')}</w:footnote><w:footnote w:id="2">${p(r('A note.'))}</w:footnote>`,
        },
      ),
    );
    expect(parsed.blocks).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'Kept inserted text[1]' }],
      },
      { type: 'paragraph', children: [{ type: 'text', value: 'Inside a box' }] },
      { type: 'hr' },
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: [[{ type: 'paragraph', children: [{ type: 'text', value: 'A note.' }] }]],
      },
    ]);
    expect(parsed.warnings).toEqual([
      '1 tracked insertion(s) accepted',
      '1 tracked deletion(s) accepted (their text is gone)',
      '1 footnote(s) or endnote(s) moved to a numbered list at the end',
      '1 comment(s) not imported',
      '1 text box(es) kept as paragraphs after the text they sit beside',
    ]);
  });

  it('keeps the shown text of a HYPERLINK field and skips its instruction', () => {
    const parsed = parseDocx(
      docx(
        p(
          '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
            '<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://open-doc.dev" </w:instrText></w:r>' +
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
            r('open-doc') +
            '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
        ),
      ),
    );
    expect(parsed.blocks).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            href: 'https://open-doc.dev',
            children: [{ type: 'text', value: 'open-doc' }],
          },
        ],
      },
    ]);
  });

  it('reads a Chinese Word file whose style ids are localized', () => {
    // Chinese Word names its built-in styles in English but numbers their ids.
    const styles = `
<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="paragraph" w:styleId="a3"><w:name w:val="Title"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="paragraph" w:styleId="a5"><w:name w:val="List Paragraph"/><w:basedOn w:val="a"/></w:style>`;
    const bytes = docx(
      styled('a3', '年度報告') +
        styled('1', '這個季度的重點') +
        p(r('我們的營收成長了百分之二十，這對團隊來說是很大的進展。')) +
        styled('2', '下一步') +
        p(
          r('第一項'),
          '<w:pStyle w:val="a5"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>',
        ) +
        p(
          r('第二項'),
          '<w:pStyle w:val="a5"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>',
        ),
      { styles, numbering: NUMBERING.replace('<w:start w:val="3"/>', '<w:start w:val="1"/>') },
    );
    const parsed = parseDocx(bytes);
    expect(parsed.frontmatter.title).toBe('年度報告');
    expect(parsed.blocks.map((block) => block.type)).toEqual([
      'heading',
      'heading',
      'paragraph',
      'heading',
      'list',
    ]);
    expect(detectLang(parsed.text)).toBe('zh-Hant');

    const { source, title } = generateDocumentSource(parsed, {
      docId: 'annual',
      createdAt: '2026-11-22T00:00:00.000Z',
    });
    expect(title).toBe('年度報告');
    const body = source.slice(source.indexOf('const Body'), source.indexOf('export const meta'));
    expect(body).not.toContain('年度報告');
    expect(body).toContain('<h1 style={h1}>這個季度的重點</h1>');
    expect(body).toContain('<ol style={ol}>');
  });

  it('infers headings and typed bullets in a file with no styles at all', () => {
    // The shape macOS TextEdit writes: sizes and bold instead of heading
    // styles, and a typed "•⇥" instead of list numbering.
    const big = '<w:b/><w:sz w:val="48"/>';
    const body = '<w:sz w:val="24"/>';
    const bullet = (text: string, left: number) =>
      p(
        `<w:r><w:rPr>${body}</w:rPr><w:t></w:t><w:tab/><w:t>•</w:t><w:tab/></w:r>${r(text, body)}`,
        `<w:ind w:left="${left}" w:hanging="360"/>`,
      );
    const parsed = parseDocx(
      docx(
        p(r('Report', big)) +
          p(r('Some long running body copy that is clearly not a heading at all.', body)) +
          p(r('Section', '<w:b/><w:sz w:val="36"/>')) +
          bullet('One', 720) +
          bullet('Nested', 1440) +
          p(r('A bold line in body size', `<w:b/>${body}`)),
      ),
    );
    expect(parsed.blocks).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'Report' }] },
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            value: 'Some long running body copy that is clearly not a heading at all.',
          },
        ],
      },
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'Section' }] },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [
            { type: 'paragraph', children: [{ type: 'text', value: 'One' }] },
            {
              type: 'list',
              ordered: false,
              start: 1,
              items: [[{ type: 'paragraph', children: [{ type: 'text', value: 'Nested' }] }]],
            },
          ],
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'strong', children: [{ type: 'text', value: 'A bold line in body size' }] },
        ],
      },
    ]);
  });

  it('refuses a file that is not a .docx', () => {
    expect(() => parseDocx(new TextEncoder().encode('not a zip'))).toThrow(DocxError);
    expect(() => parseDocx(zipSync({ 'a.txt': strToU8('x') }))).toThrow(DocxError);
  });
});

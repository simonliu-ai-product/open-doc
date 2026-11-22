import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { type LParagraph, type LTable, readDocxLayout } from './docx-layout.ts';
import { generateLayoutSource } from './layout-to-tsx.ts';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docx(body: string, styles = '', sectPr = ''): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}${
        sectPr ||
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1800"/></w:sectPr>'
      }</w:body></w:document>`,
    ),
  };
  if (styles) files['word/styles.xml'] = strToU8(`<w:styles ${W}>${styles}</w:styles>`);
  return zipSync(files);
}

const p = (inner: string, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
const r = (text: string, rPr = '') =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const tc = (text: string, tcPr = '') =>
  `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}${p(r(text))}</w:tc>`;

const DEFAULTS = `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="新細明體"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/><w:basedOn w:val="a"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>`;

function blocks(bytes: Uint8Array) {
  return readDocxLayout(bytes).sections.flatMap((section) => section.blocks);
}

describe('readDocxLayout', () => {
  it('takes the page size and margins from the section', () => {
    const layout = readDocxLayout(docx(p(r('x'))));
    expect(layout.pageSize).toBe('A4');
    expect(layout.orientation).toBe('portrait');
    // 1440 twips top/bottom = 96px; the wider left margin is made up per block.
    expect(layout.sections[0].padding).toBe(96);
    const para = layout.sections[0].blocks[0] as LParagraph;
    expect(para.css.margin).toBe('0px 0px 0px 24px');
  });

  it('reads alignment, indents, spacing and exact line height', () => {
    const [para] = blocks(
      docx(
        p(
          r('Title'),
          '<w:jc w:val="center"/><w:ind w:left="720" w:hanging="360"/><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="exact"/>',
        ),
      ),
    ) as LParagraph[];
    expect(para.css).toMatchObject({
      textAlign: 'center',
      margin: '16px 0px 8px 72px',
      textIndent: -24,
      lineHeight: '24px',
    });
  });

  it('resolves run styles from defaults, paragraph style and direct formatting', () => {
    const layout = readDocxLayout(
      docx(
        p(r('標題'), '<w:pStyle w:val="1"/>') +
          p(
            r('紅字', '<w:color w:val="FF0000"/><w:b/>') +
              r('楷書', '<w:rFonts w:ascii="標楷體" w:eastAsia="標楷體"/>'),
          ),
        DEFAULTS,
      ),
    );
    const [heading, body] = layout.sections[0].blocks as LParagraph[];
    expect(heading.heading).toBe(1);
    expect(heading.runs[0]).toMatchObject({ kind: 'text', css: { fontSize: 24, fontWeight: 700 } });
    const [red, kai] = body.runs;
    expect(red).toMatchObject({ css: { color: '#FF0000', fontWeight: 700, fontSize: 16 } });
    const serif = String(red.kind === 'text' && red.css.fontFamily).slice(6);
    const kaiId = String(kai.kind === 'text' && kai.css.fontFamily).slice(6);
    expect(layout.fonts.get(serif)).toMatch(/新細明體.*serif$/);
    expect(layout.fonts.get(kaiId)).toMatch(/^"標楷體".*Kaiti TC.*serif$/);
  });

  it('turns underlined spaces and tabs into fill-in blanks', () => {
    const [para] = blocks(
      docx(p(r('姓名：') + r('      ', '<w:u w:val="single"/>') + r('　　', '<w:u/>'))),
    ) as LParagraph[];
    expect(para.runs.map((run) => run.kind)).toEqual(['text', 'blank', 'blank']);
    expect(para.runs[1]).toMatchObject({ width: '3em' });
    expect(para.runs[2]).toMatchObject({ width: '2em' });
  });

  it('maps gridSpan and vMerge to colSpan and rowSpan, with borders, shading and widths', () => {
    const border = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="nil"/>';
    const [table] = blocks(
      docx(
        `<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/><w:tblBorders><w:left w:val="single" w:sz="12"/><w:insideV w:val="dashed" w:sz="4"/></w:tblBorders></w:tblPr>` +
          `<w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="3000"/></w:tblGrid>` +
          `<w:tr>${tc('關係人', '<w:vMerge w:val="restart"/><w:vAlign w:val="center"/>')}${tc('Head', `<w:gridSpan w:val="2"/><w:shd w:val="clear" w:fill="DDDDDD"/><w:tcBorders>${border}</w:tcBorders>`)}</w:tr>` +
          `<w:tr>${tc('', '<w:vMerge/>')}${tc('a')}${tc('b')}</w:tr>` +
          `</w:tbl>`,
      ),
    ) as LTable[];
    expect(table.cols).toEqual([100, 100, 200]);
    expect(table.css.width).toBe(400);
    expect(table.splittable).toBe(false);
    const [first, second] = table.rows;
    expect(first.cells.map((c) => [c.colSpan, c.rowSpan])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(second.cells).toHaveLength(2);
    expect(first.cells[0].css).toMatchObject({
      verticalAlign: 'middle',
      borderLeft: '2px solid #000000',
    });
    expect(first.cells[1].css).toMatchObject({
      background: '#DDDDDD',
      borderTop: '0.67px solid #000000',
      borderBottom: 'none',
      borderLeft: '0.67px dashed #000000',
    });
  });

  it('breaks the page where Word does and keeps a label with its table', () => {
    const body =
      p(r('before') + '<w:r><w:br w:type="page"/></w:r>' + r('after')) +
      p(r('表1：')) +
      `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr>${tc('x')}</w:tr><w:tr>${tc('y')}</w:tr></w:tbl>` +
      p(r('next'), '<w:pageBreakBefore/>');
    const [before, after, label, table, next] = blocks(docx(body));
    expect(before).toMatchObject({ kind: 'p' });
    expect(after).toMatchObject({ breakBefore: true });
    expect(label).toMatchObject({ keepNext: true });
    expect(table).toMatchObject({ kind: 'table', splittable: true });
    expect(next).toMatchObject({ breakBefore: true });
  });

  it('starts a new flow at a section break, with that section’s margins', () => {
    const layout = readDocxLayout(
      docx(
        p(
          r('one'),
          '<w:sectPr><w:pgMar w:top="737" w:right="1247" w:bottom="737" w:left="1304"/></w:sectPr>',
        ) + p(r('two')),
        '',
        '<w:sectPr><w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="851"/></w:sectPr>',
      ),
    );
    expect(layout.sections.map((section) => section.padding)).toEqual([49.13, 56.73]);
  });
});

describe('generateLayoutSource', () => {
  it('writes inline-styled TSX with real headings, spans, blanks and merged cells', () => {
    const layout = readDocxLayout(
      docx(
        p(r('標題'), '<w:pStyle w:val="1"/>') +
          p(
            r('一般文字很多很多很多') +
              r('紅', '<w:color w:val="FF0000"/>') +
              r('粗', '<w:b/>') +
              r('    ', '<w:u/>'),
            '<w:jc w:val="right"/>',
          ) +
          `<w:tbl><w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>` +
          `<w:tr>${tc('A', '<w:vMerge w:val="restart"/>')}${tc('B')}</w:tr><w:tr>${tc('', '<w:vMerge/>')}${tc('C')}</w:tr></w:tbl>`,
        DEFAULTS,
      ),
    );
    const { source, title } = generateLayoutSource(layout, {
      docId: 'form',
      lang: 'zh-Hant-TW',
      createdAt: '2026-11-22T00:00:00.000Z',
    });
    expect(title).toBe('標題');
    expect(source).toContain('<h1 style={{ fontSize: 24, fontWeight: 700,');
    expect(source).toContain("textAlign: 'right'");
    expect(source).toContain("<span style={{ color: '#FF0000' }}>紅</span><strong>粗</strong>");
    expect(source).toContain(
      "<span style={{ display: 'inline-block', width: '2em', borderBottom: '1px solid currentColor' }} />",
    );
    expect(source).toContain('<td rowSpan={2}');
    expect(source).toContain("pageSize: 'A4',");
    expect(source).toContain('const Section1 = flow(');
    expect(source).not.toContain('Cover');
    expect(source).not.toContain('useTableSlice');
  });

  it('lets a table without merged rows split across pages', () => {
    const layout = readDocxLayout(
      docx(
        `<w:tbl><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${tc('H')}</w:tr><w:tr>${tc('1')}</w:tr><w:tr>${tc('2')}</w:tr></w:tbl>`,
      ),
    );
    const { source } = generateLayoutSource(layout, { docId: 't', createdAt: 'x' });
    expect(source).toContain('data-od-splittable=""');
    expect(source).toContain('<thead>');
    expect(source).toContain('<Rows>');
    expect(source).toContain('useTableSlice,');
  });
});

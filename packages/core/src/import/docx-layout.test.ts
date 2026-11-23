import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { type LParagraph, type LTable, layoutText, readDocxLayout } from './docx-layout.ts';
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
    expect(layout.sections[0].padding).toEqual({ top: 96, right: 96, bottom: 96, left: 96 });
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
    expect(layout.fonts.get(kaiId)).toMatch(
      /^"標楷體", "TW-Kai", "全字庫正楷體".*Kaiti TC.*serif$/,
    );
  });

  it('puts a free font with the same widths right after the font it stands in for', () => {
    const layout = readDocxLayout(
      docx(
        p(r('a', '<w:rFonts w:ascii="Calibri" w:eastAsia="新細明體"/>')) +
          p(r('b', '<w:rFonts w:ascii="Cambria"/>')),
      ),
    );
    const stacks = [...layout.fonts.values()];
    expect(stacks).toContainEqual(expect.stringMatching(/^"Calibri", "Carlito", "新細明體", /));
    expect(stacks).toContainEqual(expect.stringMatching(/^"Cambria", "Caladea", /));
  });

  it('turns underlined spaces and tabs into fill-in blanks as wide as Word draws them', () => {
    const kai = '<w:rFonts w:ascii="標楷體" w:eastAsia="標楷體"/>';
    const [para] = blocks(
      docx(
        p(
          r('姓名：') +
            r('        ', '<w:u w:val="single"/>') +
            r('\u3000\u3000', '<w:u/>') +
            r('      ', `${kai}<w:u/>`),
        ),
      ),
    ) as LParagraph[];
    expect(para.runs.map((run) => run.kind)).toEqual(['text', 'blank', 'blank', 'blank']);
    // A half-width space is a quarter em in any font; a full-width space a whole one.
    expect(para.runs[1]).toMatchObject({ width: '2em' });
    expect(para.runs[2]).toMatchObject({ width: '2em' });
    expect(para.runs[3]).toMatchObject({ width: '1.5em' });
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
      p(`${r('before')}<w:r><w:br w:type="page"/></w:r>${r('after')}`) +
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
    expect(layout.sections.map((section) => section.padding)).toEqual([
      // Word's own top and bottom; the sides pad with the narrower one.
      { top: 49.13, right: 83.13, bottom: 49.13, left: 83.13 },
      { top: 56.73, right: 56.73, bottom: 56.73, left: 56.73 },
    ]);
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
      "<span style={{ display: 'inline-block', width: '1em', borderBottom: '1px solid currentColor' }} />",
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

/** Every character Word prints from document.xml, read without the importer's walker. */
function wordText(bytes: Uint8Array): string {
  const xml = strFromU8(unzipSync(bytes)['word/document.xml']);
  const body = xml
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<w:(del|moveFrom)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
    .replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:vanish\/>[\s\S]*?<\/w:r>/g, '');
  return [...body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((match) => match[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The characters of `expected` the output does not carry, counted as a multiset. */
function missing(expected: string, actual: string): string {
  const have = new Map<string, number>();
  for (const char of actual) if (char.trim()) have.set(char, (have.get(char) ?? 0) + 1);
  let out = '';
  for (const char of expected) {
    if (!char.trim()) continue;
    const n = have.get(char) ?? 0;
    if (n > 0) have.set(char, n - 1);
    else out += char;
  }
  return out;
}

/** The JSX text of the generated flow sections, tags and style objects stripped. */
function sourceText(source: string): string {
  const body = source.slice(source.indexOf('const Section1'), source.indexOf('export const meta'));
  const kept: string[] = [];
  return body
    .replace(/\{'([^']*)'\}/g, (_, text: string) => `\uE000${kept.push(text) - 1}\uE000`)
    .replace(/<[^>]*>/g, '')
    .replace(/\uE000(\d+)\uE000/g, (_, n: string) => kept[Number(n)]);
}

function expectNoLostText(bytes: Uint8Array) {
  const layout = readDocxLayout(bytes);
  const expected = wordText(bytes);
  expect(missing(expected, layoutText(layout))).toBe('');
  const { source } = generateLayoutSource(layout, { docId: 'x', createdAt: 'x' });
  expect(missing(expected, sourceText(source))).toBe('');
}

describe('no text is lost', () => {
  it('reads text inside every wrapper Word puts around runs', () => {
    const bytes = docx(
      p(
        r('如') +
          '<w:r><w:ruby><w:rubyPr/><w:rt><w:r><w:t>ㄏㄜˊ</w:t></w:r></w:rt><w:rubyBase><w:r><w:t>和</w:t></w:r></w:rubyBase></w:ruby></w:r>' +
          `<w:sdt><w:sdtPr/><w:sdtContent>${r('內容控制')}</w:sdtContent></w:sdt>` +
          `<w:smartTag w:element="date">${r('智慧標籤')}</w:smartTag>` +
          `<w:customXml w:element="x">${r('自訂')}</w:customXml>` +
          `<w:fldSimple w:instr=" PAGE ">${r('7')}</w:fldSimple>` +
          `<w:hyperlink w:anchor="a">${r('連結')}</w:hyperlink>` +
          `<w:ins w:id="1">${r('插入')}</w:ins><w:moveTo w:id="2">${r('移入')}</w:moveTo>` +
          `<w:del w:id="3"><w:r><w:delText>刪除</w:delText></w:r></w:del>` +
          `<w:permStart w:id="9"/><w:vendor:wrap xmlns:w="x">${r('未知包裝')}</w:vendor:wrap>` +
          `<mc:AlternateContent xmlns:mc="mc"><mc:Fallback>${r('備援')}</mc:Fallback></mc:AlternateContent>` +
          '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> DATE </w:instrText></w:r>',
      ) + p(r('下一段')),
    );
    expectNoLostText(bytes);
    const text = layoutText(readDocxLayout(bytes));
    expect(text).toContain('和');
    expect(text).toContain('備援');
    expect(text).toContain('下一段');
    expect(text).not.toContain('刪除');
  });

  it('shows a Wingdings box as a box', () => {
    const [para] = blocks(
      docx(p(`<w:r><w:sym w:font="Wingdings" w:char="F0A8"/></w:r>${r('申請')}`)),
    ) as LParagraph[];
    expect(para.runs[0]).toMatchObject({ kind: 'text', text: '□' });
  });

  // Real files are not committed; point OPEN_DOC_DOCX_SAMPLES at a folder of .docx to check them.
  const samples = process.env.OPEN_DOC_DOCX_SAMPLES;
  it.skipIf(!samples)('keeps every character of the sample files', () => {
    const dir = samples as string;
    const files = readdirSync(dir).filter((name) => name.endsWith('.docx'));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const bytes = new Uint8Array(readFileSync(join(dir, name)));
      try {
        expectNoLostText(bytes);
      } catch (err) {
        throw new Error(`${name}: ${(err as Error).message}`);
      }
    }
  });
});

describe('layout fidelity', () => {
  it('fits a 標楷體 16pt line on an 18pt grid, but not 新細明體 at 14pt', () => {
    const grid =
      '<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:docGrid w:type="lines" w:linePitch="360"/></w:sectPr>';
    const [kai, ming, off] = blocks(
      docx(
        p(r('楷書', '<w:rFonts w:eastAsia="標楷體"/><w:sz w:val="32"/>')) +
          p(r('明體', '<w:rFonts w:eastAsia="新細明體"/><w:sz w:val="28"/>')) +
          p(
            r('不對齊', '<w:rFonts w:eastAsia="新細明體"/><w:sz w:val="28"/>'),
            '<w:snapToGrid w:val="0"/>',
          ),
        '',
        grid,
      ),
    ) as LParagraph[];
    expect(kai.css.lineHeight).toBe('24px');
    expect(ming.css.lineHeight).toBe('48px');
    expect(off.css.lineHeight).toBe(1.3);
  });

  it('places an anchored text box at its offset, with its border, and drops empty ones', () => {
    const anchor = (text: string, line: string) =>
      `<w:r><w:drawing><wp:anchor xmlns:wp="wp"><wp:positionH relativeFrom="column"><wp:posOffset>5369560</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-370840</wp:posOffset></wp:positionV><wp:extent cx="666750" cy="311150"/><a:graphic xmlns:a="a"><a:graphicData><wps:wsp xmlns:wps="wps"><wps:spPr>${line}</wps:spPr><wps:txbx><w:txbxContent>${p(text ? r(text) : '')}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    const [para] = blocks(
      docx(
        p(
          anchor(
            '附表二',
            '<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>',
          ) + anchor('', '<a:noFill/><a:ln><a:noFill/></a:ln>'),
        ),
      ),
    ) as LParagraph[];
    expect(para.runs).toHaveLength(1);
    expect(para.runs[0]).toMatchObject({
      kind: 'box',
      left: 563.73,
      top: -38.93,
      width: 70,
      css: { border: '1.33px solid #000000', whiteSpace: 'nowrap' },
    });
    const { source } = generateLayoutSource(readDocxLayout(docx(p(anchor('附表二', '')))), {
      docId: 'x',
      createdAt: 'x',
    });
    expect(source).toContain("position: 'relative'");
    expect(source).toContain("<div style={{ position: 'absolute', left: ");
  });

  it('prints no blank sheet for a page break before a section break or a second break', () => {
    const brk = '<w:r><w:br w:type="page"/></w:r>';
    const layout = readDocxLayout(
      docx(
        p(r('one') + brk) +
          p(
            '',
            '<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
          ) +
          p(r('two') + brk) +
          p(brk) +
          p(r('three')),
      ),
    );
    expect(layout.sections).toHaveLength(2);
    const [first, second] = layout.sections;
    expect(first.blocks.some((block) => block.breakBefore)).toBe(false);
    expect(second.blocks[0].breakBefore).toBeFalsy();
    expect(second.blocks.filter((block) => block.breakBefore)).toHaveLength(1);
    expect(layoutText(layout).replace(/\s/g, '')).toBe('onetwothree');
  });

  it('splits a table with merged rows between the merges, and fits one wider than the sheet', () => {
    const cell = (text: string, tcPr = '') => tc(text, tcPr);
    const merged = (n: number) =>
      `<w:tr>${cell(`m${n}`, '<w:vMerge w:val="restart"/>')}${cell('a')}</w:tr><w:tr>${cell('', '<w:vMerge/>')}${cell('b')}</w:tr>`;
    const plain = (n: number) => `<w:tr>${cell(`p${n}`)}${cell('c')}</w:tr>`;
    const pieces = blocks(
      docx(
        `<w:tbl><w:tblGrid><w:gridCol w:w="9000"/><w:gridCol w:w="9000"/></w:tblGrid>${plain(1)}${plain(2)}${merged(1)}${plain(3)}${merged(2)}</w:tbl>`,
      ),
    ) as LTable[];
    expect(pieces.map((t) => [t.rows.length, t.splittable])).toEqual([
      [2, true],
      [2, false],
      [1, false],
      [2, false],
    ]);
    // 18000 twips is 1200px, wider than A4; it shrinks to the 578px text column.
    expect(pieces[0].css.width).toBe(578);
    expect(pieces[1].css.margin).toMatch(/^-1px /);
    expect(
      readDocxLayout(
        docx(`<w:tbl><w:tblGrid><w:gridCol w:w="18000"/></w:tblGrid>${plain(1)}</w:tbl>`),
      ).warnings,
    ).toContain('1 table(s) wider than the page scaled down to fit');
  });

  it('keeps a run highlight on the words, not the paragraph, and draws ruby', () => {
    const layout = readDocxLayout(
      docx(
        p(
          r('黃色底', '<w:highlight w:val="yellow"/>') +
            '<w:r><w:ruby><w:rubyPr/><w:rt><w:r><w:t>ㄏㄜˊ</w:t></w:r></w:rt><w:rubyBase><w:r><w:t>和</w:t></w:r></w:rubyBase></w:ruby></w:r>',
        ),
      ),
    );
    const { source } = generateLayoutSource(layout, { docId: 'x', createdAt: 'x' });
    expect(source).toMatch(
      /<p style=\{\{[^}]*\}\}><span style=\{\{ background: '#ffff00' \}\}>黃色底<\/span>/,
    );
    expect(source).toContain('<ruby>和<rt>ㄏㄜˊ</rt></ruby>');
  });
});

/** A package whose main part is written with its own prefixes and namespace URIs. */
function rawDocx(documentXml: string, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = { 'word/document.xml': strToU8(documentXml) };
  for (const [name, xml] of Object.entries(extra)) files[name] = strToU8(xml);
  return zipSync(files);
}

describe('compatibility', () => {
  it('reads Strict OOXML and any prefix by namespace URI', () => {
    const strict = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
    const text = layoutText(
      readDocxLayout(
        rawDocx(
          `<ns0:document xmlns:ns0="${strict}"><ns0:body><ns0:p><ns0:r><ns0:t>嚴格格式</ns0:t></ns0:r></ns0:p></ns0:body></ns0:document>`,
        ),
      ),
    );
    expect(text).toContain('嚴格格式');
  });

  it('reads every body a producer wrote, rows and cells inside content controls, and a table with no grid', () => {
    const doc = `<w:document ${W}><w:body>${p(r('one'))}</w:body><w:body>${p(r('two'))}<w:tbl><w:sdt><w:sdtContent><w:tr><w:tc>${p(r('cell A'))}</w:tc><w:sdt><w:sdtContent><w:tc>${p(r('cell B'))}</w:tc></w:sdtContent></w:sdt></w:tr></w:sdtContent></w:sdt></w:tbl></w:body></w:document>`;
    const layout = readDocxLayout(rawDocx(doc));
    expect(layoutText(layout).replace(/\s/g, '')).toBe('onetwocellAcellB');
    const table = layout.sections[0].blocks.find((block) => block.kind === 'table') as LTable;
    expect(table.cols).toHaveLength(2);
    expect(table.cols[0]).toBeGreaterThan(100);
  });

  it('refuses an encrypted file and an old .doc with a message, and never reads external entities', () => {
    const ole = new Uint8Array(4096);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => readDocxLayout(ole)).toThrow(/older Word \.doc/);
    const encrypted = new Uint8Array(4096);
    encrypted.set(ole.subarray(0, 8));
    const marker = 'EncryptedPackage';
    for (let i = 0; i < marker.length; i++) encrypted[512 + i * 2] = marker.charCodeAt(i);
    expect(() => readDocxLayout(encrypted)).toThrow(/password-protected/);
    const xxe = `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document ${W}><w:body>${p('<w:r><w:t>a&x;b</w:t></w:r>')}</w:body></w:document>`;
    expect(layoutText(readDocxLayout(rawDocx(xxe)))).toContain('a&x;b');
  });

  it('cuts a row taller than a page into rows that can break across pages', () => {
    const long = Array.from({ length: 60 }, (_, i) =>
      p(r(`段落 ${i} ${'很長的文字'.repeat(20)}`)),
    ).join('');
    const [table] = blocks(
      docx(
        `<w:tbl><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc>${p(r('head'))}</w:tc></w:tr><w:tr><w:tc>${long}</w:tc></w:tr></w:tbl>`,
      ),
    ) as LTable[];
    expect(table.rows.length).toBeGreaterThan(3);
    expect(table.splittable).toBe(true);
    expect(table.rows[1].cells[0].css.borderBottom).toBe('none');
  });

  it('takes a table style’s first-row and banding formats as tblLook switches them on', () => {
    const styles = `<w:style w:type="table" w:styleId="Grid"><w:name w:val="Grid"/><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:tcPr><w:shd w:val="clear" w:fill="9BBB59"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:fill="EEEEEE"/></w:tcPr></w:tblStylePr></w:style>`;
    const [table] = blocks(
      docx(
        `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblLook w:firstRow="1" w:noHBand="0"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc>${p(r('ITEM'))}</w:tc></w:tr><w:tr><w:tc>${p(r('Books'))}</w:tc></w:tr><w:tr><w:tc>${p(r('Pens'))}</w:tc></w:tr></w:tbl>`,
        styles,
      ),
    ) as LTable[];
    const [head, first, second] = table.rows.map((row) => row.cells[0]);
    expect(head.css.background).toBe('#9BBB59');
    expect((head.blocks[0] as LParagraph).runs[0]).toMatchObject({
      css: { fontWeight: 700, color: '#FFFFFF' },
    });
    expect(first.css.background).toBe('#EEEEEE');
    expect(second.css.background).toBeUndefined();
  });

  it('sets newspaper columns, drop caps, internal links and right-to-left text', () => {
    const layout = readDocxLayout(
      docx(
        p(r('W'), '<w:framePr w:dropCap="drop" w:lines="3"/>') +
          p(r('ord opens the paragraph.')) +
          p('<w:hyperlink w:anchor="sec"><w:r><w:t>see below</w:t></w:r></w:hyperlink>') +
          p(`<w:bookmarkStart w:id="1" w:name="sec"/>${r('Target')}`) +
          p(r('שלום', '<w:rtl/>'), '<w:bidi/><w:jc w:val="right"/>'),
        '',
        '<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:cols w:num="2" w:space="720"/></w:sectPr>',
      ),
    );
    expect(layout.sections[0].columns).toEqual({ count: 2, gap: 48 });
    const [dropped, link, target, rtl] = layout.sections[0].blocks as LParagraph[];
    expect(dropped.runs[0]).toMatchObject({ kind: 'drop', text: 'W', css: { float: 'left' } });
    expect(link.runs[0]).toMatchObject({ href: '#sec' });
    expect(target.runs[0]).toEqual({ kind: 'anchor', id: 'sec' });
    expect(rtl.css).toMatchObject({ direction: 'rtl', textAlign: 'end' });
    const { source } = generateLayoutSource(layout, { docId: 'x', createdAt: 'x' });
    expect(source).toContain('columns: 2, columnGap: 48');
    expect(source).toContain('<span id="sec" />');
  });

  it('keeps a row of pictures side by side, in line as Word sets them', () => {
    const pic = `<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="p" descr="logo"/><a:graphic xmlns:a="a"><a:graphicData><a:blip r:embed="rId404"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const layout = readDocxLayout(docx(p(pic + pic)));
    const [para] = layout.sections[0].blocks as LParagraph[];
    for (const run of para.runs) if (run.kind === 'image') run.src = 'https://example.com/logo.png';
    const { source } = generateLayoutSource(layout, {
      docId: 'logos',
      createdAt: '2026-11-22T00:00:00.000Z',
    });
    expect(source.match(/<img [^>]*display: 'inline-block'/g)).toHaveLength(2);
  });

  it('places each picture of a group at its spot on the group grid', () => {
    const piece = (id: string, x: number, y: number, cx: number, cy: number) =>
      `<pic:pic xmlns:pic="pic"><pic:nvPicPr><pic:cNvPr id="${id}" name="p${id}"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdA"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></pic:spPr></pic:pic>`;
    const group = `<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:extent cx="1905000" cy="952500"/><wp:docPr id="1" name="g" descr="logo"/><a:graphic xmlns:a="a"><a:graphicData><wpg:wgp xmlns:wpg="wpg"><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/><a:chOff x="0" y="0"/><a:chExt cx="200" cy="100"/></a:xfrm></wpg:grpSpPr>${piece('2', 0, 0, 100, 100)}${piece('3', 100, 50, 100, 50)}</wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const files = unzipSync(docx(p(group)));
    files['word/_rels/document.xml.rels'] = strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/a.png"/></Relationships>',
    );
    files['word/media/a.png'] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const layout = readDocxLayout(zipSync(files));
    const [para] = layout.sections[0].blocks as LParagraph[];
    expect(para.runs).toHaveLength(1);
    const [run] = para.runs;
    expect(run).toMatchObject({ kind: 'image', width: 200, height: 100 });
    expect(run.kind === 'image' && run.parts).toEqual([
      expect.objectContaining({ left: 0, top: 0, width: 100, height: 100 }),
      expect.objectContaining({ left: 100, top: 50, width: 100, height: 50 }),
    ]);
  });

  it('reads boxes from Webdings and Wingdings 2 as boxes', () => {
    const [para] = blocks(
      docx(
        p(
          '<w:r><w:sym w:font="Webdings" w:char="F063"/></w:r>' +
            '<w:r><w:sym w:font="Wingdings 2" w:char="F0A3"/></w:r>' +
            '<w:r><w:sym w:font="Wingdings" w:char="F0A8"/></w:r>',
        ),
      ),
    ) as LParagraph[];
    expect(para.runs.map((run) => (run.kind === 'text' ? run.text : '')).join('')).toBe('☐□□');
  });

  it('prints headers and footers in the margin band, with live page numbers', () => {
    const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const sectPr = `<w:sectPr ${R}><w:headerReference w:type="default" r:id="rH"/><w:headerReference w:type="first" r:id="rF"/><w:footerReference w:type="default" r:id="rFt"/><w:titlePg/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992"/></w:sectPr>`;
    const files = unzipSync(docx(p(r('本文')), '', sectPr));
    const pic = `<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="p" descr="校徽"/><a:graphic xmlns:a="a"><a:graphicData><a:blip ${R} r:embed="rIdLogo"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    files['word/header1.xml'] = strToU8(`<w:hdr ${W}>${p(pic + r('機密文件'))}</w:hdr>`);
    files['word/header2.xml'] = strToU8(`<w:hdr ${W}>${p(r('封面頁首'))}</w:hdr>`);
    files['word/footer1.xml'] = strToU8(
      `<w:ftr ${W}>${p(
        `${r('第 ')}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r('3')}<w:r><w:fldChar w:fldCharType="end"/></w:r>${r(' 頁，共 ')}<w:fldSimple w:instr=" NUMPAGES ">${r('9')}</w:fldSimple>${r(' 頁')}`,
        '<w:jc w:val="center"/>',
      )}</w:ftr>`,
    );
    const rel = (id: string, type: string, target: string) =>
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
    files['word/_rels/document.xml.rels'] = strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rH', 'header', 'header1.xml')}${rel('rF', 'header', 'header2.xml')}${rel('rFt', 'footer', 'footer1.xml')}</Relationships>`,
    );
    // The header's picture is named in the header's own relationships.
    files['word/_rels/header1.xml.rels'] = strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rIdLogo', 'image', 'media/logo.png')}</Relationships>`,
    );
    files['word/media/logo.png'] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const layout = readDocxLayout(zipSync(files));
    const [section] = layout.sections;
    expect(section.header?.offset).toBeCloseTo(56.73, 1);
    expect(section.footer?.offset).toBeCloseTo(66.13, 1);
    expect(layout.text).not.toContain('機密文件');
    expect(layout.warnings.join(' ')).not.toMatch(/header/i);
    const [logo] = (section.header?.blocks[0] as LParagraph | undefined)?.runs ?? [];
    expect(logo).toMatchObject({ kind: 'image', src: 'word/media/logo.png' });
    const footerRuns = (section.footer?.blocks[0] as LParagraph | undefined)?.runs ?? [];
    expect(
      footerRuns
        .filter((run) => run.kind === 'text' && run.field)
        .map((run) => run.kind === 'text' && run.field),
    ).toEqual(['page', 'pages']);

    const { source } = generateLayoutSource(layout, {
      docId: 'memo',
      createdAt: '2026-11-23T00:00:00.000Z',
    });
    expect(source).toContain('const Header1 = () => {');
    expect(source).toContain('{page === 1 ? (');
    expect(source).toContain('封面頁首');
    expect(source).toContain('{page}');
    expect(source).toContain('{pages}');
    expect(source).toMatch(/useDocPageCount,\s+useDocPageNumber,/);
    expect(source).toContain('header: Header1, footer: Footer1 }');
    expect(source).toMatch(/position: 'absolute', bottom: 66\.13/);
  });

  it('sets a paragraph’s text under a box that spans the line', () => {
    const box = `<w:r><w:drawing><wp:anchor xmlns:wp="wp" distB="95250"><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="5715000" cy="952500"/><wp:wrapTopAndBottom/><a:graphic xmlns:a="a"><a:graphicData><wps:wsp xmlns:wps="wps"><wps:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></wps:spPr><wps:txbx><w:txbxContent>${p(r('框內提醒'))}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    const [para] = blocks(docx(p(box + r('框下的字')))) as LParagraph[];
    const run = para.runs.find((entry) => entry.kind === 'box');
    expect(run).toMatchObject({ kind: 'box', height: 100, clear: 110 });
  });

  it('prints a footnote at the foot of its page, numbered by the document', () => {
    const files = unzipSync(
      docx(p(`${r('本文')}<w:r><w:footnoteReference w:id="2"/></w:r>${r('結束')}`)),
    );
    files['word/footnotes.xml'] = strToU8(
      `<w:footnotes ${W}><w:footnote w:id="2">${p(`<w:r><w:footnoteRef/></w:r>${r(' 資料來源：主計總處')}`)}</w:footnote></w:footnotes>`,
    );
    const layout = readDocxLayout(zipSync(files));
    const [para] = layout.sections[0].blocks as LParagraph[];
    expect(para.runs.map((run) => run.kind)).toEqual(['text', 'note', 'text']);
    expect(layout.warnings.join(' ')).not.toMatch(/footnote/);
    const { source } = generateLayoutSource(layout, {
      docId: 'notes',
      createdAt: '2026-11-23T00:00:00.000Z',
    });
    expect(source).toMatch(/本文<Footnote>.*資料來源：主計總處.*<\/Footnote>結束/);
    expect(source).toMatch(/\bFootnote,/);
  });

  it('floats a picture where Word wraps it: beside the text, or over it', () => {
    const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const pic = (wrap: string, h: string) =>
      `<w:r><w:drawing><wp:anchor xmlns:wp="wp" distT="0" distB="0" distL="114300" distR="114300" behindDoc="0"><wp:positionH relativeFrom="${h.startsWith('align') ? 'margin' : 'column'}">${h.startsWith('align') ? `<wp:align>${h.slice(6)}</wp:align>` : `<wp:posOffset>${h}</wp:posOffset>`}</wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>95250</wp:posOffset></wp:positionV><wp:extent cx="952500" cy="952500"/>${wrap}<wp:docPr id="1" name="p"/><a:graphic xmlns:a="a"><a:graphicData><a:blip ${R} r:embed="rIdA"/></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    const files = unzipSync(
      docx(
        p(pic('<wp:wrapSquare wrapText="bothSides"/>', 'align:right') + r('繞著圖的文字')) +
          p(pic('<wp:wrapNone/>', '1905000') + r('壓在圖上的字')),
      ),
    );
    files['word/_rels/document.xml.rels'] = strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/a.png"/></Relationships>',
    );
    files['word/media/a.png'] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const layout = readDocxLayout(zipSync(files));
    const [beside, over] = layout.sections[0].blocks as LParagraph[];
    expect(beside.runs[0]).toMatchObject({
      kind: 'image',
      place: { mode: 'right', gap: [0, 12, 0, 12] },
    });
    expect(over.runs[0]).toMatchObject({
      kind: 'image',
      place: { mode: 'over', left: 200, top: 10 },
    });
    expect(layout.warnings.join(' ')).not.toMatch(/floating/);
    const { source } = generateLayoutSource(layout, {
      docId: 'f',
      createdAt: '2026-11-23T00:00:00.000Z',
    });
    expect(source).toContain("float: 'right'");
    expect(source).toMatch(/position: 'absolute', left: 200, top: 10/);
  });

  it('lines a framed paragraph up where Word aligns its frame', () => {
    const [centred, pinned] = blocks(
      docx(
        p(
          r('- 3 -'),
          '<w:framePr w:wrap="around" w:vAnchor="text" w:hAnchor="margin" w:xAlign="center" w:y="1"/>',
        ) +
          p(
            r('旁註'),
            '<w:framePr w:w="1500" w:wrap="around" w:hAnchor="margin" w:xAlign="right"/>',
          ),
      ),
    ) as LParagraph[];
    expect(centred.css.textAlign).toBe('center');
    expect(pinned.css).toMatchObject({ width: 100, marginLeft: 'auto', marginRight: 0 });
  });

  it('draws shapes that hold no text: a rule from HTML, a circle, nothing for an empty pict', () => {
    const V =
      'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
    const hr = `<w:r><w:pict ${V}><v:rect style="width:0;height:2.25pt" o:hralign="center" o:hrstd="t" o:hr="t" fillcolor="gray" stroked="f"/></w:pict></w:r>`;
    const circle = `<w:r><w:drawing><wp:anchor xmlns:wp="wp"><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="476250" cy="476250"/><wp:wrapNone/><a:graphic xmlns:a="a"><a:graphicData><wps:wsp xmlns:wps="wps"><wps:spPr><a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="00AA00"/></a:solidFill></wps:spPr><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    const layout = readDocxLayout(
      docx(p(hr) + p(circle + r('圓')) + p(`<w:r><w:pict/></w:r>${r('空')}`)),
    );
    const [rule, round, empty] = layout.sections[0].blocks as LParagraph[];
    expect(rule.runs[0]).toMatchObject({
      kind: 'shape',
      css: { width: '100%', height: 3, background: 'gray' },
    });
    expect(round.runs[0]).toMatchObject({
      kind: 'box',
      width: 50,
      css: { borderRadius: '50%', background: '#00AA00' },
    });
    expect(empty.runs.map((run) => run.kind)).toEqual(['text']);
    expect(layout.warnings.join(' ')).not.toMatch(/shape/);
  });

  it('keeps a Word chart as its data, drawn by open-doc', () => {
    const C =
      'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const cache = (tag: string, values: string[]) =>
      `<c:${tag}><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:${tag}>`;
    const ser = (i: number, name: string, values: string[], rgb: string) =>
      `<c:ser><c:idx val="${i}"/><c:tx><c:strRef><c:f>S!B1</c:f>${cache('strCache', [name])}</c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>S!A2</c:f>${cache('strCache', ['北區', '南區'])}</c:strRef></c:cat><c:val><c:numRef><c:f>S!B2</c:f>${cache('numCache', values)}</c:numRef></c:val></c:ser>`;
    const files = unzipSync(
      docx(
        p(
          '<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:extent cx="4572000" cy="2743200"/><wp:docPr id="1" name="Chart 1"/><a:graphic xmlns:a="a"><a:graphicData><c:chart xmlns:c="c" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdC"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
        ),
      ),
    );
    files['word/_rels/document.xml.rels'] = strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/></Relationships>',
    );
    files['word/charts/chart1.xml'] = strToU8(
      `<c:chartSpace ${C}><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>年度營收</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${ser(0, '2025', ['10', '20'], '4472C4')}${ser(1, '2026', ['15', '25'], 'ED7D31')}<c:dLbls><c:showVal val="1"/></c:dLbls></c:barChart></c:plotArea></c:chart></c:chartSpace>`,
    );
    const layout = readDocxLayout(zipSync(files));
    const [para] = layout.sections[0].blocks as LParagraph[];
    expect(para.runs[0]).toMatchObject({
      kind: 'chart',
      chart: {
        type: 'bar',
        data: [
          { category: '北區', s1: 10, s2: 15 },
          { category: '南區', s1: 20, s2: 25 },
        ],
        series: [
          { key: 's1', name: '2025' },
          { key: 's2', name: '2026' },
        ],
        values: true,
        colors: ['#4472C4', '#ED7D31'],
        width: 480,
        title: '年度營收',
      },
    });
    const { source } = generateLayoutSource(layout, {
      docId: 'c',
      createdAt: '2026-11-23T00:00:00.000Z',
    });
    expect(source).toContain('<Chart type="bar"');
    expect(source).toMatch(/\bChart,/);
  });

  it('turns a landscape section’s sheets instead of shrinking its tables', () => {
    const wide = `<w:tbl><w:tblGrid><w:gridCol w:w="12000"/></w:tblGrid><w:tr>${tc('寬表')}</w:tr></w:tbl>`;
    const layout = readDocxLayout(
      docx(
        p(
          r('直向'),
          '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
        ) + wide,
        '',
        '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
      ),
    );
    const [portrait, landscape] = layout.sections;
    expect(portrait.orientation).toBeUndefined();
    expect(landscape.orientation).toBe('landscape');
    expect((landscape.blocks[0] as LTable).css.width).toBe(800);
    expect(layout.warnings.join(' ')).not.toMatch(/orientation|scaled/);
    const { source } = generateLayoutSource(layout, {
      docId: 'l',
      createdAt: '2026-11-23T00:00:00.000Z',
    });
    expect(source).toContain("orientation: 'landscape'");
  });

  it('keeps a lost picture as a labelled frame and an empty checkbox control as a box', () => {
    const [para] = blocks(
      docx(
        p(
          `<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="p" descr="logo"/><a:graphic xmlns:a="a"><a:graphicData><a:blip r:embed="rId404"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` +
            `<w:sdt><w:sdtPr><w14:checkbox xmlns:w14="w14"><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr><w:sdtContent></w:sdtContent></w:sdt>`,
        ),
      ),
    ) as LParagraph[];
    expect(para.runs[0]).toMatchObject({
      kind: 'image',
      src: '',
      alt: 'logo',
      width: 100,
      height: 50,
    });
    expect(para.runs[1]).toMatchObject({ kind: 'text', text: '☒' });
  });

  it('counts hidden text instead of dropping it silently', () => {
    const layout = readDocxLayout(docx(p(r('shown') + r('secret', '<w:vanish/>'))));
    expect(layoutText(layout)).not.toContain('secret');
    expect(layout.warnings).toContain(
      '1 passage(s) of hidden text left out, as Word does when printing',
    );
  });
});

describe('generated source marks', () => {
  it('never underlines a whole paragraph a run inside it must escape', () => {
    const layout = readDocxLayout(
      docx(p(r('（') + r('填表人屬營利事業、非營利之法人', '<w:u w:val="single"/>'))),
    );
    const { source } = generateLayoutSource(layout, { docId: 'x', createdAt: 'x' });
    const line = source.split('\n').find((l) => l.includes('填表人')) ?? '';
    expect(line).toMatch(/^\s*<p style=\{\{(?![^}]*textDecoration)/);
    expect(line).toContain("<span style={{ textDecoration: 'underline' }}>填表人");
  });

  it('tags tables and rows with their Word index, and text Word draws itself', () => {
    const layout = readDocxLayout(
      docx(
        `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr>${tc('a')}</w:tr><w:tr>${tc('b')}</w:tr></w:tbl>` +
          p(
            '<w:sdt><w:sdtPr><w14:checkbox xmlns:w14="w14"/></w:sdtPr><w:sdtContent></w:sdtContent></w:sdt>',
          ),
      ),
    );
    const { source } = generateLayoutSource(layout, { docId: 'x', createdAt: 'x' });
    expect(source).toContain('data-od-source-table="0"');
    expect(source).toContain('<tr data-od-source-row="1">');
    expect(source).toContain('<span data-od-generated="">☐</span>');
  });
});

describe('calibrated against Word’s recorded page breaks', () => {
  it('takes the twips Word wrote beside a line-unit spacing', () => {
    const [para] = blocks(
      docx(
        p(
          r('x'),
          '<w:spacing w:beforeLines="100" w:before="360" w:afterLines="50" w:after="120"/>',
        ),
      ),
    ) as LParagraph[];
    expect(para.css.margin).toMatch(/^24px .* 8px /);
  });

  it('sets a single line by the font’s own metrics', () => {
    const [calibri, times] = blocks(
      docx(
        p(r('a', '<w:rFonts w:ascii="Calibri"/>'), '<w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr>') +
          p(
            r('b', '<w:rFonts w:ascii="Times New Roman"/>'),
            '<w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr>',
          ),
      ),
    ) as LParagraph[];
    expect(calibri.css.lineHeight).toBe(1.22);
    expect(times.css.lineHeight).toBe(1.15);
  });
});

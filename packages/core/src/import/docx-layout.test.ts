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
      docx(p('<w:r><w:sym w:font="Wingdings" w:char="F0A8"/></w:r>' + r('申請'))),
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
          p('<w:bookmarkStart w:id="1" w:name="sec"/>' + r('Target')) +
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

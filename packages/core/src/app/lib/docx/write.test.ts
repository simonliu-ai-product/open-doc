/**
 * The writer is string assembly, so what can go wrong is a file Word refuses
 * to open: an unbalanced tag, a part without its relationship or content type,
 * a footer that bleeds into the next section, a style that is never defined.
 * These read the zip back and check the parts the way Word would find them.
 */

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { DocxModel, Paragraph, RunStyle, Section } from './model';
import { writeDocx } from './write';

const body: RunStyle = {
  fonts: { ascii: 'Inter', eastAsia: 'Noto Sans TC' },
  size: 21,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: '16181D',
};
const heading: RunStyle = { ...body, size: 42, bold: true };

const A4 = {
  width: 11906,
  height: 16838,
  margin: { top: 1140, right: 1140, bottom: 1140, left: 1140 },
  header: 600,
  footer: 600,
};

function para(text: string, extra: Partial<Paragraph> = {}, style = body): Paragraph {
  return {
    type: 'paragraph',
    role: 'body',
    inlines: [{ type: 'text', text, style }],
    props: { spaceBefore: 180, line: 326 },
    ...extra,
  };
}

function section(blocks: Section['blocks'], extra: Partial<Section> = {}): Section {
  return { blocks, page: A4, ...extra };
}

function model(extra: Partial<DocxModel> = {}): DocxModel {
  return {
    title: 'Report',
    sections: [section([para('Hello')])],
    footnotes: [],
    lists: [],
    media: [],
    ...extra,
  };
}

function unzip(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    out[name] = name.startsWith('word/media/') ? '' : strFromU8(data);
  }
  return out;
}

/** Tags balance and nothing between them needs escaping — Word's first check. */
function expectWellFormed(xml: string): void {
  const stack: string[] = [];
  let last = 0;
  for (const match of xml.matchAll(
    /<\?[^?]*\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g,
  )) {
    const between = xml.slice(last, match.index);
    expect(between).not.toMatch(/[<>]|&(?!amp;|lt;|gt;|quot;)/);
    last = (match.index ?? 0) + match[0].length;
    if (match[0].startsWith('<?')) continue;
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) expect(stack.pop()).toBe(name);
    else stack.push(name as string);
  }
  expect(xml.slice(last)).toBe('');
  expect(stack).toEqual([]);
}

describe('writeDocx', () => {
  it('writes a package Word can open: parts, relationships, content types', () => {
    const files = unzip(writeDocx(model()));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/styles.xml',
        'word/settings.xml',
        'word/_rels/document.xml.rels',
        'docProps/core.xml',
        'docProps/app.xml',
      ]),
    );
    for (const [name, xml] of Object.entries(files)) {
      if (name.endsWith('.xml') || name.endsWith('.rels')) expectWellFormed(xml);
    }
    expect(files['[Content_Types].xml']).toContain('PartName="/word/document.xml"');
    expect(files['word/_rels/document.xml.rels']).toContain('Target="styles.xml"');
    expect(files['docProps/core.xml']).toContain('<dc:title>Report</dc:title>');
    // Word opens anything without this in compatibility mode.
    expect(files['word/settings.xml']).toContain('w:name="compatibilityMode"');
  });

  it('turns the most common body text into Normal and writes only departures from it', () => {
    const doc = model({
      sections: [
        section([
          para('Most of the body text looks like this.'),
          para('And so does this paragraph, which is long.'),
          {
            type: 'paragraph',
            role: 'body',
            inlines: [
              { type: 'text', text: 'Plain, then ', style: body },
              { type: 'text', text: 'bold', style: { ...body, bold: true } },
            ],
            props: { spaceBefore: 180, line: 326 },
          },
        ]),
      ],
    });
    const files = unzip(writeDocx(doc));
    const styles = files['word/styles.xml'] ?? '';
    const normal =
      /<w:style w:type="paragraph" w:default="1" w:styleId="Normal">.*?<\/w:style>/.exec(
        styles,
      )?.[0] ?? '';
    expect(normal).toContain('<w:sz w:val="21"/>');
    expect(normal).toContain('w:ascii="Inter"');
    expect(normal).toContain('w:eastAsia="Noto Sans TC"');
    expect(normal).toContain('w:before="180"');
    expect(normal).toContain('w:line="326" w:lineRule="atLeast"');

    const document = files['word/document.xml'] ?? '';
    // Body paragraphs carry no style of their own and no restated formatting.
    expect(document).not.toContain('<w:pStyle w:val="Normal"/>');
    expect(document).not.toContain('<w:sz ');
    expect(document.match(/<w:b\/>/g)).toHaveLength(1);
  });

  it('gives headings the built-in heading styles, so Word’s navigation pane lists them', () => {
    const doc = model({
      sections: [
        section([
          para('Findings', { role: 'heading', level: 1, bookmark: '_od_findings' }, heading),
          para('Body.'),
        ]),
      ],
      headingSizes: [42, 30, 24],
    });
    const files = unzip(writeDocx(doc));
    const styles = files['word/styles.xml'] ?? '';
    expect(styles).toContain('<w:name w:val="heading 1"/>');
    expect(styles).toMatch(/w:styleId="Heading1">.*?<w:outlineLvl w:val="0"\/>/);
    // A level the document never used still exists, sized from the design.
    expect(styles).toMatch(/w:styleId="Heading2">.*?<w:sz w:val="30"\/>/);
    const document = files['word/document.xml'] ?? '';
    expect(document).toContain('<w:pStyle w:val="Heading1"/>');
    expect(document).toContain('<w:bookmarkStart w:id="0" w:name="_od_findings"/>');
  });

  it('ends each section on its last paragraph and sizes the sheet', () => {
    const doc = model({
      sections: [
        section([para('Cover')]),
        section([para('Body')], { page: { ...A4, width: 16838, height: 11906 } }),
      ],
    });
    const document = unzip(writeDocx(doc))['word/document.xml'] ?? '';
    // The first section's properties ride on its last paragraph.
    expect(document).toMatch(
      /<w:p><w:pPr><w:sectPr>(?:(?!<\/w:p>).)*<\/w:sectPr><\/w:pPr><w:r><w:t[^>]*>Cover</,
    );
    expect(document).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
    expect(document).toMatch(/<\/w:p><w:sectPr>.*<\/w:sectPr><\/w:body>/);
    expect(document.match(/<w:sectPr>/g)).toHaveLength(2);
  });

  it('writes a footer with live page fields, and an empty one where a section has none', () => {
    const footer: Paragraph = {
      type: 'paragraph',
      role: 'footer',
      inlines: [
        { type: 'text', text: 'Page ', style: body },
        { type: 'field', instr: 'PAGE', cached: '1', style: body },
        { type: 'text', text: ' of ', style: body },
        { type: 'field', instr: 'NUMPAGES', cached: '9', style: body },
      ],
      props: {},
    };
    const doc = model({
      sections: [section([para('Body')], { footer: [footer] }), section([para('Appendix')])],
    });
    const files = unzip(writeDocx(doc));
    expect(files['word/footer1.xml']).toContain('<w:fldSimple w:instr=" PAGE ">');
    expect(files['word/footer1.xml']).toContain('<w:fldSimple w:instr=" NUMPAGES ">');
    // Word would otherwise carry the first section's footer into the second.
    expect(files['word/footer2.xml']).toContain('<w:p/>');
    const document = files['word/document.xml'] ?? '';
    expect(document.match(/<w:footerReference /g)).toHaveLength(2);
    expect(files['[Content_Types].xml']).toContain('PartName="/word/footer2.xml"');
  });

  it('links a repeated header or footer to the previous section instead of copying it', () => {
    const line = (text: string, role: 'header' | 'footer'): Paragraph => ({
      type: 'paragraph',
      role,
      inlines: [{ type: 'text', text, style: body }],
      props: {},
    });
    const doc = model({
      sections: [
        section([para('Cover')]),
        section([para('One')], {
          header: [line('Running head', 'header')],
          footer: [line('Foot', 'footer')],
        }),
        section([para('Two')], {
          header: [line('Running head', 'header')],
          footer: [line('Foot', 'footer')],
        }),
      ],
    });
    const files = unzip(writeDocx(doc));
    expect(files['word/header2.xml']).toContain('Running head');
    expect(files['word/header3.xml']).toBeUndefined();
    const document = files['word/document.xml'] ?? '';
    // Cover: explicitly empty. First body section: its own. Second: inherits.
    expect(document.match(/<w:headerReference /g)).toHaveLength(2);
    expect(document.match(/<w:footerReference /g)).toHaveLength(2);
    expect(files['word/styles.xml']).toContain('<w:name w:val="header"/>');
  });

  it('declares every face with a stand-in, so a missing font keeps its kind', () => {
    const doc = model({
      fonts: [
        { name: 'Inter', kind: 'sans', eastAsia: false },
        { name: 'Noto Serif TC', kind: 'serif', eastAsia: true },
      ],
    });
    const files = unzip(writeDocx(doc));
    const table = files['word/fontTable.xml'] ?? '';
    expect(table).toContain('<w:font w:name="Inter"><w:altName w:val="Arial"/>');
    expect(table).toContain(
      '<w:altName w:val="PMingLiU"/><w:charset w:val="88"/><w:family w:val="roman"/>',
    );
    expect(files['word/_rels/document.xml.rels']).toContain('Target="fontTable.xml"');
  });

  it('writes footnotes as Word footnotes, with the separators Word expects', () => {
    const doc = model({
      sections: [
        section([
          {
            type: 'paragraph',
            role: 'body',
            inlines: [
              { type: 'text', text: 'A claim', style: body },
              {
                type: 'footnote',
                id: 1,
                style: { ...body, color: '2563EB', vertAlign: 'superscript' },
              },
            ],
            props: {},
          },
        ]),
      ],
      footnotes: [{ id: 1, blocks: [para('The source.', { role: 'footnote' })] }],
    });
    const files = unzip(writeDocx(doc));
    expect(files['word/document.xml']).toContain('<w:footnoteReference w:id="1"/>');
    const notes = files['word/footnotes.xml'] ?? '';
    expect(notes).toContain('w:type="separator" w:id="-1"');
    expect(notes).toContain('w:type="continuationSeparator" w:id="0"');
    expect(notes).toMatch(/<w:footnote w:id="1">.*<w:footnoteRef\/>.*The source\./);
    expect(files['word/settings.xml']).toContain('<w:footnotePr>');
    expect(files['word/styles.xml']).toMatch(/w:styleId="FootnoteReference">.*w:val="2563EB"/);
  });

  it('numbers each list from its own start', () => {
    const doc = model({
      sections: [
        section([
          para('one', { role: 'list', list: { num: 1, level: 0 } }),
          para('two', { role: 'list', list: { num: 2, level: 0 } }),
        ]),
      ],
      lists: [
        { id: 1, kind: 'decimal', level: 0, start: 1 },
        { id: 2, kind: 'disc', level: 0, start: 1 },
      ],
    });
    const files = unzip(writeDocx(doc));
    const numbering = files['word/numbering.xml'] ?? '';
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>');
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(numbering).toMatch(/<w:num w:numId="1">.*?<w:startOverride w:val="1"\/>/);
    expect(files['word/document.xml']).toContain(
      '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>',
    );
    expect(files['word/_rels/document.xml.rels']).toContain('Target="numbering.xml"');
  });

  it('writes tables with spans, merged rows, a repeating header, and a paragraph between tables', () => {
    const cell = (text: string, extra = {}) => ({
      blocks: [para(text)],
      span: 1,
      width: 3000,
      borders: {},
      margins: { top: 60, left: 120, bottom: 60, right: 120 },
      ...extra,
    });
    const table = {
      type: 'table' as const,
      columns: [3000, 3000],
      rows: [
        { header: true, cells: [cell('Head', { span: 2, width: 6000 })] },
        { header: false, cells: [cell('A', { merge: 'restart' as const }), cell('B')] },
        { header: false, cells: [cell('', { merge: 'continue' as const, blocks: [] }), cell('C')] },
      ],
    };
    const doc = model({ sections: [section([table, table])] });
    const document = unzip(writeDocx(doc))['word/document.xml'] ?? '';
    expect(document).toContain('<w:gridCol w:w="3000"/>');
    expect(document).toContain('<w:gridSpan w:val="2"/>');
    expect(document).toContain('<w:vMerge w:val="restart"/>');
    expect(document).toContain('<w:vMerge/>');
    expect(document).toContain('<w:trPr><w:tblHeader/></w:trPr>');
    // An empty merged cell still ends in a paragraph.
    expect(document).toMatch(/<w:vMerge\/>.*?<\/w:tcPr><w:p\/><\/w:tc>/);
    expect(document).toContain('</w:tbl><w:p/><w:tbl>');
  });

  it('embeds pictures with a relationship and a content type', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    const doc = model({
      sections: [
        section([
          {
            type: 'paragraph',
            role: 'body',
            inlines: [
              { type: 'image', image: { media: 0, width: 952500, height: 476250, alt: 'Chart' } },
            ],
            props: {},
          },
        ]),
      ],
      media: [{ name: 'image1.png', contentType: 'image/png', bytes: png }],
    });
    const zipped = unzipSync(writeDocx(doc));
    expect(zipped['word/media/image1.png']).toEqual(png);
    const files = unzip(writeDocx(doc));
    expect(files['[Content_Types].xml']).toContain(
      '<Default Extension="png" ContentType="image/png"/>',
    );
    expect(files['word/_rels/document.xml.rels']).toContain('Target="media/image1.png"');
    expect(files['word/document.xml']).toContain('<wp:extent cx="952500" cy="476250"/>');
    expect(files['word/document.xml']).toContain('descr="Chart"');
  });

  it('links out through a relationship and in through a bookmark', () => {
    const doc = model({
      sections: [
        section([
          {
            type: 'paragraph',
            role: 'body',
            inlines: [
              {
                type: 'text',
                text: 'site',
                style: body,
                link: { url: 'https://example.com/?a=1&b=2' },
              },
              { type: 'text', text: ' and ', style: body },
              { type: 'text', text: 'Figure 2', style: body, link: { anchor: '_od_fig' } },
            ],
            props: {},
          },
        ]),
      ],
    });
    const files = unzip(writeDocx(doc));
    expect(files['word/_rels/document.xml.rels']).toContain(
      'Target="https://example.com/?a=1&amp;b=2" TargetMode="External"',
    );
    expect(files['word/document.xml']).toContain('<w:hyperlink w:anchor="_od_fig" w:history="1">');
  });

  it('escapes text and drops characters XML cannot carry', () => {
    const files = unzip(writeDocx(model({ sections: [section([para('a < b & c\u0007')])] })));
    expect(files['word/document.xml']).toContain('a &lt; b &amp; c</w:t>');
  });

  it('wraps the contents in a TOC field Word rebuilds on update', () => {
    const entry = (text: string, extra: Partial<Paragraph>) =>
      para(text, { role: 'toc', level: 1, ...extra });
    const doc = model({
      sections: [
        section([
          entry('Method', { field: { begin: 'TOC \\o "1-2" \\h \\z \\u' } }),
          entry('Findings', { field: { end: true } }),
        ]),
      ],
    });
    const document = unzip(writeDocx(doc))['word/document.xml'] ?? '';
    expect(document).toMatch(
      /<w:fldChar w:fldCharType="begin" w:dirty="true"\/>.*TOC \\o "1-2" \\h \\z \\u .*<w:fldChar w:fldCharType="separate"\/>.*Method.*Findings.*<w:fldChar w:fldCharType="end"\/>/,
    );
    expect(unzip(writeDocx(doc))['word/styles.xml']).toContain('<w:name w:val="toc 1"/>');
  });

  it('keeps headings with what follows through their style, not cancelling it per paragraph', () => {
    const keep = { keepNext: true };
    const doc = model({
      sections: [
        section([
          para('Findings', { role: 'heading', level: 1, props: keep }, heading),
          para('Body.'),
          para('Method', { role: 'heading', level: 1, props: keep }, heading),
          para('More.'),
        ]),
      ],
    });
    const files = unzip(writeDocx(doc));
    expect(files['word/styles.xml']).toMatch(/w:styleId="Heading1">.*?<w:keepNext\/>/);
    expect(files['word/document.xml']).not.toContain('<w:keepNext w:val="0"/>');
  });

  it('starts a page where the document asked for one, and sets right-to-left text as such', () => {
    const doc = model({
      sections: [
        section([
          para('One'),
          para('Two', { props: { pageBreakBefore: true } }),
          para('שלום', { props: { bidi: true } }),
        ]),
      ],
    });
    const document = unzip(writeDocx(doc))['word/document.xml'] ?? '';
    expect(document).toMatch(/<w:pPr><w:pageBreakBefore\/>(?:(?!<\/w:p>).)*>Two</);
    expect(document).toMatch(/<w:pPr><w:bidi\/>(?:(?!<\/w:p>).)*>שלום</);
  });

  it('writes a list item flush with the text as flush, not at the numbering level’s indent', () => {
    const doc = model({
      sections: [
        section([
          para('one', {
            role: 'list',
            list: { num: 1, level: 0 },
            props: { indentLeft: 0, firstLine: 0 },
          }),
        ]),
      ],
      lists: [{ id: 1, kind: 'disc', level: 0, start: 1 }],
    });
    expect(unzip(writeDocx(doc))['word/document.xml']).toContain(
      '<w:ind w:left="0" w:firstLine="0"/>',
    );
  });

  it('gives a section a first-page footer when its opening page shows another, or none', () => {
    const line = (text: string): Paragraph => ({
      type: 'paragraph',
      role: 'footer',
      inlines: [{ type: 'text', text, style: body }],
      props: {},
    });
    const doc = model({
      sections: [section([para('Body')], { footer: [line('Page')], footerFirst: [] })],
    });
    const files = unzip(writeDocx(doc));
    const document = files['word/document.xml'] ?? '';
    expect(document).toMatch(/<w:footerReference w:type="first" r:id="rId\d+"\/>/);
    expect(document).toMatch(/<w:cols [^>]*\/><w:titlePg\/><w:docGrid /);
    expect(files['word/footer1.xml']).toContain('>Page<');
    expect(files['word/footer2.xml']).toContain('<w:p/>');
  });

  it('shows the page colour, which Word hides unless the settings ask for it', () => {
    const files = unzip(writeDocx(model({ background: '101216' })));
    expect(files['word/document.xml']).toContain('<w:background w:color="101216"/>');
    expect(files['word/settings.xml']).toContain(
      '<w:zoom w:percent="100"/><w:displayBackgroundShape/><w:defaultTabStop',
    );
    expect(unzip(writeDocx(model()))['word/settings.xml']).not.toContain('displayBackgroundShape');
  });

  it('marks CJK runs so Word sets their punctuation in the East Asian face', () => {
    const doc = model({
      sections: [section([para('「引號」與標點'), para('Latin text only, and more of it')])],
      fonts: [{ name: 'Noto Sans TC', kind: 'sans', eastAsia: true }],
    });
    const files = unzip(writeDocx(doc));
    expect(files['word/document.xml']).toContain('<w:rFonts w:hint="eastAsia"/>');
    expect(files['word/styles.xml']).toContain('<w:lang w:val="en-US" w:eastAsia="zh-TW"/>');
  });
});

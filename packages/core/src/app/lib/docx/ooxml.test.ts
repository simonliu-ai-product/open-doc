import { describe, expect, it } from 'vitest';
import { buildDocxParts, type DocxModel, escapeXml, fontsFor, hexColor } from './ooxml.ts';

describe('fontsFor', () => {
  it('skips system aliases for the first real family', () => {
    expect(
      fontsFor('-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif', 'sans'),
    ).toEqual({ ascii: 'Inter', eastAsia: 'Inter', kind: 'sans' });
  });

  it('keeps a CJK family in the stack as the East Asian font', () => {
    expect(fontsFor('"Noto Sans TC", "Helvetica Neue", sans-serif', 'sans')).toEqual({
      ascii: 'Helvetica Neue',
      eastAsia: 'Noto Sans TC',
      kind: 'sans',
    });
    expect(fontsFor('Georgia, "PingFang TC", serif', 'serif')).toEqual({
      ascii: 'Georgia',
      eastAsia: 'PingFang TC',
      kind: 'serif',
    });
  });

  it('falls back by generic family when nothing is named', () => {
    expect(fontsFor('system-ui, sans-serif', 'sans').ascii).toBe('Arial');
    expect(fontsFor('serif', 'sans').ascii).toBe('Times New Roman');
    expect(fontsFor('ui-monospace, monospace', 'sans').ascii).toBe('Courier New');
  });
});

describe('hexColor', () => {
  it('reads computed colours and hex alike', () => {
    expect(hexColor('rgb(22, 24, 29)')).toBe('16181d');
    expect(hexColor('rgba(37, 99, 235, 1)')).toBe('2563eb');
    expect(hexColor('#2563EB')).toBe('2563eb');
    expect(hexColor('#abc')).toBe('aabbcc');
    expect(hexColor('rgba(0, 0, 0, 0)')).toBeNull();
  });
});

describe('escapeXml', () => {
  it('escapes markup and drops characters XML cannot hold', () => {
    expect(escapeXml('a < b & "c"\u0001')).toBe('a &lt; b &amp; &quot;c&quot;');
  });
});

const MODEL: DocxModel = {
  title: 'Report & review',
  page: { width: 794 * 15, height: 1123 * 15, landscape: false, margin: 76 * 15 },
  fonts: {
    body: { ascii: 'Inter', eastAsia: 'Noto Sans TC', kind: 'sans' },
    heading: { ascii: 'Inter', eastAsia: 'Noto Sans TC', kind: 'sans' },
    mono: { ascii: 'JetBrains Mono', eastAsia: 'JetBrains Mono', kind: 'mono' },
  },
  sizes: { title: 66, h1: 42, h2: 30, h3: 24, body: 21, caption: 15 },
  colors: { text: '16181d', muted: '6b7280', accent: '2563eb' },
  line: 325,
  blocks: [
    { type: 'paragraph', style: 'Heading1', inlines: [{ type: 'text', text: '1. Method' }] },
    { type: 'toc', entries: [{ text: '1. Method', level: 1 }] },
    {
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'See ' },
        { type: 'link', href: 'https://example.com', runs: [{ type: 'text', text: 'the guide' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'code', mono: true },
        { type: 'footnote', id: 1 },
        { type: 'break' },
        { type: 'image', image: 'figure-1' },
      ],
    },
    {
      type: 'table',
      columns: [3000, 2000],
      rows: [
        {
          header: true,
          cells: [
            { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Service' }] }] },
            { blocks: [] },
          ],
        },
      ],
    },
    { type: 'paragraph', inlines: [], pageBreakBefore: true, spacingBefore: 0, lineExact: 6000 },
  ],
  footnotes: [
    { id: 1, paragraphs: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'A source.' }] }] },
  ],
  footer: {
    type: 'paragraph',
    rightTab: 9000,
    inlines: [
      { type: 'text', text: 'Report' },
      { type: 'tab' },
      { type: 'field', instr: 'PAGE', cached: '1' },
    ],
  },
  images: [{ name: 'figure-1', ext: 'png', bytes: new Uint8Array([1, 2]), width: 100, height: 50 }],
  lists: ['bullet', 'decimal'],
};

describe('buildDocxParts', () => {
  const parts = buildDocxParts(MODEL);
  const text = (name: string) => parts[name] as string;

  it('writes every part a package needs, and the media', () => {
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/fontTable.xml',
      'word/footer1.xml',
      'word/footnotes.xml',
      'word/media/figure-1.png',
      'word/numbering.xml',
      'word/settings.xml',
      'word/styles.xml',
    ]);
    expect(text('[Content_Types].xml')).toContain(
      '<Default Extension="png" ContentType="image/png"/>',
    );
    expect(text('docProps/core.xml')).toContain('<dc:title>Report &amp; review</dc:title>');
  });

  it('sets the page from the geometry and hangs the footer on the section', () => {
    const doc = text('word/document.xml');
    expect(doc).toContain('<w:pgSz w:w="11910" w:h="16845"/>');
    expect(doc).toContain('<w:pgMar w:top="1140"');
    expect(doc).toMatch(/<w:footerReference w:type="default" r:id="rId\d+"\/>/);
    expect(text('word/footer1.xml')).toContain('<w:fldSimple w:instr=" PAGE ">');
    expect(text('word/footer1.xml')).toContain('<w:tab w:val="right" w:pos="9000"/>');
  });

  it('names a stand-in of the same kind for every font', () => {
    const fonts = text('word/fontTable.xml');
    expect(fonts).toContain(
      '<w:font w:name="JetBrains Mono"><w:altName w:val="Courier New"/><w:family w:val="modern"/><w:pitch w:val="fixed"/></w:font>',
    );
    expect(fonts).toContain('<w:font w:name="Noto Sans TC"><w:altName w:val="Arial"/>');
    expect(text('word/_rels/document.xml.rels')).toContain('Target="fontTable.xml"');
    expect(text('[Content_Types].xml')).toContain('/word/fontTable.xml');
  });

  it('keeps the running header and footer off sections that end without them', () => {
    const sectioned = buildDocxParts({
      ...MODEL,
      header: {
        type: 'paragraph',
        inlines: [
          { type: 'text', text: 'Running head · ' },
          { type: 'field', instr: 'PAGE', cached: '1' },
        ],
      },
      blocks: [
        {
          type: 'paragraph',
          inlines: [{ type: 'text', text: 'Cover' }],
          sectionEnd: { running: false },
        },
        { type: 'paragraph', inlines: [{ type: 'text', text: 'Body' }] },
      ],
    });
    const doc = sectioned['word/document.xml'] as string;
    const rels = sectioned['word/_rels/document.xml.rels'] as string;
    const id = (target: string) =>
      rels.match(new RegExp(`Id="(rId\\d+)"[^>]*Target="${target}"`))?.[1];
    const refs = (header?: string, footer?: string) =>
      `<w:sectPr><w:headerReference w:type="default" r:id="${header}"/><w:footerReference w:type="default" r:id="${footer}"/>`;
    // The paragraph that ends a section holds its properties, ahead of its text.
    expect(doc).toContain(`${refs(id('header2.xml'), id('footer2.xml'))}`);
    expect(doc.indexOf(refs(id('header2.xml'), id('footer2.xml')))).toBeLessThan(
      doc.indexOf('Cover'),
    );
    expect(doc).toMatch(new RegExp(`Body.*${refs(id('header1.xml'), id('footer1.xml'))}`));
    expect(sectioned['word/header1.xml']).toContain('<w:hdr');
    expect(sectioned['word/header1.xml']).toContain('<w:pStyle w:val="Header"/>');
    expect(sectioned['word/header1.xml']).toContain('<w:fldSimple w:instr=" PAGE ">');
    expect(sectioned['word/header2.xml']).toContain('<w:hdr');
    expect(sectioned['word/footer2.xml']).toContain('<w:ftr');
    expect(sectioned['[Content_Types].xml']).toContain(
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
    );
    expect(parts['word/footer2.xml']).toBeUndefined();
    expect(parts['word/header1.xml']).toBeUndefined();
  });

  it('shades a cell and keeps code out of the spelling check', () => {
    const boxed = buildDocxParts({
      ...MODEL,
      blocks: [
        {
          type: 'table',
          columns: [9000],
          rows: [
            {
              header: false,
              cells: [
                {
                  blocks: [
                    { type: 'paragraph', inlines: [{ type: 'text', text: 'docs/', mono: true }] },
                  ],
                  fill: 'f5f5f7',
                  padding: { top: 240, left: 300, bottom: 240, right: 300 },
                },
              ],
            },
          ],
        },
      ],
    });
    const doc = boxed['word/document.xml'] as string;
    expect(doc).toContain(
      '</w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="f5f5f7"/><w:tcMar>',
    );
    expect(doc).toMatch(/<w:noProof\/>(?:(?!<\/w:r>).)*?docs\//);
  });

  it('bookmarks a caption and points a dotted page reference at it', () => {
    const listed = buildDocxParts({
      ...MODEL,
      blocks: [
        {
          type: 'paragraph',
          rightTab: 9630,
          leader: true,
          inlines: [
            { type: 'text', text: 'Table 1 Usage' },
            { type: 'tab' },
            { type: 'field', instr: 'PAGEREF od_t_usage \\h', cached: '4' },
          ],
        },
        {
          type: 'paragraph',
          style: 'Caption',
          bookmark: 'od_t_usage',
          inlines: [{ type: 'text', text: 'Usage' }],
        },
      ],
    });
    const doc = listed['word/document.xml'] as string;
    expect(doc).toContain('<w:tab w:val="right" w:leader="dot" w:pos="9630"/>');
    expect(doc).toContain('<w:fldSimple w:instr=" PAGEREF od_t_usage \\h ">');
    expect(doc).toMatch(
      /<w:bookmarkStart w:id="0" w:name="od_t_usage"\/>.*?Usage.*?<w:bookmarkEnd w:id="0"\/>/,
    );
  });

  it('holds a gap open with an exact line height where space before would be dropped', () => {
    expect(text('word/document.xml')).toContain(
      '<w:pageBreakBefore/><w:spacing w:before="0" w:line="6000" w:lineRule="exact"/>',
    );
  });

  it('keeps the page’s line height and leads contents entries to a right tab', () => {
    const styles = text('word/styles.xml');
    expect(styles).toContain('<w:spacing w:after="160" w:line="325" w:lineRule="atLeast"/>');
    // Text block: the sheet less both margins.
    expect(styles).toContain('<w:tab w:val="right" w:leader="dot" w:pos="9630"/>');
  });

  it('writes headings as styles Word navigates by, with East Asian fonts', () => {
    const styles = text('word/styles.xml');
    expect(styles).toContain('w:styleId="Heading1"');
    expect(styles).toContain('<w:outlineLvl w:val="0"/>');
    expect(styles).toContain('w:eastAsia="Noto Sans TC"');
    expect(text('word/document.xml')).toContain('<w:pStyle w:val="Heading1"/>');
  });

  it('links externally, marks code in the mono font, and references the note', () => {
    const doc = text('word/document.xml');
    const rels = text('word/_rels/document.xml.rels');
    expect(rels).toContain('Target="https://example.com" TargetMode="External"');
    expect(doc).toMatch(
      /<w:hyperlink r:id="rId\d+"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr>/,
    );
    expect(doc).toContain('w:ascii="JetBrains Mono"');
    expect(doc).toContain('<w:footnoteReference w:id="1"/>');
    expect(text('word/footnotes.xml')).toContain('<w:footnoteRef/>');
    expect(text('word/footnotes.xml')).toContain('A source.');
  });

  it('embeds the image through a relationship', () => {
    const doc = text('word/document.xml');
    const rels = text('word/_rels/document.xml.rels');
    expect(rels).toContain('Target="media/figure-1.png"');
    expect(doc).toContain('<wp:extent cx="100" cy="50"/>');
  });

  it('writes a contents field Word updates, and marks table headers to repeat', () => {
    const doc = text('word/document.xml');
    expect(doc).toContain(
      '<w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText>',
    );
    const settings = text('word/settings.xml');
    expect(settings).toContain('<w:updateFields w:val="true"/>');
    // Schema order: Word rejects the part when these are swapped.
    expect(settings.indexOf('characterSpacingControl')).toBeLessThan(
      settings.indexOf('updateFields'),
    );
    expect(settings.indexOf('updateFields')).toBeLessThan(settings.indexOf('footnotePr'));
    expect(doc).toContain('<w:tblHeader/>');
    // An empty cell still ends in a paragraph, or Word calls the file corrupt.
    expect(doc).toContain('</w:tcPr><w:p/></w:tc>');
  });

  it('gives each ordered list its own count', () => {
    const numbering = text('word/numbering.xml');
    expect(numbering).toContain('<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
    expect(numbering).toContain('<w:num w:numId="2"><w:abstractNumId w:val="1"/><w:lvlOverride');
  });
});

import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown.ts';
import { collectImageSources, generateDocumentSource, type ImportImage } from './to-tsx.ts';

const CREATED_AT = '2026-08-19T00:00:00.000Z';

function generate(markdown: string, opts: Record<string, unknown> = {}) {
  return generateDocumentSource(parseMarkdown(markdown), {
    docId: 'sample',
    createdAt: CREATED_AT,
    ...opts,
  });
}

describe('generateDocumentSource', () => {
  it('emits a module the framework can load', () => {
    const { source } = generate('# Report\n\nBody copy.\n');
    expect(source).toContain("from '@open-document/core'");
    expect(source).toContain('export const design: DesignSystem');
    expect(source).toContain('export const meta: DocMeta');
    expect(source).toContain(`createdAt: '${CREATED_AT}'`);
    expect(source).toContain('export default [Cover, Body] satisfies DocEntry[];');
  });

  it('takes the title from the first h1 and does not repeat it in the body', () => {
    const { source, title } = generate('# Q3 Review\n\nBody.\n');
    expect(title).toBe('Q3 Review');
    expect(source.match(/Q3 Review/g)?.length).toBeGreaterThan(0);
    // The cover carries it; the flow body starts at the prose.
    const body = source.slice(source.indexOf('const Body'), source.indexOf('export const meta'));
    expect(body).not.toContain('Q3 Review');
  });

  it('keeps the heading when there is no cover to carry it', () => {
    const { source } = generate('# Q3 Review\n\nBody.\n', { cover: false });
    const body = source.slice(source.indexOf('const Body'));
    expect(body).toContain('<h1 style={h1}>Q3 Review</h1>');
  });

  it('escapes JSX-significant characters in prose', () => {
    const { source } = generate('Use {braces} and <angles> here.\n');
    expect(source).toContain("{'{'}braces{'}'}");
    expect(source).toContain("{'<'}angles{'>'}");
  });

  it('writes real heading tags so the outline picks them up', () => {
    const { source } = generate('## Findings\n\n### Detail\n', { cover: false });
    expect(source).toContain('<h2 style={h2}>Findings</h2>');
    expect(source).toContain('<h3 style={h3}>Detail</h3>');
  });

  it('renders a table through the Th/Td helpers with alignment', () => {
    const { source } = generate('| Service | p99 |\n| --- | ---: |\n| api | 412 |\n');
    expect(source).toContain('<Th>Service</Th>');
    expect(source).toContain("<Td align={'right'}>412</Td>");
  });

  it('adds a contents page only when asked', () => {
    expect(generate('# T\n\nx\n').source).not.toContain('TableOfContents');
    const withContents = generate('# T\n\nx\n', { contents: true }).source;
    expect(withContents).toContain('<TableOfContents maxLevel={2} />');
    expect(withContents).toContain('export default [Cover, Contents, Body]');
  });

  it('imports local images and leaves remote ones as URLs', () => {
    const images = new Map<string, ImportImage>([
      ['./img/topo.png', { source: './img/topo.png', ident: 'figure1', filename: 'topo.png' }],
    ]);
    const { source } = generate(
      '![Topology](./img/topo.png)\n\n![Remote](https://example.com/x.png)\n',
      { images },
    );
    expect(source).toContain("import figure1 from './assets/topo.png';");
    expect(source).toContain('<img src={figure1}');
    expect(source).toContain('<img src="https://example.com/x.png"');
  });

  it('keeps code fences intact as a string literal', () => {
    const { source } = generate('```\nline one\nline two\n```\n');
    expect(source).toContain("<pre style={pre}>{'line one\\nline two'}</pre>");
  });
});

describe('collectImageSources', () => {
  it('finds images in figures, prose, lists, and tables', () => {
    const { blocks } = parseMarkdown(
      '![a](a.png)\n\nText ![b](b.png) more\n\n- item ![c](c.png)\n\n| h |\n| --- |\n| ![d](d.png) |\n',
    );
    expect(collectImageSources(blocks).sort()).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);
  });
});

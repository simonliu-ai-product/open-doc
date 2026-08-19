import { describe, expect, it } from 'vitest';
import { inlineText, parseInline, parseMarkdown } from './markdown.ts';

describe('parseMarkdown', () => {
  it('reads frontmatter and leaves the body alone', () => {
    const { frontmatter, blocks } = parseMarkdown(
      '---\ntitle: Q3 Review\nauthor: "Platform"\n---\n\n# Hello\n',
    );
    expect(frontmatter).toEqual({ title: 'Q3 Review', author: 'Platform' });
    expect(blocks).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'Hello' }] },
    ]);
  });

  it('splits paragraphs on blank lines', () => {
    const { blocks } = parseMarkdown('One line\nstill one.\n\nSecond.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('reads setext headings', () => {
    const { blocks } = parseMarkdown('Title\n=====\n\nSub\n---\n');
    expect(blocks.map((b) => b.type === 'heading' && b.level)).toEqual([1, 2]);
  });

  it('keeps a fenced block verbatim, markdown syntax included', () => {
    const { blocks } = parseMarkdown('```ts\nconst a = **1**;\n# not a heading\n```\n');
    expect(blocks[0]).toEqual({
      type: 'code',
      lang: 'ts',
      value: 'const a = **1**;\n# not a heading',
    });
  });

  it('parses a GFM table with alignments', () => {
    const { blocks } = parseMarkdown('| Service | p99 |\n| --- | ---: |\n| api | 412 ms |\n');
    const table = blocks[0];
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.align).toEqual([null, 'right']);
    expect(inlineText(table.head[0])).toBe('Service');
    expect(inlineText(table.rows[0][1])).toBe('412 ms');
  });

  it('nests a list inside its parent item', () => {
    const { blocks } = parseMarkdown('- outer\n  - inner\n- second\n');
    const list = blocks[0];
    expect(list.type).toBe('list');
    if (list.type !== 'list') return;
    expect(list.items).toHaveLength(2);
    expect(list.items[0].some((child) => child.type === 'list')).toBe(true);
  });

  it('numbers an ordered list from its first marker', () => {
    const { blocks } = parseMarkdown('3. third\n4. fourth\n');
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: true, start: 3 });
  });

  it('treats a lone image as a figure', () => {
    const { blocks } = parseMarkdown('![Topology](./img/topo.png)\n');
    expect(blocks[0]).toEqual({ type: 'figure', alt: 'Topology', src: './img/topo.png' });
  });

  it('collects a blockquote as nested blocks', () => {
    const { blocks } = parseMarkdown('> quoted line\n> ## inside\n');
    const quote = blocks[0];
    expect(quote.type).toBe('quote');
    if (quote.type !== 'quote') return;
    expect(quote.children.map((child) => child.type)).toEqual(['paragraph', 'heading']);
  });

  it('never drops a line it does not understand', () => {
    const { blocks } = parseMarkdown('<div class="x">raw html</div>\n');
    const paragraph = blocks[0];
    expect(paragraph.type).toBe('paragraph');
    if (paragraph.type !== 'paragraph') return;
    expect(inlineText(paragraph.children)).toContain('raw html');
  });
});

describe('parseInline', () => {
  it('reads emphasis, code, links, and images', () => {
    expect(parseInline('**bold** and *em* and `code`')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
      { type: 'text', value: ' and ' },
      { type: 'em', children: [{ type: 'text', value: 'em' }] },
      { type: 'text', value: ' and ' },
      { type: 'code', value: 'code' },
    ]);
    expect(parseInline('[docs](https://example.com)')).toEqual([
      { type: 'link', href: 'https://example.com', children: [{ type: 'text', value: 'docs' }] },
    ]);
    expect(parseInline('![alt](a.png)')).toEqual([{ type: 'image', alt: 'alt', src: 'a.png' }]);
  });

  it('honours backslash escapes', () => {
    expect(parseInline('not \\*emphasis\\*')).toEqual([{ type: 'text', value: 'not *emphasis*' }]);
  });

  it('autolinks a bare URL', () => {
    expect(parseInline('see https://example.com now')[1]).toMatchObject({
      type: 'link',
      href: 'https://example.com',
    });
  });

  it('flattens to plain text for titles', () => {
    expect(inlineText(parseInline('**Q3** `metrics` [report](x)'))).toBe('Q3 metrics report');
  });
});

/**
 * A small CommonMark-ish parser, deliberately hand-written: `core` ships to
 * every user, and a full markdown stack is a lot of install size for a feature
 * that only has to cover what people actually paste into a report — headings,
 * prose, lists, tables, code, quotes, images.
 *
 * Anything it does not understand survives as paragraph text rather than being
 * dropped, so an import never silently loses a line.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'break' };

export type TableAlign = 'left' | 'center' | 'right' | null;

export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'code'; lang: string | null; value: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][]; align: TableAlign[] }
  | { type: 'figure'; src: string; alt: string }
  | { type: 'hr' };

export type ParsedMarkdown = {
  frontmatter: Record<string, string>;
  blocks: Block[];
};

const FENCE_RE = /^(```|~~~)\s*([^\s`]*)\s*$/;
const ATX_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^ {0,3}> ?(.*)$/;
const UL_RE = /^(\s*)([-*+])\s+(.*)$/;
const OL_RE = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const SETEXT_RE = /^ {0,3}(=+|-+)\s*$/;
const TABLE_DELIM_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitLines(source: string): string[] {
  return source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
}

function parseFrontmatter(lines: string[]): {
  frontmatter: Record<string, string>;
  rest: string[];
} {
  if (lines[0]?.trim() !== '---') return { frontmatter: {}, rest: lines };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) return { frontmatter: {}, rest: lines };

  const frontmatter: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { frontmatter, rest: lines.slice(end + 1) };
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseAlign(line: string): TableAlign[] {
  return splitRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlockStart(line: string): boolean {
  return (
    ATX_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    FENCE_RE.test(line)
  );
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const { frontmatter, rest } = parseFrontmatter(splitLines(source));
  return { frontmatter, blocks: parseBlocks(rest) };
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1];
      const value: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        value.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'code', lang: fence[2] || null, value: value.join('\n') });
      continue;
    }

    const atx = line.match(ATX_RE);
    if (atx) {
      blocks.push({
        type: 'heading',
        level: atx[1].length,
        children: parseInline(atx[2]),
      });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && (QUOTE_RE.test(lines[i]) || lines[i].trim() !== '')) {
        const match = lines[i].match(QUOTE_RE);
        if (!match && lines[i].trim() === '') break;
        inner.push(match ? match[1] : lines[i]);
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner) });
      continue;
    }

    if (UL_RE.test(line) || OL_RE.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    if (line.includes('|') && lines[i + 1] !== undefined && TABLE_DELIM_RE.test(lines[i + 1])) {
      const head = splitRow(line).map(parseInline);
      const align = parseAlign(lines[i + 1]);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', head, rows, align });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      const next = lines[i + 1];
      // A setext underline turns the paragraph collected so far into a heading.
      // Inside a paragraph a run of dashes is an underline, never a rule — a
      // real rule is preceded by a blank line and never reaches this branch.
      if (next !== undefined && SETEXT_RE.test(next)) {
        paragraph.push(lines[i]);
        i += 2;
        blocks.push({
          type: 'heading',
          level: next.trim().startsWith('=') ? 1 : 2,
          children: parseInline(paragraph.join(' ')),
        });
        paragraph.length = 0;
        break;
      }
      if (paragraph.length > 0 && isBlockStart(lines[i])) break;
      paragraph.push(lines[i]);
      i++;
    }

    if (paragraph.length > 0) {
      const text = paragraph.join('\n');
      const figure = asStandaloneImage(text);
      blocks.push(figure ?? { type: 'paragraph', children: parseInline(text) });
    }
  }

  return blocks;
}

/** An image alone in its paragraph is a figure, not a run of inline content. */
function asStandaloneImage(text: string): Block | null {
  const match = text.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
  if (!match) return null;
  return { type: 'figure', alt: match[1], src: match[2] };
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = lines[start];
  const ordered = OL_RE.test(first);
  const startNumber = ordered ? Number(first.match(OL_RE)?.[2] ?? 1) : 1;
  const baseIndent = indentOf(first);
  const items: Block[][] = [];

  let i = start;
  let current: string[] | null = null;

  const flush = () => {
    if (current) items.push(parseBlocks(current));
    current = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      // A blank line inside a list only ends it if the next line leaves the list.
      const next = lines[i + 1];
      if (
        next === undefined ||
        (next.trim() !== '' && indentOf(next) <= baseIndent && !isItem(next))
      ) {
        break;
      }
      current?.push('');
      i++;
      continue;
    }

    const match = line.match(ordered ? OL_RE : UL_RE) ?? line.match(ordered ? UL_RE : OL_RE);
    if (match && indentOf(line) <= baseIndent) {
      flush();
      current = [match[3]];
      i++;
      continue;
    }

    if (indentOf(line) > baseIndent && current) {
      // Continuation and nested items keep their relative indent so the
      // recursive pass can see the nesting.
      current.push(line.slice(Math.min(indentOf(line), baseIndent + 2)));
      i++;
      continue;
    }

    break;
  }

  flush();
  return { block: { type: 'list', ordered, start: startNumber, items }, next: i };

  function isItem(line: string): boolean {
    return UL_RE.test(line) || OL_RE.test(line);
  }
}

const INLINE_RE =
  /(!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))|(\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\))|(`+)([^`]*?)\3|(\*\*|__)(?=\S)([\s\S]*?\S)\5|(\*|_)(?=\S)([\s\S]*?\S)\7|(<[^>\s]+@[^>\s]+>)|(https?:\/\/[^\s<>"')\]]+)/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = maskEscapes(source);

  const pushText = (value: string) => {
    if (value === '') return;
    const parts = value.split(/(?: {2}|\\)\n|\n/);
    parts.forEach((part, index) => {
      if (index > 0) out.push({ type: 'break' });
      const text = unmask(part);
      if (text !== '') out.push({ type: 'text', value: text });
    });
  };

  while (rest.length > 0) {
    const match = rest.match(INLINE_RE);
    if (!match || match.index === undefined) break;

    pushText(rest.slice(0, match.index));
    const token = match[0];

    if (match[1]) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
      if (image) out.push({ type: 'image', alt: unmask(image[1]), src: unmask(image[2]) });
    } else if (match[2]) {
      const link = token.match(/^\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)$/);
      if (link) out.push({ type: 'link', href: unmask(link[2]), children: parseInline(link[1]) });
    } else if (match[3]) {
      out.push({ type: 'code', value: unmask(match[4].trim()) });
    } else if (match[5]) {
      out.push({ type: 'strong', children: parseInline(match[6]) });
    } else if (match[7]) {
      out.push({ type: 'em', children: parseInline(match[8]) });
    } else if (match[9]) {
      const address = token.slice(1, -1);
      out.push({
        type: 'link',
        href: `mailto:${address}`,
        children: [{ type: 'text', value: address }],
      });
    } else if (match[10]) {
      const url = unmask(token);
      out.push({ type: 'link', href: url, children: [{ type: 'text', value: url }] });
    }

    rest = rest.slice(match.index + token.length);
  }

  pushText(rest);
  return out;
}

const ESCAPE_RE = /\\([\\`*_{}[\]()#+\-.!|>~])/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: NUL is the sentinel — it cannot occur in markdown source
const MASK_RE = /\u0000(\d+)\u0000/g;

/**
 * The inline scanner is a regex over delimiters, which cannot see a preceding
 * backslash. Escaped characters are swapped for a sentinel before scanning and
 * restored on the way out, so `\*not emphasis\*` survives as literal text.
 */
function maskEscapes(value: string): string {
  return value.replace(ESCAPE_RE, (_, char: string) => `\u0000${char.charCodeAt(0)}\u0000`);
}

function unmask(value: string): string {
  return value.replace(MASK_RE, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Flattens inline content to plain text — for titles, alt text, and outline labels. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        case 'strong':
        case 'em':
        case 'link':
          return inlineText(node.children);
        case 'image':
          return node.alt;
        case 'break':
          return ' ';
        default:
          return '';
      }
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

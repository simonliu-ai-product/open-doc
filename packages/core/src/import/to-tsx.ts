import type { Block, Inline, ParsedMarkdown, TableAlign } from './markdown.ts';
import { inlineText } from './markdown.ts';

export type ImportImage = {
  /** The `src` as written in the markdown. */
  source: string;
  /** Local identifier the generated module imports it as. */
  ident: string;
  /** Filename inside `docs/<id>/assets/`. */
  filename: string;
};

export type GenerateOptions = {
  docId: string;
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  pageSize?: string;
  orientation?: string;
  /** ISO 8601, written as a plain string literal — the framework reads it with a regex. */
  createdAt: string;
  /** Open with a title page. */
  cover?: boolean;
  /** Insert a self-filling contents page after the cover. */
  contents?: boolean;
  /** Local images already copied into the document, keyed by their markdown `src`. */
  images?: Map<string, ImportImage>;
};

export type GeneratedDocument = {
  source: string;
  title: string;
  /** Blocks that became pages of body content, for the caller to report. */
  blockCount: number;
};

/** JSX text is written literally; only these characters have to be escaped. */
function jsxText(text: string): string {
  return text.replace(/[{}<>]/g, (char) => `{'${char}'}`);
}

function jsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function attr(value: string): string {
  return `"${value.replace(/"/g, '&quot;')}"`;
}

export function collectImageSources(blocks: Block[]): string[] {
  const out: string[] = [];
  const walkInline = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.type === 'image') out.push(node.src);
      else if (node.type === 'strong' || node.type === 'em' || node.type === 'link') {
        walkInline(node.children);
      }
    }
  };
  const walk = (list: Block[]) => {
    for (const block of list) {
      switch (block.type) {
        case 'figure':
          out.push(block.src);
          break;
        case 'heading':
        case 'paragraph':
          walkInline(block.children);
          break;
        case 'quote':
          walk(block.children);
          break;
        case 'list':
          for (const item of block.items) walk(item);
          break;
        case 'table':
          for (const cell of block.head) walkInline(cell);
          for (const row of block.rows) for (const cell of row) walkInline(cell);
          break;
        default:
          break;
      }
    }
  };
  walk(blocks);
  return out;
}

function imageSrc(src: string, images: Map<string, ImportImage> | undefined): string {
  const known = images?.get(src);
  return known ? `{${known.ident}}` : attr(src);
}

function renderInline(nodes: Inline[], images: Map<string, ImportImage> | undefined): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return jsxText(node.value);
        case 'strong':
          return `<strong>${renderInline(node.children, images)}</strong>`;
        case 'em':
          return `<em>${renderInline(node.children, images)}</em>`;
        case 'code':
          return `<code style={codeInline}>${jsxText(node.value)}</code>`;
        case 'link':
          return `<a href=${attr(node.href)} style={link}>${renderInline(node.children, images)}</a>`;
        case 'image':
          return `<img src=${imageSrc(node.src, images)} alt=${attr(node.alt)} style={inlineImg} />`;
        case 'break':
          return '<br />';
        default:
          return '';
      }
    })
    .join('');
}

const HEADING_STYLE: Record<number, string> = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' };

function alignStyle(align: TableAlign): string {
  return align && align !== 'left' ? ` align={${jsString(align)}}` : '';
}

function renderBlock(
  block: Block,
  images: Map<string, ImportImage> | undefined,
  indent: string,
): string {
  const pad = indent;
  switch (block.type) {
    case 'heading': {
      const level = Math.min(block.level, 4);
      const tag = level >= 4 ? 'h4' : `h${level}`;
      const style = HEADING_STYLE[level] ?? 'h3';
      return `${pad}<${tag} style={${style}}>${renderInline(block.children, images)}</${tag}>`;
    }
    case 'paragraph':
      return `${pad}<p style={p}>${renderInline(block.children, images)}</p>`;
    case 'hr':
      return `${pad}<hr style={rule} />`;
    case 'code':
      return `${pad}<pre style={pre}>{${jsString(block.value)}}</pre>`;
    case 'quote':
      return [
        `${pad}<blockquote style={quote}>`,
        ...block.children.map((child) => renderBlock(child, images, `${pad}  `)),
        `${pad}</blockquote>`,
      ].join('\n');
    case 'figure': {
      const caption = block.alt
        ? `\n${pad}  <figcaption style={caption}>${jsxText(block.alt)}</figcaption>`
        : '';
      return [
        `${pad}<figure style={figure}>`,
        `${pad}  <img src=${imageSrc(block.src, images)} alt=${attr(block.alt)} style={img} />${caption}`,
        `${pad}</figure>`,
      ].join('\n');
    }
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const startAttr = block.ordered && block.start !== 1 ? ` start={${block.start}}` : '';
      const items = block.items.map((item) => {
        const inner = item
          .map((child, index) =>
            // A list item's own prose is the <li>'s text, so it stays editable
            // in the inspector rather than becoming a nested <p>.
            child.type === 'paragraph' && index === 0
              ? `${renderInline(child.children, images)}`
              : `\n${renderBlock(child, images, `${pad}    `)}`,
          )
          .join('');
        return `${pad}  <li style={li}>${inner.startsWith('\n') ? `${inner}\n${pad}  ` : inner}</li>`;
      });
      return [`${pad}<${tag} style={${tag}}${startAttr}>`, ...items, `${pad}</${tag}>`].join('\n');
    }
    case 'table': {
      const head = block.head
        .map(
          (cell, i) =>
            `${pad}      <Th${alignStyle(block.align[i] ?? null)}>${renderInline(cell, images)}</Th>`,
        )
        .join('\n');
      const rows = block.rows
        .map((row) =>
          [
            `${pad}    <tr>`,
            ...row.map(
              (cell, i) =>
                `${pad}      <Td${alignStyle(block.align[i] ?? null)}>${renderInline(cell, images)}</Td>`,
            ),
            `${pad}    </tr>`,
          ].join('\n'),
        )
        .join('\n');
      return [
        `${pad}<table style={table}>`,
        `${pad}  <thead>`,
        `${pad}    <tr>`,
        head,
        `${pad}    </tr>`,
        `${pad}  </thead>`,
        `${pad}  <tbody>`,
        rows,
        `${pad}  </tbody>`,
        `${pad}</table>`,
      ].join('\n');
    }
  }
}

function titleFrom(parsed: ParsedMarkdown, opts: GenerateOptions): string {
  if (opts.title) return opts.title;
  if (parsed.frontmatter.title) return parsed.frontmatter.title;
  const heading = parsed.blocks.find((block) => block.type === 'heading' && block.level === 1);
  if (heading && heading.type === 'heading') return inlineText(heading.children);
  return opts.docId.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const STYLES = `const page = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box' as const,
  padding: 'var(--od-margin)',
  background: 'var(--od-bg)',
  color: 'var(--od-text)',
  fontFamily: 'var(--od-font-body)',
  fontSize: 'var(--od-size-body)',
  lineHeight: 'var(--od-leading)',
  position: 'relative' as const,
};

const h1 = {
  fontFamily: 'var(--od-font-heading)',
  fontSize: 'var(--od-size-h1)',
  lineHeight: 1.2,
  fontWeight: 650,
  margin: '0 0 18px',
};

const h2 = { ...h1, fontSize: 'var(--od-size-h2)', margin: '26px 0 12px' };
const h3 = { ...h1, fontSize: 'var(--od-size-h3)', fontWeight: 600, margin: '20px 0 8px' };
const h4 = { ...h3, fontSize: 'var(--od-size-body)', margin: '16px 0 6px' };
const p = { margin: '0 0 12px' };
// The viewer's CSS reset strips list markers, so both are set back explicitly.
const ul = { margin: '0 0 12px', paddingLeft: 22, listStyle: 'disc outside' };
const ol = { ...ul, listStyle: 'decimal outside' };
const li = { margin: '0 0 5px' };
const link = { color: 'var(--od-accent)', textDecoration: 'none' };
const rule = { border: 0, borderTop: '1px solid var(--od-rule)', margin: '20px 0' };

const codeInline = {
  fontFamily: 'var(--od-font-mono)',
  fontSize: '0.92em',
  background: 'var(--od-rule)',
  borderRadius: 3,
  padding: '1px 4px',
};

const pre = {
  fontFamily: 'var(--od-font-mono)',
  fontSize: 11,
  lineHeight: 1.5,
  background: 'var(--od-rule)',
  borderRadius: 'var(--od-radius)',
  padding: '10px 12px',
  margin: '0 0 14px',
  whiteSpace: 'pre-wrap' as const,
  overflowWrap: 'anywhere' as const,
};

const quote = {
  margin: '0 0 14px',
  padding: '2px 0 2px 14px',
  borderLeft: '2px solid var(--od-accent)',
  color: 'var(--od-muted)',
};

const table = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  tableLayout: 'fixed' as const,
  margin: '0 0 16px',
};

const figure = { margin: '0 0 16px' };
const img = { width: '100%', display: 'block' as const };
const inlineImg = { maxWidth: '100%', verticalAlign: 'middle' as const };
const caption = { fontSize: 'var(--od-size-caption)', color: 'var(--od-muted)', margin: '6px 0 0' };

const Th = ({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'center' | 'right' }) => (
  <th
    style={{
      textAlign: align,
      fontFamily: 'var(--od-font-heading)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: 'var(--od-muted)',
      borderBottom: '1px solid var(--od-rule)',
      padding: '0 8px 6px',
    }}
  >
    {children}
  </th>
);

const Td = ({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'center' | 'right' }) => (
  <td
    style={{
      textAlign: align,
      fontSize: 12,
      padding: '7px 8px',
      borderBottom: '1px solid var(--od-rule)',
      fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined,
    }}
  >
    {children}
  </td>
);

const Footer = () => {
  const n = useDocPageNumber();
  const total = useDocPageCount();
  return (
    <div
      style={{
        position: 'absolute',
        left: 'var(--od-margin)',
        right: 'var(--od-margin)',
        bottom: 40,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 'var(--od-size-caption)',
        color: 'var(--od-muted)',
      }}
    >
      <span>{DOC_TITLE}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {n} / {total}
      </span>
    </div>
  );
};`;

const DESIGN = `export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#16181d',
    muted: '#6b7280',
    accent: '#2563eb',
    rule: '#e5e7eb',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.55,
  radius: 6,
};`;

/**
 * Turns parsed markdown into a document module. The output is ordinary authored
 * TSX — inline styles, real heading tags, plain JSX text — so the outline, the
 * inspector, and the design panel all work on an imported document exactly as
 * they do on a hand-written one.
 */
export function generateDocumentSource(
  parsed: ParsedMarkdown,
  opts: GenerateOptions,
): GeneratedDocument {
  const title = titleFrom(parsed, opts);
  const subtitle = opts.subtitle ?? parsed.frontmatter.subtitle;
  const author = opts.author ?? parsed.frontmatter.author;
  const theme = opts.theme ?? parsed.frontmatter.theme;
  const pageSize = opts.pageSize ?? parsed.frontmatter.pageSize;
  const orientation = opts.orientation ?? parsed.frontmatter.orientation;
  const cover = opts.cover !== false;

  let blocks = parsed.blocks;
  // The cover already says the title; repeating it as the first body heading
  // just burns a line and duplicates the outline entry.
  const first = blocks[0];
  if (
    cover &&
    first?.type === 'heading' &&
    first.level === 1 &&
    inlineText(first.children) === title
  ) {
    blocks = blocks.slice(1);
  }

  const images = opts.images;
  const imports = images ? [...images.values()] : [];

  const runtimeImports = [
    'type DesignSystem',
    'type DocEntry',
    'type DocMeta',
    ...(cover || opts.contents ? ['type DocPage'] : []),
    ...(opts.contents ? ['TableOfContents'] : []),
    'flow',
    'useDocPageCount',
    'useDocPageNumber',
  ];

  const head = [
    `import type { ReactNode } from 'react';`,
    `import {\n${runtimeImports.map((name) => `  ${name},`).join('\n')}\n} from '@open-document/core';`,
    ...imports.map((image) => `import ${image.ident} from './assets/${image.filename}';`),
  ].join('\n');

  const styles = STYLES.replace('{DOC_TITLE}', jsxText(title));

  const coverPage = cover
    ? `const Cover: DocPage = () => (
  <div style={{ ...page, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
${
  subtitle
    ? `    <p style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--od-accent)', margin: 0 }}>
      ${jsxText(subtitle)}
    </p>\n`
    : ''
}    <h1 style={{ ...h1, fontSize: 'var(--od-size-title)', margin: '16px 0 12px' }} data-od-outline="skip">
      ${jsxText(title)}
    </h1>
${author ? `    <p style={{ color: 'var(--od-muted)', margin: 0 }}>${jsxText(author)}</p>\n` : ''}  </div>
);`
    : '';

  const contentsPage = opts.contents
    ? `const Contents: DocPage = () => (
  <div style={page}>
    <h1 style={h1} data-od-outline="skip">
      Contents
    </h1>
    <TableOfContents maxLevel={2} />
  </div>
);`
    : '';

  const body = `const Body = flow(
  <>
${blocks.map((block) => renderBlock(block, images, '    ')).join('\n')}
  </>,
  { footer: Footer },
);`;

  const metaFields = [
    `  title: ${jsString(title)},`,
    ...(subtitle ? [`  subtitle: ${jsString(subtitle)},`] : []),
    ...(author ? [`  author: ${jsString(author)},`] : []),
    ...(pageSize ? [`  pageSize: ${jsString(pageSize)},`] : []),
    ...(orientation ? [`  orientation: ${jsString(orientation)},`] : []),
    ...(theme ? [`  theme: ${jsString(theme)},`] : []),
    `  createdAt: ${jsString(opts.createdAt)},`,
  ];

  const entries = [...(cover ? ['Cover'] : []), ...(opts.contents ? ['Contents'] : []), 'Body'];

  const source = [
    head,
    '',
    DESIGN,
    '',
    styles,
    '',
    ...(coverPage ? [coverPage, ''] : []),
    ...(contentsPage ? [contentsPage, ''] : []),
    body,
    '',
    `export const meta: DocMeta = {\n${metaFields.join('\n')}\n};`,
    `export default [${entries.join(', ')}] satisfies DocEntry[];`,
    '',
  ].join('\n');

  return { source, title, blockCount: blocks.length };
}

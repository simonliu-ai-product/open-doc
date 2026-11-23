import type {
  Css,
  DocxLayout,
  LBlock,
  LCell,
  LParagraph,
  LRun,
  LRunning,
  LSection,
  LTable,
} from './docx-layout.ts';
import { attr, type GeneratedDocument, type ImportImage, jsString, jsxText } from './to-tsx.ts';

export type LayoutGenerateOptions = {
  docId: string;
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  pageSize?: string;
  orientation?: string;
  lang?: string;
  createdAt: string;
  /** Pictures already copied into the document, keyed by their `src` in the layout. */
  images?: Map<string, ImportImage>;
};

const FONT_REF = '@font:';

/** What a run looks like when it says nothing — used to undo a paragraph-level value. */
const RUN_DEFAULTS: Css = {
  fontWeight: 400,
  fontStyle: 'normal',
  textDecoration: 'none',
  textDecorationStyle: 'solid',
  color: 'var(--od-text)',
  background: 'transparent',
  textTransform: 'none',
  letterSpacing: 'normal',
};

const MONO_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function value(v: string | number): string {
  if (typeof v === 'number') return String(v);
  if (v.startsWith(FONT_REF)) return v.slice(FONT_REF.length);
  return jsString(v);
}

function styleAttr(css: Css): string {
  const entries = Object.entries(css);
  if (entries.length === 0) return '';
  return ` style={{ ${entries.map(([k, v]) => `${k}: ${value(v)}`).join(', ')} }}`;
}

function textJsx(text: string): string {
  return text
    .split('\t')
    .map((part) => jsxText(part))
    .join(`{'\\t'}`);
}

type Context = {
  layout: DocxLayout;
  images?: Map<string, ImportImage>;
  baseFont: string;
  usesRows: boolean;
  /** Page fields the header or footer being written shows. */
  fields: Set<'page' | 'pages'>;
  usesFootnotes: boolean;
};

/** The run style most of the paragraph's text is set in; the paragraph carries it, runs only differ. */
function dominant(p: LParagraph): Css {
  const weights = new Map<string, { css: Css; n: number }>();
  for (const run of p.runs) {
    if (run.kind !== 'text') continue;
    const key = JSON.stringify(run.css);
    const entry = weights.get(key) ?? { css: run.css, n: 0 };
    entry.n += run.text.length;
    weights.set(key, entry);
  }
  let best: Css = p.mark;
  let most = -1;
  for (const { css, n } of weights.values()) {
    if (n > most) {
      best = css;
      most = n;
    }
  }
  // A highlight or a box belongs to the words, not to the whole line width;
  // an underline on the paragraph could not be taken off one run inside it
  // (CSS draws an ancestor's decoration through its children).
  const {
    background: _background,
    border: _border,
    textDecoration: _decoration,
    textDecorationStyle: _decorationStyle,
    ...hoisted
  } = best;
  return hoisted;
}

function diff(run: Css, base: Css): Css {
  const out: Css = {};
  for (const key of new Set([...Object.keys(run), ...Object.keys(base)])) {
    const mine = run[key] ?? RUN_DEFAULTS[key];
    const theirs = base[key] ?? RUN_DEFAULTS[key];
    if (mine !== theirs && mine !== undefined) out[key] = mine;
  }
  return out;
}

function ownRunCss(css: Css, ctx: Context, heading: boolean): Css {
  const out: Css = {};
  for (const [key, v] of Object.entries(css)) {
    if (key === 'fontFamily' && v === `${FONT_REF}${ctx.baseFont}`) continue;
    if (key === 'fontSize' && v === ctx.layout.baseSize && !heading) continue;
    if (key === 'fontWeight' && v === 400 && !heading) continue;
    if (key === 'fontStyle' && v === 'normal') continue;
    out[key] = v;
  }
  return out;
}

function wrapRun(inner: string, own: Css): string {
  const keys = Object.keys(own);
  if (keys.length === 0) return inner;
  if (keys.length === 1 && own.fontWeight === 700) return `<strong>${inner}</strong>`;
  if (keys.length === 1 && own.fontStyle === 'italic') return `<em>${inner}</em>`;
  if (keys.length === 2 && own.fontWeight === 700 && own.fontStyle === 'italic') {
    return `<strong><em>${inner}</em></strong>`;
  }
  return `<span${styleAttr(own)}>${inner}</span>`;
}

function mergeRuns(runs: LRun[]): LRun[] {
  const out: LRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (
      run.kind === 'text' &&
      last?.kind === 'text' &&
      last.href === run.href &&
      last.vert === run.vert &&
      last.field === run.field &&
      !run.field &&
      JSON.stringify(last.css) === JSON.stringify(run.css)
    ) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
    } else {
      out.push(run);
    }
  }
  return out;
}

/**
 * With a fixed line height, a run in another size or font sits on the
 * shared baseline with its own half-leading and stretches the line past the
 * height Word gives it. Setting it solid keeps it inside the paragraph's line.
 */
function solid(own: Css, p: LParagraph): Css {
  const fixed = typeof p.css.lineHeight === 'string' && p.css.lineHeight.endsWith('px');
  if (fixed && (own.fontSize !== undefined || own.fontFamily !== undefined)) {
    return { ...own, lineHeight: 1 };
  }
  return own;
}

function renderRuns(p: LParagraph, base: Css, ctx: Context): string {
  return mergeRuns(p.runs)
    .map((run) => {
      switch (run.kind) {
        case 'break':
          return '<br />';
        case 'image': {
          if (!run.src) {
            return `<span${styleAttr({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: run.width,
              height: run.height,
              overflow: 'hidden',
              border: '1px dashed #9ca3af',
              boxSizing: 'border-box',
              verticalAlign: 'bottom',
              color: '#6b7280',
              fontSize: 10,
              lineHeight: 1.2,
              textIndent: 0,
            })} data-od-generated="">${textJsx(run.alt || 'picture not imported')}</span>`;
          }
          const srcOf = (value: string) => {
            const known = ctx.images?.get(value);
            return known ? `{${known.ident}}` : attr(value);
          };
          if (run.parts) {
            const pieces = run.parts.map(
              (part) =>
                `<img src=${srcOf(part.src)} alt=${attr(part.alt)}${styleAttr({
                  position: 'absolute',
                  left: part.left,
                  top: part.top,
                  width: part.width,
                  height: part.height,
                })} />`,
            );
            return `<span role="img" aria-label=${attr(run.alt)}${styleAttr({
              display: 'inline-block',
              position: 'relative',
              width: run.width,
              height: run.height,
              verticalAlign: 'bottom',
            })}>${pieces.join('')}</span>`;
          }
          const src = srcOf(run.src);
          // In line with the text, as in Word: the page's base styles make
          // every picture a block, which would stack a row of logos.
          const size: Css = run.width
            ? {
                display: 'inline-block',
                width: run.width,
                height: run.height,
                verticalAlign: 'bottom',
              }
            : { display: 'inline-block', maxWidth: '100%', verticalAlign: 'bottom' };
          return `<img src=${src} alt=${attr(run.alt)}${styleAttr(size)} />`;
        }
        case 'blank':
          return `<span${styleAttr({
            display: 'inline-block',
            width: run.width,
            borderBottom: '1px solid currentColor',
            ...diff(pick(run.css, ['fontSize']), pick(base, ['fontSize'])),
          })} />`;
        case 'anchor':
          return `<span id=${attr(run.id)} />`;
        case 'drop':
          return `<span${styleAttr({ ...diff(run.css, base), float: 'left' })}>${textJsx(run.text)}</span>`;
        case 'ruby':
          return wrapRun(
            `<ruby>${textJsx(run.base)}<rt>${textJsx(run.rt)}</rt></ruby>`,
            solid(diff(run.css, base), p),
          );
        case 'note': {
          ctx.usesFootnotes = true;
          const body = run.blocks
            .map((block) => renderRuns(block, dominant(block), ctx).trim())
            .filter(Boolean)
            .join('<br />');
          return `<Footnote>${body}</Footnote>`;
        }
        case 'box':
          return `<div${styleAttr({
            position: 'absolute',
            left: run.left,
            top: run.top,
            width: run.width,
            minHeight: run.height,
            boxSizing: 'border-box',
            textIndent: 0,
            textAlign: 'left',
            ...run.css,
          })}>${run.blocks.map((block) => renderBlock(block, ctx, '')).join('')}</div>`;
        case 'marker':
          return `<span${styleAttr({
            display: 'inline-block',
            ...(run.width ? { minWidth: run.width } : {}),
            textIndent: 0,
            ...solid(diff(run.css, base), p),
          })} data-od-generated="">${textJsx(run.text)}</span>`;
        case 'text': {
          let inner = textJsx(run.text);
          if (run.field) {
            ctx.fields.add(run.field);
            inner = run.field === 'page' ? '{page}' : '{pages}';
          }
          const own = solid(diff(run.css, base), p);
          if (run.href) {
            const linkCss: Css = {
              ...own,
              color: own.color ?? base.color ?? 'inherit',
              textDecoration: own.textDecoration ?? base.textDecoration ?? 'none',
            };
            inner = `<a href=${attr(run.href)}${styleAttr(linkCss)}>${inner}</a>`;
          } else {
            inner = wrapRun(inner, own);
          }
          if (run.vert) inner = `<${run.vert}>${inner}</${run.vert}>`;
          // Text Word draws but never stored is marked, so a comparison with
          // the source can tell it from words the import made up.
          if (run.generated) inner = `<span data-od-generated="">${inner}</span>`;
          return inner;
        }
        default:
          return '';
      }
    })
    .join('');
}

function pick(css: Css, keys: string[]): Css {
  const out: Css = {};
  for (const key of keys) if (css[key] !== undefined) out[key] = css[key];
  return out;
}

function flags(block: LBlock): string {
  return [
    block.keepNext ? ' data-od-keep-with-next="true"' : '',
    block.breakBefore ? ' data-od-break-before="true"' : '',
  ].join('');
}

function renderParagraph(p: LParagraph, ctx: Context, pad: string): string {
  const heading = !!p.heading;
  const boxed = p.runs.some((run) => run.kind === 'box');
  // A floating box holds paragraphs of its own, which a <p> may not contain.
  const tag = heading ? `h${Math.min(p.heading ?? 1, 4)}` : boxed ? 'div' : 'p';
  const base = dominant(p);
  const css: Css = {
    ...ownRunCss(base, ctx, heading),
    ...p.css,
    ...(boxed ? { position: 'relative' } : {}),
  };
  // Under a box that spans the line, the text starts below it.
  const clear = Math.max(0, ...p.runs.map((run) => (run.kind === 'box' ? (run.clear ?? 0) : 0)));
  if (clear > 0) css.paddingTop = clear;
  const after = Math.max(0, ...p.runs.map((run) => (run.kind === 'box' ? (run.after ?? 0) : 0)));
  if (after > 0) css.paddingBottom = after;
  const inline = p.runs.some((run) => run.kind !== 'box');
  const content = `${renderRuns(p, base, ctx)}${inline ? '' : '<br />'}`;
  return `${pad}<${tag}${styleAttr(css)}${flags(p)}>${content}</${tag}>`;
}

function renderCell(cell: LCell, ctx: Context, pad: string): string {
  const spans = [
    cell.colSpan > 1 ? ` colSpan={${cell.colSpan}}` : '',
    cell.rowSpan > 1 ? ` rowSpan={${cell.rowSpan}}` : '',
  ].join('');
  if (cell.blocks.length === 0) return `${pad}<td${spans}${styleAttr(cell.css)} />`;
  return [
    `${pad}<td${spans}${styleAttr(cell.css)}>`,
    ...cell.blocks.map((block) => renderBlock(block, ctx, `${pad}  `)),
    `${pad}</td>`,
  ].join('\n');
}

function renderTable(table: LTable, ctx: Context, pad: string): string {
  const rowJsx = (rowPad: string) => (row: LTable['rows'][number]) =>
    [
      `${rowPad}<tr${styleAttr(row.css)}${row.source !== undefined ? ` data-od-source-row="${row.source}"` : ''}>`,
      ...row.cells.map((cell) => renderCell(cell, ctx, `${rowPad}  `)),
      `${rowPad}</tr>`,
    ].join('\n');
  const head = table.rows.filter((row) => row.header);
  const body = table.rows.filter((row) => !row.header);
  const split = table.splittable && body.length > 1;
  if (split) ctx.usesRows = true;
  const lines = [
    `${pad}<table${styleAttr(table.css)}${split ? ' data-od-splittable=""' : ''}${table.source !== undefined ? ` data-od-source-table="${table.source}"` : ''}${flags(table)}>`,
    `${pad}  <colgroup>`,
    ...table.cols.map((w) => `${pad}    <col${styleAttr({ width: w })} />`),
    `${pad}  </colgroup>`,
  ];
  if (head.length > 0) {
    lines.push(`${pad}  <thead>`, ...head.map(rowJsx(`${pad}    `)), `${pad}  </thead>`);
  }
  if (split) {
    lines.push(
      `${pad}  <tbody>`,
      `${pad}    <Rows>`,
      ...body.map(rowJsx(`${pad}      `)),
      `${pad}    </Rows>`,
      `${pad}  </tbody>`,
    );
  } else {
    lines.push(`${pad}  <tbody>`, ...body.map(rowJsx(`${pad}    `)), `${pad}  </tbody>`);
  }
  lines.push(`${pad}</table>`);
  return lines.join('\n');
}

function renderBlock(block: LBlock, ctx: Context, pad: string): string {
  return block.kind === 'p' ? renderParagraph(block, ctx, pad) : renderTable(block, ctx, pad);
}

export function collectLayoutImages(layout: DocxLayout): string[] {
  const out: string[] = [];
  const walk = (blocks: LBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'p') {
        for (const run of block.runs) {
          if (run.kind === 'image' && run.parts) out.push(...run.parts.map((part) => part.src));
          else if (run.kind === 'image' && run.src) out.push(run.src);
          else if (run.kind === 'box') walk(run.blocks);
        }
      } else {
        for (const row of block.rows) for (const cell of row.cells) walk(cell.blocks);
      }
    }
  };
  for (const section of layout.sections) {
    for (const running of [section.header, section.footer]) {
      if (!running) continue;
      walk(running.blocks);
      if (running.first) walk(running.first);
    }
    walk(section.blocks);
  }
  return out;
}

/**
 * Writes a Word layout as a document module: one `flow()` per Word section,
 * inline styles carrying Word's look, real heading tags where Word used
 * heading styles. No cover — the first page is the first page Word printed.
 */
export function generateLayoutSource(
  layout: DocxLayout,
  opts: LayoutGenerateOptions,
): GeneratedDocument {
  const ctx: Context = {
    layout,
    ...(opts.images ? { images: opts.images } : {}),
    baseFont: layout.baseFont,
    usesRows: false,
    fields: new Set(),
    usesFootnotes: false,
  };
  const title = opts.title ?? layout.title ?? opts.docId.replace(/-/g, ' ');

  // Headers and footers: one component each, shared by the sections that print the same one.
  const runningSource = new Map<string, string>();
  const runningDefs: string[] = [];
  const pageHooks = new Set<'page' | 'pages'>();
  const runningComponent = (
    kind: 'Header' | 'Footer',
    running: LRunning | undefined,
    section: LSection,
    firstSection: boolean,
  ): string | undefined => {
    if (!running) return undefined;
    ctx.fields = new Set();
    const render = (blocks: LBlock[]) =>
      blocks.map((block) => renderBlock(block, ctx, '        ')).join('\n');
    const main = render(running.blocks);
    // Only the document's first sheet is known to open a section here.
    const first = running.first && firstSection ? render(running.first) : undefined;
    const usesPage = ctx.fields.has('page') || first !== undefined;
    const usesPages = ctx.fields.has('pages');
    const edge = kind === 'Header' ? 'top' : 'bottom';
    const box = styleAttr({
      position: 'absolute',
      [edge]: running.offset,
      left: section.padding.left,
      right: section.padding.right,
    });
    const inner =
      first !== undefined
        ? `      {page === 1 ? (\n        <>\n${first || '          {null}'}\n        </>\n      ) : (\n        <>\n${main || '          {null}'}\n        </>\n      )}`
        : main;
    const hooks = [
      ...(usesPage ? ['  const page = useDocPageNumber();'] : []),
      ...(usesPages ? ['  const pages = useDocPageCount();'] : []),
    ];
    const body = `${hooks.length ? `{\n${hooks.join('\n')}\n  return (` : '('}\n    <div data-od-running=""${box}>\n${inner}\n    </div>\n  )${hooks.length ? ';\n}' : ''}`;
    const known = runningSource.get(body);
    if (known) return known;
    if (usesPage) pageHooks.add('page');
    if (usesPages) pageHooks.add('pages');
    const name = `${kind}${runningDefs.filter((def) => def.startsWith(`const ${kind}`)).length + 1}`;
    runningSource.set(body, name);
    runningDefs.push(`const ${name} = () => ${body};`);
    return name;
  };

  const sections = layout.sections.map((section, index) => {
    const header = runningComponent('Header', section.header, section, index === 0);
    const footer = runningComponent('Footer', section.footer, section, index === 0);
    const body = section.blocks.map((block) => renderBlock(block, ctx, '    ')).join('\n');
    const columns = section.columns
      ? `, columns: ${section.columns.count}, columnGap: ${section.columns.gap}`
      : '';
    const running = `${header ? `, header: ${header}` : ''}${footer ? `, footer: ${footer}` : ''}`;
    const { top, right, bottom, left } = section.padding;
    const padding =
      top === right && right === bottom && bottom === left
        ? `${top}`
        : `{ top: ${top}, right: ${right}, bottom: ${bottom}, left: ${left} }`;
    return `const Section${index + 1} = flow(\n  <>\n${body}\n  </>,\n  { padding: ${padding}${columns}${running} },\n);`;
  });

  const baseStack = layout.fonts.get(layout.baseFont) ?? MONO_STACK;
  const size = layout.baseSize;
  const r = (n: number) => Math.round(n * 10) / 10;
  const design = `export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#000000',
    muted: '#595959',
    accent: '#0563c1',
    rule: '#bfbfbf',
  },
  fonts: {
    heading: ${jsString(baseStack)},
    body: ${jsString(baseStack)},
    mono: ${jsString(MONO_STACK)},
  },
  typeScale: { title: ${r(size * 2)}, h1: ${r(size * 1.6)}, h2: ${r(size * 1.3)}, h3: ${r(size * 1.15)}, body: ${r(size)}, caption: ${r(Math.max(10, size * 0.75))} },
  margin: ${layout.sections[0]?.padding.left ?? 76},
  leading: 1.2,
  radius: 0,
};`;

  const fonts = [...layout.fonts.entries()].map(
    ([id, stack]) => `const ${id} = ${jsString(stack)};`,
  );

  const images = opts.images ? [...opts.images.values()] : [];
  const coreImports = [
    'type DesignSystem',
    'type DocEntry',
    'type DocMeta',
    'flow',
    ...(ctx.usesFootnotes ? ['Footnote'] : []),
    ...(pageHooks.has('pages') ? ['useDocPageCount'] : []),
    ...(pageHooks.has('page') ? ['useDocPageNumber'] : []),
    ...(ctx.usesRows ? ['useTableSlice'] : []),
  ];
  const head = [
    ...(ctx.usesRows ? [`import { Children, type ReactNode } from 'react';`] : []),
    `import {\n${coreImports.map((name) => `  ${name},`).join('\n')}\n} from '@open-document/core';`,
    ...images.map((image) => `import ${image.ident} from './assets/${image.filename}';`),
  ].join('\n');

  const rows = ctx.usesRows
    ? `// When the flow breaks a table across pages, each page prints only its own rows.
const Rows = ({ children }: { children?: ReactNode }) => {
  const slice = useTableSlice();
  const all = Children.toArray(children);
  return <>{slice ? all.slice(slice.rowStart, slice.rowEnd) : all}</>;
};`
    : '';

  const pageSize = opts.pageSize ?? layout.pageSize;
  const orientation = opts.orientation ?? layout.orientation;
  const metaFields = [
    `  title: ${jsString(title)},`,
    ...(opts.subtitle ? [`  subtitle: ${jsString(opts.subtitle)},`] : []),
    ...(opts.author ? [`  author: ${jsString(opts.author)},`] : []),
    `  pageSize: ${jsString(pageSize)},`,
    ...(orientation !== 'portrait' ? [`  orientation: ${jsString(orientation)},`] : []),
    ...(opts.theme ? [`  theme: ${jsString(opts.theme)},`] : []),
    ...(opts.lang ? [`  lang: ${jsString(opts.lang)},`] : []),
    `  createdAt: ${jsString(opts.createdAt)},`,
  ];

  const source = [
    head,
    '',
    design,
    '',
    ...fonts,
    '',
    ...(rows ? [rows, ''] : []),
    ...(runningDefs.length ? [runningDefs.join('\n\n'), ''] : []),
    sections.join('\n\n'),
    '',
    `export const meta: DocMeta = {\n${metaFields.join('\n')}\n};`,
    `export default [${layout.sections.map((_, i) => `Section${i + 1}`).join(', ')}] satisfies DocEntry[];`,
    '',
  ].join('\n');

  const blockCount = layout.sections.reduce((sum, section) => sum + section.blocks.length, 0);
  return { source, title, blockCount };
}

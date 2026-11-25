import { isSafeHref } from '../app/lib/href.ts';
import { DocxError, num, on, openDocx, resolvePart, symbolText, val } from './docx-package.ts';
import type { Block, Inline, ParsedMarkdown, TableAlign } from './markdown.ts';

export { DocxError };

import { child, descendants, elements, textContent, type XmlElement } from './xml.ts';

/**
 * Reads a Word document into the same blocks Markdown import produces, so one
 * generator writes both. Word's structure comes from styles, not tags: a
 * heading is a paragraph whose style (or the style it is based on) is named
 * `heading N` or carries an outline level, which is how a Chinese Word's
 * style `1` is still Heading 1. What has no block to land in — text boxes,
 * notes, comments, tracked changes, equations — keeps its text where it can
 * and is counted in `warnings`, never dropped without a word.
 */
export type ParsedDocx = ParsedMarkdown & {
  /** Embedded pictures, keyed by the `src` the blocks use (the part path). */
  media: Map<string, Uint8Array>;
  /** All the text, for language detection. */
  text: string;
  warnings: string[];
};

type Style = {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  outlineLvl?: number;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  size?: number;
};

type Fmt = { b: boolean; i: boolean; code: boolean };

type Atom =
  | { kind: 'text'; value: string; fmt: Fmt; href?: string; size: number }
  | { kind: 'break' }
  | { kind: 'image'; src: string; alt: string };

type ListRef = { level: number; ordered: boolean; start: number; key: string };

type Para = {
  heading?: number | 'title' | 'subtitle';
  role?: 'code' | 'quote' | 'caption' | 'toc';
  list?: ListRef;
  atoms: Atom[];
  indent: number;
  align: TableAlign;
  extra: Block[];
};

type Item = { kind: 'para'; para: Para } | { kind: 'block'; block: Block };

const MONO_FONT_RE =
  /courier|consolas|menlo|monaco|mono|source code|lucida console|inconsolata|fira code|cascadia/i;
const UNSHOWABLE_IMAGE_RE = /\.(?:emf|wmf|tiff?|wdp)$/i;
const BULLET_MARKER_RE = /^[\t ]*([•◦▪▫‣⁃●○■□·*–-])\t+/;
const NUMBER_MARKER_RE = /^[\t ]*(\d{1,3}|[a-zA-Z])[.)]?\t+/;

const WARNINGS: Record<string, (n: number) => string> = {
  textbox: (n) => `${n} text box(es) kept as paragraphs after the text they sit beside`,
  note: (n) => `${n} footnote(s) or endnote(s) moved to a numbered list at the end`,
  comment: (n) => `${n} comment(s) not imported`,
  insertion: (n) => `${n} tracked insertion(s) accepted`,
  deletion: (n) => `${n} tracked deletion(s) accepted (their text is gone)`,
  math: (n) => `${n} equation(s) kept as plain text`,
  drawing: (n) => `${n} chart(s), SmartArt or shape(s) without a picture not imported`,
  unshowable: (n) => `${n} image(s) in a format browsers cannot show (EMF, WMF, TIFF) not imported`,
  missingImage: (n) => `${n} image(s) missing from the file not imported`,
  object: (n) => `${n} embedded object(s) kept as their preview picture`,
  toc: () => 'the table of contents was not imported — pass --contents for one that fills itself',
  merged: (n) => `${n} merged table cell(s) split into separate cells`,
  nestedTable: (n) => `${n} nested table(s) flattened to text`,
  altChunk: (n) => `${n} embedded document part(s) not imported`,
};

function readStyles(xml: XmlElement | undefined): Map<string, Style> {
  const styles = new Map<string, Style>();
  if (!xml) return styles;
  for (const el of elements(xml, 'w:style')) {
    const id = el.attrs['w:styleId'];
    if (!id) continue;
    const pPr = child(el, 'w:pPr');
    const rPr = child(el, 'w:rPr');
    const numPr = child(pPr, 'w:numPr');
    const fonts = child(rPr, 'w:rFonts');
    const font = fonts?.attrs['w:ascii'] ?? fonts?.attrs['w:hAnsi'];
    styles.set(id, {
      id,
      name: (val(child(el, 'w:name')) ?? id).toLowerCase(),
      type: el.attrs['w:type'] ?? 'paragraph',
      basedOn: val(child(el, 'w:basedOn')),
      outlineLvl: num(val(child(pPr, 'w:outlineLvl'))),
      numId: val(child(numPr, 'w:numId')),
      ilvl: num(val(child(numPr, 'w:ilvl'))),
      bold: on(child(rPr, 'w:b')),
      italic: on(child(rPr, 'w:i')),
      mono: font ? MONO_FONT_RE.test(font) : undefined,
      size: num(val(child(rPr, 'w:sz'))),
    });
  }
  return styles;
}

type Numbering = Map<string, Map<number, { fmt: string; start: number }>>;

function readNumbering(xml: XmlElement | undefined): Numbering {
  const out: Numbering = new Map();
  if (!xml) return out;
  const readLevels = (el: XmlElement, into: Map<number, { fmt: string; start: number }>) => {
    for (const lvl of elements(el, 'w:lvl')) {
      const ilvl = num(lvl.attrs['w:ilvl']) ?? 0;
      into.set(ilvl, {
        fmt: val(child(lvl, 'w:numFmt')) ?? 'decimal',
        start: num(val(child(lvl, 'w:start'))) ?? 1,
      });
    }
  };
  const abstracts = new Map<string, Map<number, { fmt: string; start: number }>>();
  for (const el of elements(xml, 'w:abstractNum')) {
    const levels = new Map<number, { fmt: string; start: number }>();
    readLevels(el, levels);
    abstracts.set(el.attrs['w:abstractNumId'] ?? '', levels);
  }
  for (const el of elements(xml, 'w:num')) {
    const levels = new Map(abstracts.get(val(child(el, 'w:abstractNumId')) ?? '') ?? []);
    for (const override of elements(el, 'w:lvlOverride')) {
      const lvl = child(override, 'w:lvl');
      if (lvl) readLevels({ ...override, children: [lvl] }, levels);
    }
    out.set(el.attrs['w:numId'] ?? '', levels);
  }
  return out;
}

export function parseDocx(bytes: Uint8Array): ParsedDocx {
  const { files, body, mainDir, rels, partOf } = openDocx(bytes);
  const styles = readStyles(partOf('/styles', 'styles.xml'));
  const numbering = readNumbering(partOf('/numbering', 'numbering.xml'));
  const footnotes = partOf('/footnotes', 'footnotes.xml');
  const endnotes = partOf('/endnotes', 'endnotes.xml');

  const counts = new Map<string, number>();
  const count = (key: string, by = 1) => counts.set(key, (counts.get(key) ?? 0) + by);
  const media = new Map<string, Uint8Array>();
  const textParts: string[] = [];
  const notes: Inline[][] = [];
  const fields: Array<{ instr: string; result: boolean; href?: string }> = [];

  const chain = (id: string | undefined): Style[] => {
    const out: Style[] = [];
    let current = id ? styles.get(id) : undefined;
    while (current && out.length < 12 && !out.includes(current)) {
      out.push(current);
      current = current.basedOn ? styles.get(current.basedOn) : undefined;
    }
    return out;
  };

  const headingOf = (styleId: string | undefined): Para['heading'] => {
    for (const style of chain(styleId)) {
      const match = style.name.match(/^heading\s*([1-9])$/);
      if (match) return Number(match[1]);
      if (style.name === 'title') return 'title';
      if (style.name === 'subtitle') return 'subtitle';
      if (style.outlineLvl !== undefined && style.outlineLvl < 9) return style.outlineLvl + 1;
    }
    // A style id with no definition in styles.xml still names Word's built-ins.
    if (styleId && !styles.has(styleId)) {
      const match = styleId.match(/^heading\s*([1-9])$/i);
      if (match) return Number(match[1]);
      if (/^title$/i.test(styleId)) return 'title';
      if (/^subtitle$/i.test(styleId)) return 'subtitle';
    }
    return undefined;
  };

  const roleOf = (styleId: string | undefined): Para['role'] => {
    const names = chain(styleId).map((style) => style.name);
    if (styleId && names.length === 0) names.push(styleId.toLowerCase());
    for (const name of names) {
      if (/^toc\s*(\d|heading)|^contents\s*\d/.test(name)) return 'toc';
      if (/code|source|preformatted|verbatim|plain\s*text|macro/.test(name)) return 'code';
      if (/quote|block\s*text/.test(name)) return 'quote';
      if (/^caption$/.test(name)) return 'caption';
    }
    return undefined;
  };

  const listOf = (numId: string | undefined, ilvl: number): ListRef | undefined => {
    if (!numId || numId === '0') return undefined;
    const levels = numbering.get(numId);
    if (!levels) return undefined;
    const level = levels.get(ilvl) ?? levels.get(0);
    const fmt = level?.fmt ?? 'bullet';
    if (fmt === 'none') return undefined;
    return { level: ilvl, ordered: fmt !== 'bullet', start: level?.start ?? 1, key: numId };
  };

  const runFmt = (rPr: XmlElement | undefined): { fmt: Fmt; size: number } => {
    const styled = chain(val(child(rPr, 'w:rStyle')));
    const pick = <K extends 'bold' | 'italic' | 'mono' | 'size'>(key: K) =>
      styled.find((style) => style[key] !== undefined)?.[key];
    const fonts = child(rPr, 'w:rFonts');
    const font = fonts?.attrs['w:ascii'] ?? fonts?.attrs['w:hAnsi'];
    const codeStyle = styled.some((style) =>
      /code|verbatim|html (typewriter|keyboard|sample)/.test(style.name),
    );
    return {
      fmt: {
        b: on(child(rPr, 'w:b')) ?? pick('bold') ?? false,
        i: on(child(rPr, 'w:i')) ?? pick('italic') ?? false,
        code:
          (font ? MONO_FONT_RE.test(font) : undefined) ?? (codeStyle || (pick('mono') ?? false)),
      },
      size: num(val(child(rPr, 'w:sz'))) ?? pick('size') ?? 0,
    };
  };

  const imageAtom = (relId: string | undefined, alt: string): Atom | null => {
    const rel = relId ? rels.get(relId) : undefined;
    if (!rel) {
      count('missingImage');
      return null;
    }
    if (rel.external) {
      if (/^https?:\/\//i.test(rel.target)) return { kind: 'image', src: rel.target, alt };
      count('missingImage');
      return null;
    }
    const part = resolvePart(mainDir, rel.target);
    if (UNSHOWABLE_IMAGE_RE.test(part)) {
      count('unshowable');
      return null;
    }
    const data = files[part];
    if (!data) {
      count('missingImage');
      return null;
    }
    media.set(part, data);
    return { kind: 'image', src: part, alt };
  };

  const fieldHref = (): string | undefined => {
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].result && fields[i].href) return fields[i].href;
    }
    return undefined;
  };

  const readNote = (part: XmlElement | undefined, tag: string, id: string | undefined): Atom[] => {
    const note = part && elements(part, tag).find((el) => el.attrs['w:id'] === id);
    if (!note) return [];
    const inner: Inline[] = [];
    for (const p of descendants(note, 'w:p')) {
      const para = readParagraph(p);
      const inline = toInline(para.atoms);
      if (inline.length === 0) continue;
      if (inner.length > 0) inner.push({ type: 'text', value: ' ' });
      inner.push(...inline);
    }
    notes.push(inner);
    count('note');
    return [
      {
        kind: 'text',
        value: `[${notes.length}]`,
        fmt: { b: false, i: false, code: false },
        size: 0,
      },
    ];
  };

  function readDrawing(el: XmlElement, para: Para, out: Atom[]) {
    const boxes = descendants(el, 'w:txbxContent');
    for (const box of boxes) {
      count('textbox');
      para.extra.push(...assemble(readBlockItems(box)));
    }
    const blips = descendants(el, 'a:blip');
    const docPr = descendants(el, 'wp:docPr')[0];
    const alt = (docPr?.attrs.descr || docPr?.attrs.title || '').trim();
    for (const blip of blips) {
      const atom = imageAtom(blip.attrs['r:embed'] ?? blip.attrs['r:link'], alt);
      if (atom) out.push(atom);
    }
    const vml = descendants(el, 'v:imagedata');
    for (const image of vml) {
      const atom = imageAtom(image.attrs['r:id'], (image.attrs['o:title'] ?? '').trim());
      if (atom) out.push(atom);
    }
    if (boxes.length === 0 && blips.length === 0 && vml.length === 0) count('drawing');
  }

  function readRun(run: XmlElement, para: Para, href: string | undefined, out: Atom[]) {
    const { fmt, size } = runFmt(child(run, 'w:rPr'));
    const push = (value: string) => {
      if (value === '') return;
      if (fields.some((field) => !field.result)) return;
      textParts.push(value);
      const link = href ?? fieldHref();
      out.push({ kind: 'text', value, fmt, size, ...(link ? { href: link } : {}) });
    };
    for (const node of run.children) {
      if (typeof node === 'string') continue;
      switch (node.name) {
        case 't':
        case 'w:t':
          push(textContent(node).replace(/\r?\n/g, ' '));
          break;
        case 'w:tab':
        case 'w:ptab':
          push('\t');
          break;
        case 'w:noBreakHyphen':
          push('-');
          break;
        case 'w:br': {
          const type = node.attrs['w:type'];
          if (type !== 'page' && type !== 'column') out.push({ kind: 'break' });
          break;
        }
        case 'w:cr':
          out.push({ kind: 'break' });
          break;
        case 'w:drawing':
        case 'w:pict':
          readDrawing(node, para, out);
          break;
        case 'w:object':
          count('object');
          readDrawing(node, para, out);
          break;
        case 'w:footnoteReference':
          out.push(...readNote(footnotes, 'w:footnote', node.attrs['w:id']));
          break;
        case 'w:endnoteReference':
          out.push(...readNote(endnotes, 'w:endnote', node.attrs['w:id']));
          break;
        case 'w:commentReference':
          count('comment');
          break;
        case 'w:fldChar': {
          const type = node.attrs['w:fldCharType'];
          if (type === 'begin') fields.push({ instr: '', result: false });
          else if (type === 'separate' && fields.length > 0) {
            const field = fields[fields.length - 1];
            field.result = true;
            const target = field.instr.match(/^\s*HYPERLINK\s+"([^"]+)"/i)?.[1];
            if (target && !/\\l/.test(field.instr.split('"')[0]) && isSafeHref(target)) {
              field.href = target;
            }
          } else if (type === 'end') fields.pop();
          break;
        }
        case 'w:instrText':
          if (fields.length > 0) fields[fields.length - 1].instr += textContent(node);
          break;
        case 'mc:AlternateContent': {
          const choice = child(node, 'mc:Choice') ?? child(node, 'mc:Fallback');
          if (choice) readRun({ ...run, children: choice.children }, para, href, out);
          break;
        }
        case 'w:ruby':
          push(
            descendants(child(node, 'w:rubyBase') ?? node, 'w:t')
              .map(textContent)
              .join(''),
          );
          break;
        case 'w:sym': {
          const code = parseInt(node.attrs['w:char'] ?? '', 16);
          if (Number.isFinite(code))
            push(symbolText(String.fromCodePoint(code), true, node.attrs['w:font']));
          break;
        }
        case 'w:rPr':
        case 'w:delText':
          break;
        default:
          if (descendants(node, 'w:t').length > 0) {
            const rPr = child(run, 'w:rPr');
            readRun(
              { ...run, children: [...(rPr ? [rPr] : []), ...node.children] },
              para,
              href,
              out,
            );
          }
          break;
      }
    }
  }

  function readInline(node: XmlElement, para: Para, href: string | undefined, out: Atom[]) {
    for (const entry of node.children) {
      if (typeof entry === 'string') continue;
      switch (entry.name) {
        case 'w:r':
          readRun(entry, para, href, out);
          break;
        case 'w:hyperlink': {
          const rel = entry.attrs['r:id'] ? rels.get(entry.attrs['r:id']) : undefined;
          const target = rel?.external && isSafeHref(rel.target) ? rel.target : undefined;
          readInline(entry, para, target ?? href, out);
          break;
        }
        case 'w:ins':
        case 'w:moveTo':
          count('insertion');
          readInline(entry, para, href, out);
          break;
        case 'w:del':
        case 'w:moveFrom':
          count('deletion');
          break;
        case 'w:sdt':
          readInline(child(entry, 'w:sdtContent') ?? entry, para, href, out);
          break;
        case 'w:smartTag':
        case 'w:customXml':
        case 'w:fldSimple':
        case 'w:dir':
        case 'w:bdo':
          readInline(entry, para, href, out);
          break;
        case 'm:oMath':
        case 'm:oMathPara': {
          count('math', entry.name === 'm:oMathPara' ? 0 : 1);
          if (entry.name === 'm:oMathPara') {
            readInline(entry, para, href, out);
            break;
          }
          const value = descendants(entry, 'm:t').map(textContent).join('');
          textParts.push(value);
          out.push({ kind: 'text', value, fmt: { b: false, i: true, code: false }, size: 0 });
          break;
        }
        case 'mc:AlternateContent': {
          const choice = child(entry, 'mc:Choice') ?? child(entry, 'mc:Fallback');
          if (choice) readInline(choice, para, href, out);
          break;
        }
        case 'w:pPr':
          break;
        default:
          readInline(entry, para, href, out);
          break;
      }
    }
  }

  function readParagraph(p: XmlElement): Para {
    const pPr = child(p, 'w:pPr');
    const styleId = val(child(pPr, 'w:pStyle'));
    const direct = num(val(child(pPr, 'w:outlineLvl')));
    const numPr = child(pPr, 'w:numPr');
    const styled = chain(styleId);
    const numId = val(child(numPr, 'w:numId')) ?? styled.find((style) => style.numId)?.numId;
    // Word's "List Bullet 2" is level 0 of a list of its own, indented by its
    // style; the number in the name is the only sign that it is nested.
    const ilvl =
      num(val(child(numPr, 'w:ilvl'))) ??
      styled.find((style) => style.ilvl !== undefined)?.ilvl ??
      styled
        .map((style) => style.name.match(/^list\s*(?:bullet|number|continue)\s*([2-9])$/)?.[1])
        .map((n) => (n ? Number(n) - 1 : undefined))
        .find((n) => n !== undefined);
    const ind = child(pPr, 'w:ind');
    const jc = val(child(pPr, 'w:jc'));
    const heading = direct !== undefined && direct < 9 ? direct + 1 : headingOf(styleId);
    const role = roleOf(styleId);
    const list = listOf(numId, ilvl ?? 0);
    const para: Para = {
      atoms: [],
      indent: num(ind?.attrs['w:left'] ?? ind?.attrs['w:start']) ?? 0,
      align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : null,
      extra: [],
      ...(heading !== undefined ? { heading } : {}),
      ...(role ? { role } : {}),
      ...(list ? { list } : {}),
    };
    readInline(p, para, undefined, para.atoms);
    return para;
  }

  function readTable(tbl: XmlElement): Item[] {
    const rows = elements(tbl, 'w:tr');
    const cellsOf = (tr: XmlElement) =>
      elements(tr, 'w:tc').concat(
        elements(tr, 'w:sdt').flatMap((sdt) => elements(child(sdt, 'w:sdtContent') ?? sdt, 'w:tc')),
      );

    // A one-cell table is a box around prose — Word's (and open-doc's own
    // export's) way to draw a code panel or a callout — so its content is
    // read as blocks rather than as a table.
    const only = rows.length === 1 ? cellsOf(rows[0]) : [];
    if (only.length === 1) return readBlockItems(only[0]);

    const grid: Array<Array<{ inline: Inline[]; align: TableAlign }>> = [];
    for (const tr of rows) {
      const row: Array<{ inline: Inline[]; align: TableAlign }> = [];
      for (const tc of cellsOf(tr)) {
        const tcPr = child(tc, 'w:tcPr');
        const span = num(val(child(tcPr, 'w:gridSpan'))) ?? 1;
        const vMerge = child(tcPr, 'w:vMerge');
        const nested = descendants(tc, 'w:tbl').length;
        if (nested > 0) count('nestedTable', nested);
        const inline: Inline[] = [];
        let align: TableAlign = null;
        if (!(vMerge && val(vMerge) !== 'restart')) {
          for (const p of descendants(tc, 'w:p')) {
            const para = readParagraph(p);
            align ??= para.align;
            const content = toInline(para.atoms);
            if (content.length === 0) continue;
            if (inline.length > 0) inline.push({ type: 'break' });
            inline.push(...content);
          }
        } else {
          count('merged');
        }
        row.push({ inline, align });
        if (span > 1) count('merged', span - 1);
        for (let extra = 1; extra < span; extra++) row.push({ inline: [], align: null });
      }
      if (row.length > 0) grid.push(row);
    }
    if (grid.length === 0) return [];
    const width = Math.max(...grid.map((row) => row.length));
    const pad = (row: Array<{ inline: Inline[]; align: TableAlign }>) => [
      ...row,
      ...Array.from({ length: width - row.length }, () => ({ inline: [], align: null })),
    ];
    const [head, ...body] = grid.map(pad);
    const alignRow = body[0] ?? head;
    return [
      {
        kind: 'block',
        block: {
          type: 'table',
          head: head.map((cell) => cell.inline),
          rows: body.map((row) => row.map((cell) => cell.inline)),
          align: alignRow.map((cell) => cell.align),
        },
      },
    ];
  }

  function readBlockItems(container: XmlElement): Item[] {
    const items: Item[] = [];
    for (const node of container.children) {
      if (typeof node === 'string') continue;
      switch (node.name) {
        case 'w:p':
          items.push({ kind: 'para', para: readParagraph(node) });
          break;
        case 'w:tbl':
          items.push(...readTable(node));
          break;
        case 'w:sdt': {
          const gallery = descendants(child(node, 'w:sdtPr') ?? node, 'w:docPartGallery')[0];
          if (val(gallery)?.toLowerCase().includes('table of contents')) {
            counts.set('toc', 1);
            break;
          }
          items.push(...readBlockItems(child(node, 'w:sdtContent') ?? node));
          break;
        }
        case 'w:customXml':
        case 'w:ins':
        case 'w:moveTo':
          items.push(...readBlockItems(node));
          break;
        case 'w:altChunk':
          count('altChunk');
          break;
        default:
          break;
      }
    }
    return items;
  }

  const items = readBlockItems(body);
  const frontmatter: Record<string, string> = {};
  const titleAt = items.findIndex((item) => item.kind === 'para' && item.para.heading === 'title');
  const titleItem = items[titleAt];
  if (titleItem?.kind === 'para') {
    const title = plain(titleItem.para.atoms);
    if (title) frontmatter.title = title;
    // The cover prints the subtitle under the title, so the one right after
    // it moves there instead of repeating in the body.
    const next = items[titleAt + 1];
    if (next?.kind === 'para' && next.para.heading === 'subtitle') {
      const subtitle = plain(next.para.atoms);
      if (subtitle) frontmatter.subtitle = subtitle;
      items.splice(titleAt + 1, 1);
    }
  }
  const blocks = assemble(items, true);

  if (notes.length > 0) {
    blocks.push({ type: 'hr' });
    blocks.push({
      type: 'list',
      ordered: true,
      start: 1,
      items: notes.map((note) => [{ type: 'paragraph', children: note }]),
    });
  }

  const warnings: string[] = [];
  for (const [key, n] of counts) {
    if (n > 0) warnings.push(WARNINGS[key](n));
  }

  return { frontmatter, blocks, media, text: textParts.join(' '), warnings };
}

/** Text with tabs as spaces and the paragraph's own edges trimmed. */
function plain(atoms: Atom[]): string {
  return atoms
    .map((atom) => (atom.kind === 'text' ? atom.value : atom.kind === 'break' ? ' ' : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimAtoms(atoms: Atom[]): Atom[] {
  const out = atoms.map((atom) =>
    atom.kind === 'text' ? { ...atom, value: atom.value.replace(/\t/g, ' ') } : atom,
  );
  while (out.length > 0) {
    const head = out[0];
    if (head.kind === 'break') out.shift();
    else if (head.kind === 'text' && head.value.trimStart() === '') out.shift();
    else break;
  }
  while (out.length > 0) {
    const tail = out[out.length - 1];
    if (tail.kind === 'break') out.pop();
    else if (tail.kind === 'text' && tail.value.trimEnd() === '') out.pop();
    else break;
  }
  const head = out[0];
  if (head?.kind === 'text') out[0] = { ...head, value: head.value.trimStart() };
  const tail = out[out.length - 1];
  if (tail?.kind === 'text') out[out.length - 1] = { ...tail, value: tail.value.trimEnd() };
  return out;
}

function sameFmt(a: Fmt, b: Fmt): boolean {
  return a.b === b.b && a.i === b.i && a.code === b.code;
}

function toInline(raw: Atom[]): Inline[] {
  const atoms = trimAtoms(raw);
  const out: Inline[] = [];
  let i = 0;
  while (i < atoms.length) {
    const atom = atoms[i];
    if (atom.kind === 'text' && atom.href) {
      let j = i;
      while (j < atoms.length) {
        const next = atoms[j];
        if (next.kind !== 'text' || next.href !== atom.href) break;
        j++;
      }
      out.push({ type: 'link', href: atom.href, children: formatted(atoms.slice(i, j)) });
      i = j;
      continue;
    }
    let j = i;
    while (j < atoms.length) {
      const next = atoms[j];
      if (next.kind === 'text' && next.href) break;
      j++;
    }
    out.push(...formatted(atoms.slice(i, j)));
    i = j;
  }
  return out;
}

function formatted(atoms: Atom[]): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < atoms.length) {
    const atom = atoms[i];
    if (atom.kind === 'break') {
      out.push({ type: 'break' });
      i++;
      continue;
    }
    if (atom.kind === 'image') {
      out.push({ type: 'image', src: atom.src, alt: atom.alt });
      i++;
      continue;
    }
    let j = i;
    let value = '';
    while (j < atoms.length) {
      const next = atoms[j];
      if (next.kind !== 'text' || !sameFmt(next.fmt, atom.fmt)) break;
      value += next.value;
      j++;
    }
    i = j;
    // Bold or italic whitespace is just whitespace.
    if (value.trim() === '' || (!atom.fmt.code && !atom.fmt.b && !atom.fmt.i)) {
      pushText(out, value);
      continue;
    }
    if (atom.fmt.code) {
      out.push({ type: 'code', value });
      continue;
    }
    // Keep spaces at the edges outside the mark, as a person would type it.
    const lead = value.match(/^\s*/)?.[0] ?? '';
    const trail = value.match(/\s*$/)?.[0] ?? '';
    const core = value.slice(lead.length, value.length - trail.length);
    let node: Inline = { type: 'text', value: core };
    if (atom.fmt.i) node = { type: 'em', children: [node] };
    if (atom.fmt.b) node = { type: 'strong', children: [node] };
    pushText(out, lead);
    out.push(node);
    pushText(out, trail);
  }
  return out;
}

function pushText(out: Inline[], value: string) {
  if (value === '') return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.value += value;
  else out.push({ type: 'text', value });
}

/** Strips a typed bullet or number ("•⇥", "1⇥") that stands in for real list numbering. */
function typedMarker(para: Para): ListRef | undefined {
  const lead = para.atoms
    .filter((atom) => atom.kind === 'text')
    .map((atom) => (atom.kind === 'text' ? atom.value : ''))
    .join('')
    .slice(0, 12);
  const bullet = lead.match(BULLET_MARKER_RE);
  const number = bullet ? null : lead.match(NUMBER_MARKER_RE);
  const match = bullet ?? number;
  if (!match) return undefined;
  let strip = match[0].length;
  const atoms: Atom[] = [];
  for (const atom of para.atoms) {
    if (strip > 0 && atom.kind === 'text') {
      const take = Math.min(strip, atom.value.length);
      strip -= take;
      if (take < atom.value.length) atoms.push({ ...atom, value: atom.value.slice(take) });
      continue;
    }
    atoms.push(atom);
  }
  para.atoms = atoms;
  const level = Math.max(0, Math.min(8, Math.round(para.indent / 720) - 1));
  const start = number && /^\d+$/.test(number[1]) ? Number(number[1]) : 1;
  return { level, ordered: !bullet, start, key: 'typed' };
}

/**
 * Headings drawn by hand — bold, larger type, no heading style — which is how
 * many files and converters (macOS TextEdit among them) mark them. Used only
 * when the document has no styled heading at all.
 */
function inferHeadings(paras: Para[]) {
  const bySize = new Map<number, number>();
  for (const para of paras) {
    for (const atom of para.atoms) {
      if (atom.kind === 'text' && atom.size > 0) {
        bySize.set(atom.size, (bySize.get(atom.size) ?? 0) + atom.value.length);
      }
    }
  }
  const body = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!body) return;
  const candidates: Array<{ para: Para; size: number }> = [];
  for (const para of paras) {
    if (para.list || para.role) continue;
    const texts = para.atoms.filter(
      (atom): atom is Extract<Atom, { kind: 'text' }> =>
        atom.kind === 'text' && atom.value.trim() !== '',
    );
    const text = plain(para.atoms);
    if (texts.length === 0 || text.length > 120 || para.atoms.some((a) => a.kind === 'image')) {
      continue;
    }
    const size = Math.min(...texts.map((atom) => atom.size || body));
    const bold = texts.every((atom) => atom.fmt.b);
    if (size >= body * 1.3 || (bold && size >= body * 1.1)) candidates.push({ para, size });
  }
  const sizes = [...new Set(candidates.map((entry) => entry.size))].sort((a, b) => b - a);
  for (const { para, size } of candidates) {
    para.heading = Math.min(sizes.indexOf(size) + 1, 4);
    para.atoms = para.atoms.map((atom) =>
      atom.kind === 'text' ? { ...atom, fmt: { ...atom.fmt, b: false } } : atom,
    );
  }
}

function buildList(entries: Array<{ ref: ListRef; inline: Inline[]; extra: Block[] }>): Block[] {
  const out: Block[] = [];
  let i = 0;
  const build = (level: number): Block => {
    const head = entries[i];
    const items: Block[][] = [];
    while (i < entries.length) {
      const entry = entries[i];
      if (entry.ref.level < level) break;
      if (entry.ref.level === level) {
        if (items.length > 0 && entry.ref.ordered !== head.ref.ordered) break;
        items.push([
          ...(entry.inline.length > 0
            ? [{ type: 'paragraph', children: entry.inline } as Block]
            : []),
          ...entry.extra,
        ]);
        i++;
      } else {
        const nested = build(entry.ref.level);
        if (items.length === 0) items.push([]);
        items[items.length - 1].push(nested);
      }
    }
    return { type: 'list', ordered: head.ref.ordered, start: head.ref.start, items };
  };
  while (i < entries.length) out.push(build(entries[i].ref.level));
  return out;
}

function assemble(items: Item[], top = false): Block[] {
  const paras = items.flatMap((item) => (item.kind === 'para' ? [item.para] : []));
  for (const para of paras) {
    if (!para.list && para.heading === undefined && !para.role) {
      const typed = typedMarker(para);
      if (typed) para.list = typed;
    }
  }
  if (top && !paras.some((para) => para.heading !== undefined)) inferHeadings(paras);

  const blocks: Block[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind === 'block') {
      blocks.push(item.block);
      i++;
      continue;
    }
    const para = item.para;

    if (para.role === 'toc') {
      i++;
      continue;
    }

    if (para.heading !== undefined) {
      const children = toInline(para.atoms);
      i++;
      if (children.length > 0) {
        if (para.heading === 'subtitle') {
          blocks.push({ type: 'paragraph', children });
        } else {
          const level = para.heading === 'title' ? 1 : para.heading;
          blocks.push({ type: 'heading', level, children });
        }
      }
      blocks.push(...para.extra);
      continue;
    }

    if (para.list) {
      const entries: Array<{ ref: ListRef; inline: Inline[]; extra: Block[] }> = [];
      while (i < items.length) {
        const next = items[i];
        if (next.kind !== 'para' || !next.para.list || next.para.heading !== undefined) break;
        entries.push({
          ref: next.para.list,
          inline: toInline(next.para.atoms),
          extra: next.para.extra,
        });
        i++;
      }
      blocks.push(...buildList(entries));
      continue;
    }

    if (isCode(para)) {
      const lines: string[] = [];
      while (i < items.length) {
        const next = items[i];
        if (next.kind !== 'para' || !isCode(next.para) || next.para.list) break;
        lines.push(
          next.para.atoms
            .map((atom) => (atom.kind === 'text' ? atom.value : atom.kind === 'break' ? '\n' : ''))
            .join(''),
        );
        i++;
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      blocks.push({ type: 'code', lang: null, value: lines.join('\n') });
      continue;
    }

    if (para.role === 'quote') {
      const children: Block[] = [];
      while (i < items.length) {
        const next = items[i];
        if (next.kind !== 'para' || next.para.role !== 'quote') break;
        const inline = toInline(next.para.atoms);
        if (inline.length > 0) children.push({ type: 'paragraph', children: inline });
        children.push(...next.para.extra);
        i++;
      }
      if (children.length > 0) blocks.push({ type: 'quote', children });
      continue;
    }

    i++;
    const inline = toInline(para.atoms);
    const images = inline.filter((node) => node.type === 'image');
    const onlyImages =
      images.length > 0 &&
      inline.every((node) => node.type === 'image' || (node.type === 'text' && !node.value.trim()));
    if (onlyImages) {
      let caption = '';
      const next = items[i];
      if (images.length === 1 && next?.kind === 'para' && next.para.role === 'caption') {
        caption = plain(next.para.atoms);
        i++;
      }
      for (const image of images) {
        if (image.type !== 'image') continue;
        blocks.push({ type: 'figure', src: image.src, alt: caption || image.alt });
      }
    } else if (inline.length > 0) {
      blocks.push({ type: 'paragraph', children: inline });
    }
    blocks.push(...para.extra);
  }
  return blocks;
}

function isCode(para: Para): boolean {
  if (para.heading !== undefined) return false;
  if (para.role === 'code') return true;
  const texts = para.atoms.filter((atom) => atom.kind === 'text' && atom.value.trim() !== '');
  return (
    texts.length > 0 &&
    para.atoms.every((atom) => atom.kind !== 'image') &&
    texts.every((atom) => atom.kind === 'text' && atom.fmt.code)
  );
}

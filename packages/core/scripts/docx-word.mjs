// What a .docx says, read straight from its XML for the corpus harness —
// deliberately not through the importer, so the importer's mistakes cannot
// grade themselves. Only the XML tokenizer is shared.

import { strFromU8, unzipSync } from 'fflate';
import { child, descendants, elements, parseXml, textContent } from '../src/import/xml.ts';

const NS = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
  'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://purl.oclc.org/ooxml/drawingml/main': 'a',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
};

const OFF = new Set(['0', 'false', 'off', 'none']);
const toggle = (el) => (el ? !OFF.has((el.attrs['w:val'] ?? '').toLowerCase()) : undefined);
const val = (el) => el?.attrs['w:val'];

/** Run properties the format check compares, from one rPr element. */
function runProps(rPr) {
  if (!rPr) return {};
  const out = {};
  const sz = Number(val(child(rPr, 'w:sz')));
  if (Number.isFinite(sz) && sz > 0) out.sz = sz;
  const b = toggle(child(rPr, 'w:b'));
  if (b !== undefined) out.b = b;
  const i = toggle(child(rPr, 'w:i'));
  if (i !== undefined) out.i = i;
  const u = child(rPr, 'w:u');
  if (u) out.u = (val(u) ?? 'single') !== 'none';
  const color = val(child(rPr, 'w:color'));
  if (color) out.color = color.toLowerCase() === 'auto' ? '000000' : color.toUpperCase();
  const vanish = toggle(child(rPr, 'w:vanish'));
  if (vanish !== undefined) out.vanish = vanish;
  const vert = val(child(rPr, 'w:vertAlign'));
  if (vert) out.vert = vert !== 'baseline';
  return out;
}

export function readWord(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    return null;
  }
  const find = (re) => Object.keys(files).find((name) => re.test(name));
  const xml = (name) => (name && files[name] ? parseXml(strFromU8(files[name]), NS) : undefined);
  const document = xml(find(/(^|\/)document\.xml$/));
  if (!document) return null;
  const stylesXml = xml(find(/^word\/styles\.xml$/));

  const styles = new Map();
  let defaultParagraph;
  for (const el of stylesXml ? elements(stylesXml, 'w:style') : []) {
    const id = el.attrs['w:styleId'];
    if (!id) continue;
    if (el.attrs['w:type'] === 'paragraph' && el.attrs['w:default'] === '1') defaultParagraph = id;
    styles.set(id, {
      basedOn: val(child(el, 'w:basedOn')),
      jc: val(child(child(el, 'w:pPr'), 'w:jc')),
      r: runProps(child(el, 'w:rPr')),
    });
  }
  const defaults = child(stylesXml, 'w:docDefaults');
  const defaultRun = runProps(child(child(defaults, 'w:rPrDefault'), 'w:rPr'));
  const defaultJc = val(child(child(child(defaults, 'w:pPrDefault'), 'w:pPr'), 'w:jc'));
  const chain = (id) => {
    const out = [];
    let style = id ? styles.get(id) : undefined;
    while (style && out.length < 12 && !out.includes(style)) {
      out.unshift(style);
      style = style.basedOn ? styles.get(style.basedOn) : undefined;
    }
    return out;
  };

  const paragraphs = [];
  const tables = [];
  const tokens = [];
  const fonts = new Set();

  for (const rFonts of [
    ...descendants(document, 'w:rFonts'),
    ...(stylesXml ? descendants(stylesXml, 'w:rFonts') : []),
  ]) {
    for (const key of ['w:ascii', 'w:hAnsi', 'w:eastAsia'])
      if (rFonts.attrs[key]) fonts.add(rFonts.attrs[key]);
  }
  const theme = xml(find(/^word\/theme\/theme\d*\.xml$/));
  if (theme) {
    for (const el of [...descendants(theme, 'a:latin'), ...descendants(theme, 'a:ea')]) {
      if (el.attrs.typeface) fonts.add(el.attrs.typeface);
    }
  }

  const paragraph = (p, inTable) => {
    const pPr = child(p, 'w:pPr');
    const styleId = val(child(pPr, 'w:pStyle')) ?? defaultParagraph;
    const pChain = chain(styleId);
    let jc = defaultJc;
    for (const style of pChain) jc = style.jc ?? jc;
    jc = val(child(pPr, 'w:jc')) ?? jc;
    const markRun = Object.assign({}, defaultRun, ...pChain.map((style) => style.r));
    if (child(pPr, 'w:pageBreakBefore') && toggle(child(pPr, 'w:pageBreakBefore'))) {
      tokens.push({ mark: 'explicit' });
    }
    const runs = [];
    const walk = (node) => {
      for (const entry of node.children) {
        if (typeof entry === 'string') continue;
        const name = entry.name;
        if (name === 'w:del' || name === 'w:moveFrom' || name === 'w:pPr' || name === 'mc:Fallback')
          continue;
        if (name === 'w:txbxContent' || name === 'w:rt') continue;
        if (name === 'w:r') {
          const rPr = child(entry, 'w:rPr');
          const props = Object.assign(
            {},
            markRun,
            ...chain(val(child(rPr, 'w:rStyle'))).map((style) => style.r),
            runProps(rPr),
          );
          for (const piece of entry.children) {
            if (typeof piece === 'string') continue;
            if (piece.name === 'w:lastRenderedPageBreak') tokens.push({ mark: 'rendered' });
            else if (piece.name === 'w:br' && piece.attrs['w:type'] === 'page')
              tokens.push({ mark: 'explicit' });
            else if (piece.name === 'w:t' && !props.vanish) {
              const text = textContent(piece);
              tokens.push({ text });
              runs.push({ text, ...props });
            } else if (piece.name !== 'w:rPr' && piece.name !== 'w:t') walk({ children: [piece] });
          }
          continue;
        }
        walk(entry);
      }
    };
    walk(p);
    const text = runs.map((run) => run.text).join('');
    if (child(pPr, 'w:sectPr')) tokens.push({ mark: 'section' });
    if (text.trim()) paragraphs.push({ text, jc: jc ?? 'left', runs, inTable });
  };

  const table = (tbl, top) => {
    const grid = elements(child(tbl, 'w:tblGrid') ?? { children: [] }, 'w:gridCol').length;
    const rows = [];
    const collectRows = (node) => {
      for (const el of elements(node)) {
        if (el.name === 'w:tr') rows.push(el);
        else if (el.name === 'w:sdt' || el.name === 'w:customXml')
          collectRows(child(el, 'w:sdtContent') ?? el);
      }
    };
    collectRows(tbl);
    const cellsOf = (node) =>
      elements(node).flatMap((el) =>
        el.name === 'w:tc'
          ? [el]
          : el.name === 'w:sdt' || el.name === 'w:customXml'
            ? cellsOf(child(el, 'w:sdtContent') ?? el)
            : [],
      );
    let spans = 0;
    let merges = 0;
    for (const tr of rows) {
      for (const tc of cellsOf(tr)) {
        const tcPr = child(tc, 'w:tcPr');
        const vMerge = child(tcPr, 'w:vMerge');
        const continued = vMerge && val(vMerge) !== 'restart';
        // A merge's continuation cell is not printed; its span is the first cell's.
        if (!continued && Number(val(child(tcPr, 'w:gridSpan')) ?? 1) > 1) spans++;
        if (val(child(tcPr, 'w:vMerge')) === 'restart') merges++;
      }
    }
    if (top) tables.push({ rows: rows.length, grid, spans, merges });
    for (const tr of rows) for (const tc of cellsOf(tr)) block(tc, true);
  };

  const block = (container, inTable) => {
    for (const el of elements(container)) {
      if (el.name === 'w:p') paragraph(el, inTable);
      else if (el.name === 'w:tbl') table(el, !inTable);
      else if (['w:sdt', 'w:customXml', 'w:ins', 'w:moveTo'].includes(el.name)) {
        block(child(el, 'w:sdtContent') ?? el, inTable);
      }
    }
  };
  for (const body of elements(document, 'w:body')) block(body, false);

  const app = files['docProps/app.xml'] ? strFromU8(files['docProps/app.xml']) : '';
  return {
    paragraphs,
    tables,
    tokens,
    fonts: [...fonts],
    producer: app.match(/<Application>([^<]*)<\/Application>/)?.[1] ?? '',
    savedPages: Number(app.match(/<Pages>(\d+)<\/Pages>/)?.[1] ?? Number.NaN),
  };
}

/**
 * Where Word started each page when it last saved the file: the first dozen
 * characters after every recorded page break. Markers with no text between
 * them (a row breaking in every cell) are one page start.
 */
export function pageStarts(tokens) {
  const rendered = tokens.some((token) => token.mark === 'rendered');
  const kind = rendered ? 'rendered' : 'explicit';
  const starts = [];
  let pending = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.mark === kind || (!rendered && token.mark === 'section')) {
      pending = true;
      continue;
    }
    if (!pending || token.text === undefined || !token.text.replace(/\s/g, '')) continue;
    let snippet = '';
    for (let j = i; j < tokens.length && snippet.length < 12; j++) {
      if (tokens[j].text) snippet += tokens[j].text.replace(/\s/g, '');
    }
    starts.push(snippet.slice(0, 12));
    pending = false;
  }
  return { kind, starts };
}

#!/usr/bin/env node
// Regression and fidelity harness for Word import. For every .docx under a
// folder (one file per sub-folder is fine) it imports the file into a scratch
// copy of the e2e fixture, renders it headlessly, and measures it against the
// .docx itself — read by docx-word.mjs, not by the importer:
//
//   content     characters missing from or added to document.xml's text, and order
//   format      alignment, run size/bold/italic/underline/colour and table shape,
//               read from the computed styles of the printed pages
//   pagination  where Word last laid out each page (w:lastRenderedPageBreak)
//               against the page the same text lands on here
//   check       `open-doc check` errors
//
// Third-party files stay outside the repo; point this at them.
//
//   pnpm core build && node packages/core/scripts/docx-corpus.mjs <folder> [--report out.md] [--plain] [--no-check]

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { prepareScratchProject } from '../e2e/scratch.mjs';
import { pageStarts, readWord } from './docx-word.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin.js');
const args = process.argv.slice(2);
const corpus = args.find((arg) => !arg.startsWith('--'));
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
const flags = args.filter((arg) => arg === '--plain');
if (!corpus) {
  process.stderr.write('usage: docx-corpus.mjs <folder> [--report out.md] [--plain]\n');
  process.exit(2);
}

const WORD_RE = /\.(docx|docm|dotx|dotm)$/i;
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (WORD_RE.test(name)) out.push(full);
  }
  return out;
}

/** What Word prints from document.xml, read with plain regexes rather than the importer. */
function wordText(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    return null;
  }
  const main = Object.keys(files).find((name) => /(^|\/)document\.xml$/.test(name));
  if (!main) return null;
  // Text a style hides (an HTML form's "Top of Form") is not printed either.
  const stylesName = Object.keys(files).find((name) => /(^|\/)styles\.xml$/.test(name));
  const hidden = new Set();
  if (stylesName) {
    for (const m of strFromU8(files[stylesName]).matchAll(
      /<(?:\w+:)?style\b[^>]*?styleId="([^"]+)"[\s\S]*?<\/(?:\w+:)?style>/g,
    )) {
      if (/<(?:\w+:)?vanish\s*\/>/.test(m[0])) hidden.add(m[1]);
    }
  }
  const styledHidden = (fragment) =>
    [...fragment.matchAll(/<(?:\w+:)?[pr]Style (?:\w+:)?val="([^"]+)"/g)].some((m) =>
      hidden.has(m[1]),
    );
  const xml = strFromU8(files[main])
    .replace(/<(\w+:)?p\b[^>]*>[\s\S]*?<\/\1?p>/g, (p) => {
      const pStyle = p.match(/<(?:\w+:)?pStyle (?:\w+:)?val="([^"]+)"/)?.[1];
      if (pStyle && hidden.has(pStyle)) return '';
      return p.replace(/<(\w+:)?r\b[^>]*>[\s\S]*?<\/\1?r>/g, (r) => (styledHidden(r) ? '' : r));
    })
    .replace(/<mc:Fallback\b[^>]*>[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<(\w+:)?(del|moveFrom)\b[^>]*>[\s\S]*?<\/\1?\2>/g, '')
    .replace(/<(\w+:)?r\b[^>]*>(?:(?!<\/\1?r>)[\s\S])*?<\1?vanish\/>[\s\S]*?<\/\1?r>/g, '');
  // Notes print too; their text lives in its own parts.
  const notes = Object.keys(files)
    .filter((name) => /(^|\/)(footnotes|endnotes)\.xml$/.test(name))
    .map((name) => strFromU8(files[name]))
    .join('');
  return [...`${xml}${notes}`.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** The JSX text of the generated flow sections; text Word never stored is left out. */
function sourceText(source) {
  const start = source.indexOf('const Section1');
  let body = start === -1 ? source : source.slice(start, source.indexOf('export const meta'));
  // A generated span holds no tags of its own beyond <sup>/<span>, so a lazy match is enough.
  body = body
    .replace(/<span[^>]*data-od-generated=""[^>]*>[\s\S]*?<\/span>(?:<\/sup>)?/g, '')
    .replace(/const Section\d+ = flow\(|^\s*\{ padding:.*$|^\s*\);$|<\/>,/gm, '');
  // Escaped characters ({'<'}) come back after the tags are stripped, or a
  // literal < would swallow the text up to the next tag.
  const kept = [];
  return (
    body
      .replace(/\{'((?:\\'|[^'])*)'\}/g, (_, s) => {
        kept.push(s.replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\t/g, '\t'));
        return `${kept.length - 1}`;
      })
      // A drawn checkbox stands for the box character Word typed.
      .replace(/<Checkbox\b[^>]*\/>/g, '□')
      .replace(/<[^>]*>/g, '')
      .replace(/(\d+)/g, (_, n) => kept[Number(n)])
      .replace(/&amp;/g, '&')
  );
}

function multisetGap(expected, actual) {
  const have = new Map();
  for (const char of actual) if (char.trim()) have.set(char, (have.get(char) ?? 0) + 1);
  let missing = '';
  for (const char of expected) {
    if (!char.trim()) continue;
    const n = have.get(char) ?? 0;
    if (n > 0) have.set(char, n - 1);
    else missing += char;
  }
  let extra = '';
  for (const [char, n] of have) if (n > 0) extra += char.repeat(Math.min(n, 3));
  const extraCount = [...have.values()].reduce((a, b) => a + b, 0);
  return { missing, extra, extraCount };
}

/** Share of 8-character pieces of the source found in the output in the same order. */
function orderRatio(expected, actual) {
  const a = expected.replace(/\s/g, '');
  const b = actual.replace(/\s/g, '');
  if (a.length < 8) return 1;
  let cursor = 0;
  let found = 0;
  let total = 0;
  for (let i = 0; i + 8 <= a.length; i += 8) {
    total++;
    const at = b.indexOf(a.slice(i, i + 8), cursor);
    if (at !== -1) {
      found++;
      cursor = at + 8;
    }
  }
  return total ? found / total : 1;
}

/** Runs in the page: reads the print copy back as text, blocks, runs, tables and fonts. */
function dumpPrintCopy(fontNames) {
  const pages = [...document.querySelectorAll('.od-print-page')];
  // Text the import made up, and the header and footer every sheet repeats.
  const generated = (node) =>
    !!node.parentElement?.closest('[data-od-generated], [data-od-running]');
  const pageTexts = [];
  const blocks = [];
  const tables = new Map();
  pages.forEach((page, index) => {
    let pageText = '';
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!generated(node)) pageText += node.textContent;
    }
    pageTexts.push(pageText.replace(/\s+/g, ''));
    for (const el of page.querySelectorAll('p, h1, h2, h3, h4, h5, h6')) {
      const runs = [];
      const inner = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = inner.nextNode(); node; node = inner.nextNode()) {
        const text = node.textContent;
        if (!text.trim() || generated(node) || node.parentElement.closest('rt')) continue;
        const parent = node.parentElement;
        const cs = getComputedStyle(parent);
        let underline = false;
        for (let a = parent; a && a !== el.parentElement; a = a.parentElement) {
          if (getComputedStyle(a).textDecorationLine.includes('underline')) underline = true;
        }
        runs.push({
          text,
          size: Number.parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight),
          italic: cs.fontStyle === 'italic',
          underline,
          color: cs.color,
          vert: !!parent.closest('sup, sub'),
        });
      }
      const cs = getComputedStyle(el);
      blocks.push({
        page: index + 1,
        text: runs.map((run) => run.text).join(''),
        align: cs.textAlign,
        direction: cs.direction,
        runs,
      });
    }
    for (const table of page.querySelectorAll('table[data-od-source-table]')) {
      const id = table.getAttribute('data-od-source-table');
      const entry = tables.get(id) ?? {
        rows: new Set(),
        grid: 0,
        spans: 0,
        merges: 0,
        seen: new Set(),
        edges: {},
      };
      entry.grid = Math.max(entry.grid, table.querySelectorAll(':scope > colgroup > col').length);
      const rows = [...table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr')];
      rows.forEach((tr, r) => {
        const source = tr.getAttribute('data-od-source-row');
        entry.rows.add(source);
        if (entry.seen.has(source)) return;
        entry.seen.add(source);
        for (const td of tr.children) {
          if (td.colSpan > 1) entry.spans++;
          if (td.rowSpan > 1) entry.merges++;
        }
        const has = (td, side) => {
          const s = getComputedStyle(td);
          return (
            s[`border${side}Style`] !== 'none' && Number.parseFloat(s[`border${side}Width`]) > 0
          );
        };
        const cells = [...tr.children];
        if (r === 0 && cells.some((td) => has(td, 'Top'))) entry.edges.top = true;
        if (r === rows.length - 1 && cells.some((td) => has(td, 'Bottom')))
          entry.edges.bottom = true;
        if (cells[0] && has(cells[0], 'Left')) entry.edges.left = true;
        if (cells.at(-1) && has(cells.at(-1), 'Right')) entry.edges.right = true;
      });
      tables.set(id, entry);
    }
  });

  // A font is here if drawing with it differs from drawing with the fallbacks alone.
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 60;
  const ctx = canvas.getContext('2d');
  const print = (family) => {
    ctx.clearRect(0, 0, 160, 60);
    ctx.font = `40px ${family}`;
    ctx.fillText('永Ag國', 2, 48);
    const data = ctx.getImageData(0, 0, 160, 60).data;
    let h = 0;
    for (let i = 3; i < data.length; i += 4) h = (h * 31 + data[i]) >>> 0;
    return h;
  };
  const fonts = {};
  for (const name of fontNames) {
    const quoted = `"${name.replace(/"/g, '')}"`;
    fonts[name] =
      print(`${quoted}, monospace`) !== print('monospace') ||
      print(`${quoted}, serif`) !== print('serif');
  }

  return {
    pageCount: pages.length,
    pageTexts,
    blocks,
    tables: [...tables].map(([id, t]) => ({
      id: Number(id),
      rows: t.rows.size,
      grid: t.grid,
      spans: t.spans,
      merges: t.merges,
      edges: t.edges,
    })),
    fonts,
  };
}

const ALIGN = (value, rtl) => {
  const v = (value ?? 'left').toLowerCase();
  if (v === 'center') return 'center';
  if (v === 'both' || v === 'distribute' || v === 'justify' || v.startsWith('thai'))
    return 'justify';
  if (v === 'right' || v === 'end') return rtl && v === 'end' ? 'end' : 'right';
  return 'left';
};
const rgbHex = (css) => {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m
    ? m
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    : '';
};
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

/** Compares what the XML says with what printed, paragraph by paragraph. */
function compareFormat(word, rendered) {
  const tally = {};
  const worst = [];
  const score = (property, ok, detail) => {
    tally[property] ??= { ok: 0, total: 0 };
    tally[property].total++;
    if (ok) tally[property].ok++;
    else if (worst.length < 400) worst.push(`${property}: ${detail}`);
  };
  const squash = (text) => text.replace(/\s/g, '');
  let cursor = 0;
  let matched = 0;
  for (const para of word.paragraphs) {
    const target = squash(para.text);
    if (!target) continue;
    let found = -1;
    for (let k = cursor; k < Math.min(rendered.blocks.length, cursor + 80); k++) {
      if (squash(rendered.blocks[k].text) === target) {
        found = k;
        break;
      }
    }
    if (found === -1) continue;
    matched++;
    cursor = found + 1;
    const block = rendered.blocks[found];
    const expectedAlign = ALIGN(para.jc);
    const renderedAlign = ALIGN(block.align === 'start' ? 'left' : block.align);
    score(
      'align',
      expectedAlign === renderedAlign,
      `"${target.slice(0, 20)}" ${expectedAlign} → ${renderedAlign}`,
    );

    // Character offsets line the XML's runs up with the printed text nodes.
    const offsets = [];
    let at = 0;
    for (const run of block.runs) {
      const len = squash(run.text).length;
      offsets.push([at, at + len, run]);
      at += len;
    }
    let pos = 0;
    for (const run of para.runs) {
      const len = squash(run.text).length;
      if (len === 0 || run.vert) {
        pos += len;
        continue;
      }
      const hit = offsets.find(([s, e]) => pos >= s && pos < e);
      pos += len;
      if (!hit) continue;
      const r = hit[2];
      if (r.vert) continue;
      const label = `"${squash(run.text).slice(0, 16)}"`;
      const size = (run.sz ?? 20) / 2;
      score(
        'size',
        near(r.size * 0.75, size, 0.5),
        `${label} ${size}pt → ${(r.size * 0.75).toFixed(1)}pt`,
      );
      score('bold', !!run.b === r.weight >= 600, `${label} ${!!run.b} → ${r.weight}`);
      score('italic', !!run.i === r.italic, `${label} ${!!run.i} → ${r.italic}`);
      score('underline', !!run.u === r.underline, `${label} ${!!run.u} → ${r.underline}`);
      const color = run.color ?? '000000';
      score('color', color === rgbHex(r.color), `${label} #${color} → #${rgbHex(r.color)}`);
    }
  }
  const total = word.paragraphs.filter((p) => squash(p.text)).length;
  for (const table of word.tables.map((t, id) => ({ ...t, id }))) {
    const got = rendered.tables.find((t) => t.id === table.id);
    if (!got) {
      score('table', false, `table ${table.id} not printed`);
      continue;
    }
    score('table rows', got.rows === table.rows, `table ${table.id} ${table.rows} → ${got.rows}`);
    score(
      'table grid',
      got.grid === table.grid || table.grid === 0,
      `table ${table.id} ${table.grid} → ${got.grid}`,
    );
    score(
      'table spans',
      got.spans === table.spans,
      `table ${table.id} ${table.spans} → ${got.spans}`,
    );
    score(
      'table merges',
      got.merges === table.merges,
      `table ${table.id} ${table.merges} → ${got.merges}`,
    );
  }
  return { tally, worst, matched, total };
}

/** Where each page Word recorded starts here, and how far it lands from Word's page. */
function comparePagination(word, rendered) {
  const isWord = /microsoft/i.test(word.producer);
  const { kind, starts } = pageStarts(word.tokens);
  // Word records page starts as it saves; with none recorded, only a file Word
  // itself says is one page long is a reference.
  const onePage = word.savedPages === 1 && starts.length === 0;
  if (!(kind === 'rendered' && starts.length > 0) && !(isWord && onePage))
    return { reference: false };
  const wordPages = starts.length + 1;
  const pages = rendered.pageTexts;
  const offsets = [];
  let page = 0;
  let pos = 0;
  starts.forEach((snippet, index) => {
    if (snippet.length < 4) return;
    for (let p = page; p < pages.length; p++) {
      const at = pages[p].indexOf(snippet, p === page ? pos : 0);
      if (at !== -1) {
        offsets.push(p + 1 - (index + 2));
        page = p;
        pos = at + 1;
        return;
      }
      // A page start can open a page with its first characters still on the previous one.
      if (
        p + 1 < pages.length &&
        `${pages[p]}${pages[p + 1]}`.indexOf(snippet, p === page ? pos : 0) !== -1
      ) {
        offsets.push(p + 2 - (index + 2));
        page = p + 1;
        pos = 0;
        return;
      }
    }
    offsets.push(null);
  });
  return {
    reference: true,
    kind,
    wordPages,
    savedPages: word.savedPages,
    ourPages: rendered.pageCount,
    offsets,
  };
}

const pairs = (offsets) => {
  const out = [];
  for (let i = 0; i + 1 < offsets.length; i++) {
    if (offsets[i] !== null && offsets[i + 1] !== null) out.push([offsets[i], offsets[i + 1]]);
  }
  return out;
};

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// ---------------------------------------------------------------- import
const workspace = prepareScratchProject('docx-corpus');
const rows = [];
for (const file of collect(corpus)) {
  const rel = path.relative(corpus, file);
  const name = rel.replace(/\/file\.(docx|docm|dotx|dotm)$/i, '').replace(WORD_RE, '');
  const id = `c-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`.slice(0, 60);
  const ext = path.extname(file);
  copyFileSync(file, path.join(workspace, `${id}${ext}`));
  const run = spawnSync(process.execPath, [bin, 'import', `${id}${ext}`, '--id', id, ...flags], {
    cwd: workspace,
    encoding: 'utf8',
  });
  const word = readWord(new Uint8Array(readFileSync(file)));
  const row = { name, id, import: 'ok', message: '', errors: 0, word };
  const output = `${run.stdout}${run.stderr}`;
  if (run.status !== 0) {
    const crashed =
      /\n\s+at |TypeError|RangeError|ReferenceError|SyntaxError|Maximum call stack/.test(output);
    row.import = crashed ? 'CRASH' : 'refused';
    row.message = output
      .trim()
      .split('\n')
      .slice(0, crashed ? 6 : 1)
      .join(' | ');
  } else if (word) {
    const source = readFileSync(path.join(workspace, 'docs', id, 'index.tsx'), 'utf8');
    const boxes = (text) => text.replace(/[☐☑☒]/g, '□');
    const expected = boxes(wordText(new Uint8Array(readFileSync(file))) ?? '');
    const actual = boxes(sourceText(source));
    const gap = multisetGap(expected, actual);
    row.content = {
      ...gap,
      order: orderRatio(expected, actual),
      chars: expected.replace(/\s/g, '').length,
    };
  }
  rows.push(row);
  process.stderr.write(`${row.import.padEnd(7)} ${name}\n`);
}
const imported = rows.filter((row) => row.import === 'ok');

// ---------------------------------------------------------------- render
async function renderAll() {
  const { chromium } = await import('playwright');
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = spawn(
    process.execPath,
    [bin, 'dev', '--port', String(port), '--no-skills-check'],
    {
      cwd: workspace,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const origin = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const browser = await chromium.launch();
  try {
    for (const row of imported) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
      try {
        await page.goto(`${origin}/d/${row.id}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__openDoc?.status().ready, null, {
          timeout: 180000,
        });
        await page.evaluate(() => window.__openDoc.preparePrint());
        row.rendered = await page.evaluate(dumpPrintCopy, row.word?.fonts ?? []);
        await page.evaluate(() => window.__openDoc.releasePrint());
      } catch (err) {
        row.renderError = String(err).split('\n')[0];
      } finally {
        await page.close();
      }
      process.stderr.write(`render  ${row.name}\n`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}
await renderAll();

for (const row of imported) {
  if (!row.rendered || !row.word) continue;
  row.format = compareFormat(row.word, row.rendered);
  row.pagination = comparePagination(row.word, row.rendered);
  const missingFonts = Object.entries(row.rendered.fonts)
    .filter(([, ok]) => !ok)
    .map(([font]) => font);
  row.missingFonts = missingFonts;
}

// ---------------------------------------------------------------- check
if (imported.length > 0 && !args.includes('--no-check')) {
  const check = spawnSync(
    process.execPath,
    [bin, 'check', ...imported.map((row) => row.id), '--json'],
    {
      cwd: workspace,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  try {
    const reports = JSON.parse(check.stdout.slice(check.stdout.indexOf('[')));
    reports.forEach((report, index) => {
      const row = imported[index];
      row.errors = report.errors;
      row.findings = report.findings
        .filter((finding) => finding.severity === 'error')
        .map((finding) => `p.${finding.page} ${finding.message}`)
        .slice(0, 3);
    });
  } catch {
    process.stderr.write(`check failed:\n${check.stdout}${check.stderr}\n`);
  }
}

// ---------------------------------------------------------------- report
const pct = (ok, total) => (total ? `${((100 * ok) / total).toFixed(1)}%` : '–');

function summarize(group) {
  const ok = group.filter((row) => row.import === 'ok');
  const content = ok.filter((row) => row.content);
  const props = {};
  for (const row of ok) {
    for (const [key, { ok: good, total }] of Object.entries(row.format?.tally ?? {})) {
      props[key] ??= { ok: 0, total: 0 };
      props[key].ok += good;
      props[key].total += total;
    }
  }
  const refs = ok.filter((row) => row.pagination?.reference);
  const offsets = refs.flatMap((row) => row.pagination.offsets);
  const placed = offsets.filter((o) => o !== null);
  return {
    files: group.length,
    imported: ok.length,
    crashes: group.filter((row) => row.import === 'CRASH').length,
    contentClean: content.filter((row) => !row.content.missing).length,
    contentFiles: content.length,
    missing: content.reduce((sum, row) => sum + row.content.missing.length, 0),
    extra: content.reduce((sum, row) => sum + row.content.extraCount, 0),
    order: content.length
      ? content.reduce((sum, row) => sum + row.content.order, 0) / content.length
      : 1,
    props,
    refs: refs.length,
    pageCountMatch: refs.filter((row) => row.pagination.wordPages === row.pagination.ourPages)
      .length,
    starts: offsets.length,
    startsSame: placed.filter((o) => o === 0).length,
    // A page as long as Word's: the next recorded start lands one page on,
    // whatever shift came before — robust to one early difference.
    steps: refs.reduce((sum, row) => sum + pairs(row.pagination.offsets).length, 0),
    stepsSame: refs.reduce(
      (sum, row) => sum + pairs(row.pagination.offsets).filter(([a, b]) => a === b).length,
      0,
    ),
    startsNotFound: offsets.length - placed.length,
    medianOffset: median(placed.map(Math.abs)),
    maxOffset: placed.length ? Math.max(...placed.map(Math.abs)) : 0,
    fontLimited: refs.filter((row) => row.missingFonts?.length).length,
    checkErrors: ok.filter((row) => row.errors > 0).length,
  };
}

function summaryTable(label, s) {
  const lines = [
    `### ${label}`,
    '',
    `| measure | value |`,
    `|---|---|`,
    `| files / imported / crashes | ${s.files} / ${s.imported} / ${s.crashes} |`,
    `| content: files with no missing character | ${s.contentClean}/${s.contentFiles} (${s.missing} missing, ${s.extra} extra chars in all) |`,
    `| content: order (8-char pieces in order) | ${(100 * s.order).toFixed(1)}% |`,
  ];
  for (const [key, { ok, total }] of Object.entries(s.props).sort()) {
    lines.push(`| format: ${key} | ${pct(ok, total)} (${ok}/${total}) |`);
  }
  lines.push(
    `| pagination: files with Word's page records | ${s.refs} (${s.fontLimited} use a font not installed here) |`,
    `| pagination: page count matches | ${pct(s.pageCountMatch, s.refs)} (${s.pageCountMatch}/${s.refs}) |`,
    `| pagination: page starts on the same page | ${pct(s.startsSame, s.starts)} (${s.startsSame}/${s.starts}, ${s.startsNotFound} not found) |`,
    `| pagination: page-start offset median / max | ${s.medianOffset} / ${s.maxOffset} |`,
    `| pagination: pages as long as Word's (consecutive starts one page apart) | ${pct(s.stepsSame, s.steps)} (${s.stepsSame}/${s.steps}) |`,
    `| check: files with errors | ${s.checkErrors} |`,
  );
  return lines.join('\n');
}

const all = summarize(rows);
const tw = summarize(rows.filter((row) => /^(tw|nycu)-/.test(row.name)));
const out = [
  '# Word import fidelity',
  '',
  summaryTable('All files', all),
  '',
  summaryTable('Taiwanese files (tw-*, nycu-*)', tw),
  '',
  '## Per file',
  '',
  '| file | import | content missing / extra / order | format (align, size, bold, colour) | pages ours / Word (saved) | starts same / total, max off | fonts missing | check |',
  '|---|---|---|---|---|---|---|---|',
];
let failed = 0;
for (const row of rows) {
  const bad = row.import === 'CRASH' || row.content?.missing || row.errors > 0;
  if (bad) failed++;
  if (row.import !== 'ok') {
    out.push(`| ${row.name} | ${row.import}: ${row.message.slice(0, 100)} | | | | | | |`);
    continue;
  }
  const c = row.content;
  const t = row.format?.tally ?? {};
  const f = (k) => (t[k] ? pct(t[k].ok, t[k].total) : '–');
  const g = row.pagination;
  const pages = g?.reference
    ? `${g.ourPages} / ${g.wordPages} (${Number.isNaN(g.savedPages) ? '?' : g.savedPages})`
    : `${row.rendered?.pageCount ?? '?'} / no reference`;
  const placed = g?.reference ? g.offsets.filter((o) => o !== null) : [];
  const starts = g?.reference
    ? `${placed.filter((o) => o === 0).length}/${g.offsets.length}, ${placed.length ? Math.max(...placed.map(Math.abs)) : 0} [${g.offsets.map((o) => (o === null ? '?' : o)).join(' ')}]`
    : '';
  out.push(
    `| ${row.name} | ok${row.renderError ? ` (render: ${row.renderError.slice(0, 60)})` : ''} | ${c ? `${c.missing.length} / ${c.extraCount} / ${(100 * c.order).toFixed(0)}%` : ''} | ${f('align')}, ${f('size')}, ${f('bold')}, ${f('color')} | ${pages} | ${starts} | ${(row.missingFonts ?? []).slice(0, 4).join(', ')} | ${row.errors}${row.findings?.length ? ` ${row.findings[0]}` : ''} |`,
  );
}
out.push('', '## Worst format mismatches', '');
for (const row of imported) {
  const worst = row.format?.worst ?? [];
  if (worst.length === 0) continue;
  out.push(`- **${row.name}**: ${worst.slice(0, 8).join('; ')}`);
}
out.push('', `${rows.length} files, ${failed} failing`);
const text = `${out.join('\n')}\n`;
if (reportPath) writeFileSync(reportPath, text);
process.stdout.write(text);
process.exitCode = failed > 0 ? 1 : 0;

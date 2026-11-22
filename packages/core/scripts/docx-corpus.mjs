#!/usr/bin/env node
// Regression harness for Word import. For every .docx under a folder (one
// file per sub-folder is fine), imports it into a scratch copy of the e2e
// fixture and reports: did the import succeed or refuse with a message,
// which characters of document.xml are missing from the generated document,
// and how many errors `open-doc check` finds. Third-party files stay outside
// the repo; point this at them.
//
//   pnpm core build && node packages/core/scripts/docx-corpus.mjs <folder> [--plain]

import { spawnSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { prepareScratchProject } from '../e2e/scratch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin.js');
const [corpus, ...flags] = process.argv.slice(2);
if (!corpus) {
  process.stderr.write('usage: docx-corpus.mjs <folder> [--plain]\n');
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
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<(\w+:)?(del|moveFrom)\b[^>]*>[\s\S]*?<\/\1?\2>/g, '')
    .replace(/<(\w+:)?r\b[^>]*>(?:(?!<\/\1?r>)[\s\S])*?<\1?vanish\/>[\s\S]*?<\/\1?r>/g, '');
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function sourceText(source) {
  const start = source.indexOf('const Section1');
  const body = start === -1 ? source : source.slice(start, source.indexOf('export const meta'));
  // Escaped characters ({'<'}) come back after the tags are stripped, or a
  // literal < would swallow the text up to the next tag.
  const kept = [];
  return body
    .replace(/\{'((?:\\'|[^'])*)'\}/g, (_, s) => {
      kept.push(s.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
      return `\uE000${kept.length - 1}\uE000`;
    })
    .replace(/<[^>]*>/g, '')
    .replace(/\uE000(\d+)\uE000/g, (_, n) => kept[Number(n)])
    .replace(/&amp;/g, '&');
}

function missing(expected, actual) {
  const have = new Map();
  for (const char of actual) if (char.trim()) have.set(char, (have.get(char) ?? 0) + 1);
  let out = '';
  for (const char of expected) {
    if (!char.trim()) continue;
    const n = have.get(char) ?? 0;
    if (n > 0) have.set(char, n - 1);
    else out += char;
  }
  return out;
}

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
  const row = { name, id, import: 'ok', message: '', missing: '', errors: 0 };
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
  } else {
    const expected = wordText(new Uint8Array(readFileSync(file)));
    const source = readFileSync(path.join(workspace, 'docs', id, 'index.tsx'), 'utf8');
    if (expected) row.missing = missing(expected, sourceText(source));
  }
  rows.push(row);
  process.stderr.write(`${row.import.padEnd(7)} ${name}\n`);
}

const imported = rows.filter((row) => row.import === 'ok');
if (imported.length > 0) {
  const check = spawnSync(
    process.execPath,
    [bin, 'check', ...imported.map((row) => row.id), '--json'],
    { cwd: workspace, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  try {
    const reports = JSON.parse(check.stdout.slice(check.stdout.indexOf('[')));
    reports.forEach((report, index) => {
      const row = imported[index];
      row.errors = report.errors;
      row.pages = report.pageCount;
      row.findings = report.findings
        .filter((finding) => finding.severity === 'error')
        .map((finding) => `p.${finding.page} ${finding.message}`)
        .slice(0, 3);
    });
  } catch {
    process.stderr.write(`check failed:\n${check.stdout}${check.stderr}\n`);
  }
}

let failed = 0;
process.stdout.write(
  '| file | import | pages | missing chars | check errors |\n|---|---|---|---|---|\n',
);
for (const row of rows) {
  const bad = row.import === 'CRASH' || row.missing || row.errors > 0;
  if (bad) failed++;
  const missingText = row.missing ? `${row.missing.length}: ${row.missing.slice(0, 40)}` : '0';
  const note = row.import === 'ok' ? '' : ` (${row.message.slice(0, 120)})`;
  process.stdout.write(
    `| ${row.name} | ${row.import}${note} | ${row.pages ?? ''} | ${row.import === 'ok' ? missingText : ''} | ${row.import === 'ok' ? row.errors : ''}${row.findings?.length ? ` ${row.findings.join('; ')}` : ''} |\n`,
  );
}
process.stdout.write(`\n${rows.length} files, ${failed} failing\n`);
process.exitCode = failed > 0 ? 1 : 0;

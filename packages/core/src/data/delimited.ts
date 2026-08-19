export type CellValue = string | number | null;

export type DelimitedTable = {
  columns: string[];
  rows: Array<Record<string, CellValue>>;
};

export type ParseOptions = {
  /** Defaults to `,`. Tabs for `.tsv`. */
  delimiter?: string;
  /** Treat the first row as data and name columns `column1`, `column2`, … */
  noHeader?: boolean;
};

/**
 * RFC 4180 with the parts that actually show up in exported data: quoted
 * fields, doubled quotes inside them, embedded newlines, and CRLF.
 *
 * Hand-written because `core` ships to every user and a CSV dependency is a lot
 * of install size for something a report needs in one place.
 */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = () => {
    endField();
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        quoted = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === delimiter) {
      endField();
      continue;
    }
    if (char === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
      continue;
    }
    if (char === '\n') {
      endRow();
      continue;
    }
    field += char;
    started = true;
  }

  // A file ending in a newline must not produce a trailing empty record.
  if (field !== '' || row.length > 0) endRow();
  return records;
}

/** Numbers stay numbers so a table can align and format them; nothing else is guessed at. */
export function coerce(raw: string): CellValue {
  const value = raw.trim();
  if (value === '') return null;
  if (/^-?(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?$/.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

export function parseDelimited(text: string, opts: ParseOptions = {}): DelimitedTable {
  const delimiter = opts.delimiter ?? ',';
  const records = splitRecords(text.replace(/^﻿/, ''), delimiter).filter(
    (record) => record.length > 1 || (record[0] ?? '') !== '',
  );
  if (records.length === 0) return { columns: [], rows: [] };

  const header = opts.noHeader
    ? records[0].map((_, index) => `column${index + 1}`)
    : records[0].map((name, index) => name.trim() || `column${index + 1}`);
  const body = opts.noHeader ? records : records.slice(1);

  const rows = body.map((record) => {
    const row: Record<string, CellValue> = {};
    header.forEach((name, index) => {
      row[name] = coerce(record[index] ?? '');
    });
    return row;
  });

  return { columns: header, rows };
}

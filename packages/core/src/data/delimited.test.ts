import { describe, expect, it } from 'vitest';
import { coerce, parseDelimited } from './delimited.ts';

describe('parseDelimited', () => {
  it('reads a header row and coerces numbers', () => {
    const table = parseDelimited('service,requests,p99\ncheckout,18402111,412\n');
    expect(table.columns).toEqual(['service', 'requests', 'p99']);
    expect(table.rows).toEqual([{ service: 'checkout', requests: 18402111, p99: 412 }]);
  });

  it('keeps a quoted delimiter inside the field', () => {
    const table = parseDelimited('name,note\n"Chen, Ada","said ""yes"""\n');
    expect(table.rows[0]).toEqual({ name: 'Chen, Ada', note: 'said "yes"' });
  });

  it('keeps a newline inside a quoted field', () => {
    const table = parseDelimited('name,note\n"a","line one\nline two"\n');
    expect(table.rows[0].note).toBe('line one\nline two');
  });

  it('handles CRLF and a trailing newline without inventing a row', () => {
    const table = parseDelimited('a,b\r\n1,2\r\n');
    expect(table.rows).toHaveLength(1);
  });

  it('reads tabs when told to', () => {
    const table = parseDelimited('a\tb\n1\t2\n', { delimiter: '\t' });
    expect(table.rows[0]).toEqual({ a: 1, b: 2 });
  });

  it('names unnamed columns rather than dropping them', () => {
    const table = parseDelimited('a,,c\n1,2,3\n');
    expect(table.columns).toEqual(['a', 'column2', 'c']);
  });

  it('turns an empty cell into null, not zero', () => {
    const table = parseDelimited('a,b\n1,\n');
    expect(table.rows[0].b).toBeNull();
  });

  it('returns nothing for an empty file', () => {
    expect(parseDelimited('')).toEqual({ columns: [], rows: [] });
  });
});

describe('coerce', () => {
  it('keeps anything that is not plainly a number as text', () => {
    expect(coerce('412')).toBe(412);
    expect(coerce('-3.5')).toBe(-3.5);
    expect(coerce('1e3')).toBe(1000);
    // Identifiers that look numeric-ish must not silently lose their shape.
    expect(coerce('007')).toBe(7);
    expect(coerce('1,234')).toBe('1,234');
    expect(coerce('12%')).toBe('12%');
    expect(coerce('2026-08-19')).toBe('2026-08-19');
  });
});

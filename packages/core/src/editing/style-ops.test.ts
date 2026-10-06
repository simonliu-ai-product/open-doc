import { describe, expect, it } from 'vitest';
import { readStyleAt, replaceEditsAt, type StyleEdit } from './style-ops.ts';

// Column is 0-based, line is 1-based — exactly what the loc tag carries.
const SOURCE = `import type { CSSProperties } from 'react';

const h1: CSSProperties = {
  fontSize: 'var(--od-size-h1)',
  fontWeight: 650,
  color: ink.text,
};

const Page = () => (
  <div style={{ padding: 24 }}>
    <h1 style={h1}>Executive summary</h1>
    <p style={{ ...h1, color: 'var(--od-muted)' }}>Lead</p>
    <p>Plain</p>
    <p
      style={{
        fontSize: 14,
        color: '#333333',
      }}
    >
      Multi
    </p>
    <Figure caption="Chart" />
  </div>
);
`;

const DIV = { line: 10, column: 2 };
const H1 = { line: 11, column: 4 };
const LEAD = { line: 12, column: 4 };
const PLAIN = { line: 13, column: 4 };
const MULTI = { line: 14, column: 4 };
const FIGURE = { line: 22, column: 4 };

function write(edit: StyleEdit) {
  const result = replaceEditsAt(SOURCE, [], [edit]);
  expect(result.styles).toEqual([{ ok: true }]);
  return result.source;
}

describe('readStyleAt', () => {
  it('names the shared object a key comes from, and reads tokens as tokens', () => {
    const info = readStyleAt(SOURCE, H1, 'h1');
    expect(info).toEqual({
      editable: true,
      props: {
        fontSize: { kind: 'token', token: 'size-h1', from: 'h1' },
        fontWeight: { kind: 'literal', value: 650, from: 'h1' },
        color: { kind: 'code', code: 'ink.text', from: 'h1' },
      },
    });
  });

  it('lets the element’s own keys win over a spread before them', () => {
    const info = readStyleAt(SOURCE, LEAD, 'p');
    expect(info.props?.color).toEqual({ kind: 'token', token: 'muted' });
    expect(info.props?.fontSize).toEqual({ kind: 'token', token: 'size-h1', from: 'h1' });
  });

  it('refuses a component and a location that now holds another tag', () => {
    expect(readStyleAt(SOURCE, FIGURE, 'figure').editable).toBe(false);
    expect(readStyleAt(SOURCE, H1, 'p')).toMatchObject({ editable: false });
  });
});

describe('replaceEditsAt — styles', () => {
  it('replaces one value in place and leaves the rest of the object alone', () => {
    const next = write({ ...MULTI, tag: 'p', changes: { color: 'var(--od-accent)' } });
    expect(next).toContain(`        fontSize: 14,\n        color: 'var(--od-accent)',\n`);
  });

  it('adds a key on its own line in an object written one key per line', () => {
    const next = write({ ...MULTI, tag: 'p', changes: { textAlign: 'center' } });
    expect(next).toContain(`        color: '#333333',\n        textAlign: 'center',\n      }}`);
  });

  it('adds a key inline in a one-line object', () => {
    const next = write({ ...DIV, tag: 'div', changes: { background: '#fafafa' } });
    expect(next).toContain(`<div style={{ padding: 24, background: '#fafafa' }}>`);
  });

  it('overrides a shared object on this element only, by spreading it', () => {
    const next = write({ ...H1, tag: 'h1', changes: { fontSize: 'var(--od-size-h2)' } });
    expect(next).toContain(`<h1 style={{ ...h1, fontSize: 'var(--od-size-h2)' }}>`);
    expect(next).toContain(`  fontSize: 'var(--od-size-h1)',\n`);
  });

  it('writes a style attribute onto an element that has none', () => {
    const next = write({ ...PLAIN, tag: 'p', changes: { fontWeight: 700, fontStyle: 'italic' } });
    expect(next).toContain(`<p style={{ fontWeight: 700, fontStyle: 'italic' }}>Plain</p>`);
  });

  it('takes a key off, keeping the layout of what stays', () => {
    const next = write({ ...MULTI, tag: 'p', changes: { color: null } });
    expect(next).toContain(`      style={{\n        fontSize: 14,\n      }}`);
  });

  it('drops the attribute when its last key goes', () => {
    const cleared = replaceEditsAt(
      `const A = () => <p style={{ color: '#111111' }}>x</p>;\n`,
      [],
      [{ line: 1, column: 16, tag: 'p', changes: { color: null } }],
    );
    expect(cleared.source).toBe(`const A = () => <p>x</p>;\n`);
  });

  it('writes a key read under backgroundColor back under that name', () => {
    const source = `const A = () => <p style={{ backgroundColor: '#ffffff' }}>x</p>;\n`;
    const result = replaceEditsAt(
      source,
      [],
      [{ line: 1, column: 16, tag: 'p', changes: { background: '#000000' } }],
    );
    expect(result.source).toContain(`backgroundColor: '#000000'`);
  });

  it('refuses a value the key cannot take, and a key the panel does not write', () => {
    const bad = replaceEditsAt(
      SOURCE,
      [],
      [
        { ...PLAIN, tag: 'p', changes: { color: 'red; display: none' } },
        { ...PLAIN, tag: 'p', changes: { position: 'absolute' } as never },
      ],
    );
    expect(bad.styles.map((r) => r.ok)).toEqual([false, false]);
    expect(bad.source).toBe(SOURCE);
  });

  it('refuses a write over a value that changed since the panel read it', () => {
    const result = replaceEditsAt(
      SOURCE,
      [],
      [
        {
          ...MULTI,
          tag: 'p',
          changes: { color: '#000000' },
          expected: { color: { kind: 'literal', value: '#444444' } },
        },
      ],
    );
    expect(result.styles[0]).toMatchObject({ ok: false, status: 409 });
  });

  it('writes text and style from one save in one pass', () => {
    const result = replaceEditsAt(
      SOURCE,
      [{ ...PLAIN, text: 'Retyped', expected: 'Plain' }],
      [{ ...PLAIN, tag: 'p', changes: { textAlign: 'right' } }],
    );
    expect(result.texts).toEqual([{ ok: true }]);
    expect(result.styles).toEqual([{ ok: true }]);
    expect(result.source).toContain(`<p style={{ textAlign: 'right' }}>Retyped</p>`);
  });
});

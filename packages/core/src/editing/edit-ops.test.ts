import { describe, expect, it } from 'vitest';
import { insertMarker, parseMarkers, removeMarker } from './comments.ts';
import { readTextAt, replaceTextAt, resolveTextTarget } from './edit-ops.ts';

// Column is 0-based, line is 1-based — exactly what the loc tag carries.
const SOURCE = `const Page = () => (
  <div style={page}>
    <h1 style={h1}>Executive summary</h1>
    <p style={p}>
      Availability held above target.
    </p>
    <div>
      <span>nested</span>
    </div>
  </div>
);
`;

const H1 = { line: 3, column: 4 };
const P = { line: 4, column: 4 };
const WRAPPER = { line: 7, column: 4 };

// A paragraph whose text is interrupted by inline markup, and two elements
// sharing one line — both shapes broke the first version of the inspector.
const MIXED = `const Page = () => (
  <div>
    <Td>Vertex AI Gemini</Td><Td>產生內容</Td>
    <p style={p}>
      對外端點為 <code>/mcp</code>，另外自訂 <code>/healthz</code> 供探針使用。
    </p>
  </div>
);
`;

const FIRST_TD = { line: 3, column: 4 };
const SECOND_TD = { line: 3, column: 29 };
const MIXED_P = { line: 4, column: 4 };

// The shape that sends every government letter through a helper: the heading
// holds no literal text at all, only the props its call site passes.
const VIA_PROPS = `const Letterhead = ({ agency, kind }: { agency: string; kind: string }) => (
  <h1 style={title}>
    {agency}　{kind}
  </h1>
);

const Page = () => (
  <div>
    <Letterhead agency="範例市政府" kind="函" />
  </div>
);
`;

const VIA_PROPS_H1 = { line: 2, column: 2 };

const TWO_CALLS = `const Head = ({ name }: { name: string }) => <h2>{name}</h2>;

const Page = () => (
  <div>
    <Head name="第一份" />
    <Head name="第二份" />
  </div>
);
`;

const TWO_CALLS_H2 = { line: 1, column: 45 };

describe('text that comes from props', () => {
  it('follows the prop back to the call site and offers it', () => {
    const info = readTextAt(VIA_PROPS, VIA_PROPS_H1, '範例市政府　函');
    expect(info?.editable).toBe(true);
    expect(info?.parts).toEqual([
      { kind: 'text', index: 0, value: '範例市政府' },
      { kind: 'text', index: 1, value: '函' },
    ]);
  });

  it('writes the edit to the call site, leaving the expression alone', () => {
    const out = replaceTextAt(VIA_PROPS, VIA_PROPS_H1, '新北市政府', {
      index: 0,
      expected: '範例市政府',
      shown: '範例市政府　函',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain('agency="新北市政府"');
    expect(out.source).toContain('{agency}　{kind}');
  });

  // Two call sites render the same component with different words. Without the
  // rendered text to tell them apart, a save would rewrite whichever came first.
  it('picks the call site whose words are the ones on screen', () => {
    const out = replaceTextAt(TWO_CALLS, TWO_CALLS_H2, '改過的', {
      index: 0,
      expected: '第二份',
      shown: '第二份',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain('name="第一份"');
    expect(out.source).toContain('name="改過的"');
  });

  it('refuses when the rendered text cannot say which call site is meant', () => {
    const info = readTextAt(TWO_CALLS, TWO_CALLS_H2);
    expect(info?.editable).toBe(false);
  });
});

describe('readTextAt', () => {
  it('reports a single text child as one editable run', () => {
    const info = readTextAt(SOURCE, H1);
    expect(info?.editable).toBe(true);
    expect(info?.text).toBe('Executive summary');
    expect(info?.parts).toEqual([{ kind: 'text', index: 0, value: 'Executive summary' }]);
  });

  it('splits mixed content into runs, keeping the markup as placeholders', () => {
    const info = readTextAt(MIXED, MIXED_P);
    expect(info?.editable).toBe(true);
    expect(info?.parts).toEqual([
      { kind: 'text', index: 0, value: '對外端點為' },
      { kind: 'markup', label: '<code>' },
      { kind: 'text', index: 1, value: '，另外自訂' },
      { kind: 'markup', label: '<code>' },
      { kind: 'text', index: 2, value: '供探針使用。' },
    ]);
  });

  it('refuses an element that holds no text of its own', () => {
    const info = readTextAt(SOURCE, WRAPPER);
    expect(info?.editable).toBe(false);
    expect(info?.reason).toMatch(/no text/);
  });

  it('returns null when nothing is at that location', () => {
    expect(readTextAt(SOURCE, { line: 99, column: 0 })).toBeNull();
  });
});

describe('replaceTextAt', () => {
  it('swaps the text and leaves the rest of the file alone', () => {
    const result = replaceTextAt(SOURCE, H1, '摘要');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<h1 style={h1}>摘要</h1>');
    expect(result.source).toContain('Availability held above target.');
  });

  it('keeps the original indentation of a multi-line text child', () => {
    const result = replaceTextAt(SOURCE, P, 'Latency improved.');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('    <p style={p}>\n      Latency improved.\n    </p>');
  });

  it('escapes characters that would break JSX', () => {
    const result = replaceTextAt(SOURCE, H1, 'a < b {c}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain("a {'<'} b {'{'}c{'}'}");
  });

  it('edits one run of mixed content without touching the markup', () => {
    const result = replaceTextAt(MIXED, MIXED_P, '端點是', { index: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('端點是 <code>/mcp</code>');
    expect(result.source).toContain('<code>/healthz</code>');
    expect(readTextAt(result.source, MIXED_P)?.parts[0]).toEqual({
      kind: 'text',
      index: 0,
      value: '端點是',
    });
  });

  it('refuses a write when the source moved under it', () => {
    const result = replaceTextAt(SOURCE, H1, 'x', { expected: 'Something else' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it('reports a missing target rather than writing anything', () => {
    const result = replaceTextAt(SOURCE, { line: 99, column: 0 }, 'x');
    expect(result).toEqual({ ok: false, status: 404, error: 'no element at that source location' });
  });
});

describe('resolveTextTarget', () => {
  it('picks the exact element when the location matches', () => {
    const resolved = resolveTextTarget(MIXED, [FIRST_TD], 'Vertex AI Gemini');
    expect(resolved?.text).toBe('Vertex AI Gemini');
    expect(resolved).toMatchObject(FIRST_TD);
  });

  it('recovers the right element when the column drifted', () => {
    // The clicked element is the second <Td>, but the candidate column is off.
    const resolved = resolveTextTarget(MIXED, [{ line: 3, column: 26 }], '產生內容');
    expect(resolved?.text).toBe('產生內容');
    expect(resolved).toMatchObject(SECOND_TD);
  });

  it('never hands back an element the user is not looking at', () => {
    // Column drift on a line that also holds "Vertex AI Gemini" — without the
    // on-screen text as a tiebreaker this used to resolve to the wrong cell,
    // and a save would then have rewritten that cell. Returning nothing is the
    // correct outcome.
    const resolved = resolveTextTarget(MIXED, [{ line: 3, column: 26 }], '完全不同的文字');
    expect(resolved).toBeNull();
  });

  it('falls through candidates to the call site that holds the text', () => {
    const resolved = resolveTextTarget(
      MIXED,
      [{ line: 99, column: 0 }, FIRST_TD],
      'Vertex AI Gemini',
    );
    expect(resolved?.text).toBe('Vertex AI Gemini');
  });

  it('reports the clicked element when nothing is editable', () => {
    const resolved = resolveTextTarget(SOURCE, [WRAPPER], 'nested');
    expect(resolved?.editable).toBe(false);
    expect(resolved).toMatchObject(WRAPPER);
  });
});

describe('comment markers', () => {
  it('round-trips a note through insert → parse', () => {
    const inserted = insertMarker(SOURCE, H1, 'make this bold', 'h1');
    expect(inserted).not.toBeNull();
    if (!inserted) return;

    const comments = parseMarkers(inserted.source);
    expect(comments).toHaveLength(1);
    expect(comments[0].note).toBe('make this bold');
    expect(comments[0].hint).toBe('h1');
    expect(comments[0].id).toBe(inserted.id);
  });

  it('anchors the marker inside the element it belongs to', () => {
    const inserted = insertMarker(SOURCE, H1, 'note');
    if (!inserted) return;
    expect(inserted.source).toMatch(/<h1 style=\{h1\}>\n\s*\{\/\* @doc-comment/);
  });

  it('survives notes with quotes and newlines', () => {
    const inserted = insertMarker(SOURCE, H1, 'say "hi"\nthen stop');
    if (!inserted) return;
    expect(parseMarkers(inserted.source)[0].note).toBe('say "hi"\nthen stop');
  });

  it('removes a marker by id and leaves the source otherwise intact', () => {
    const inserted = insertMarker(SOURCE, H1, 'note');
    if (!inserted) return;
    const cleaned = removeMarker(inserted.source, inserted.id);
    expect(cleaned).not.toBeNull();
    expect(parseMarkers(cleaned as string)).toEqual([]);
    expect(cleaned).toContain('<h1 style={h1}>Executive summary</h1>');
  });

  it('reports an unknown id instead of rewriting', () => {
    expect(removeMarker(SOURCE, 'c-deadbeef')).toBeNull();
  });

  it('refuses to anchor to a self-closing element', () => {
    const selfClosing = `const P = () => (\n  <div>\n    <img src={a} />\n  </div>\n);\n`;
    expect(insertMarker(selfClosing, { line: 3, column: 4 }, 'note')).toBeNull();
  });
});

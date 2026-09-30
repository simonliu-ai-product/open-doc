import { describe, expect, it } from 'vitest';
import { insertMarker, parseMarkers, removeMarker } from './comments.ts';
import { readTextAt, replaceTextAt, replaceTextsAt, resolveTextTarget } from './edit-ops.ts';

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

// A helper that puts half its words in an attribute and half between its tags,
// with a literal of its own in between. All three used to be resolved as one:
// finding the colon meant the props were never looked for, so the inspector
// offered the colon and nothing else.
const VIA_CHILDREN = `const Section = ({ name, children }: { name: string; children: ReactNode }) => (
  <div style={hang}>
    {name}：{children}
  </div>
);

const Page = () => (
  <div>
    <Section name="主旨">本府訂於115年10月14日辦理研習營。</Section>
    <Section name="說明">依本府115年度數位人才培育計畫辦理。</Section>
  </div>
);
`;

const VIA_CHILDREN_DIV = { line: 2, column: 2 };

// Five contact lines rendered by one element. The words are entries of an
// array the call site passed, so the click resolves to an array element.
const VIA_MAP = `const Contact = ({ lines }: { lines: string[] }) => (
  <div style={caption}>
    {lines.map((line) => (
      <div key={line}>{line}</div>
    ))}
  </div>
);

const Page = () => (
  <div>
    <Contact lines={['地址：000範例市範例路1號', '承辦人：陳小華']} />
  </div>
);
`;

const VIA_MAP_DIV = { line: 4, column: 6 };

const VIA_PAIRS = `const Fields = ({ rows }: { rows: [string, string][] }) => (
  <div style={caption}>
    {rows.map(([label, value]) => (
      <div key={label}>
        {label}：{value}
      </div>
    ))}
  </div>
);

const Page = () => (
  <div>
    <Fields
      rows={[
        ['發文日期', '中華民國115年8月16日'],
        ['速別', '普通件'],
      ]}
    />
  </div>
);
`;

const VIA_PAIRS_DIV = { line: 4, column: 6 };

describe('text that arrives as children', () => {
  it('offers the attribute, the literal and the children as three runs', () => {
    const info = readTextAt(
      VIA_CHILDREN,
      VIA_CHILDREN_DIV,
      '主旨：本府訂於115年10月14日辦理研習營。',
    );
    expect(info?.editable).toBe(true);
    expect(info?.parts).toEqual([
      { kind: 'text', index: 0, value: '主旨' },
      { kind: 'text', index: 1, value: '：', formattable: true },
      { kind: 'text', index: 2, value: '本府訂於115年10月14日辦理研習營。', formattable: true },
    ]);
  });

  it('writes between the tags of the call site that is on screen', () => {
    const out = replaceTextAt(VIA_CHILDREN, VIA_CHILDREN_DIV, '依規定辦理。', {
      index: 2,
      expected: '依本府115年度數位人才培育計畫辦理。',
      shown: '說明：依本府115年度數位人才培育計畫辦理。',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain('<Section name="說明">依規定辦理。</Section>');
    expect(out.source).toContain('本府訂於115年10月14日辦理研習營。');
  });

  it('still writes the attribute half through the same element', () => {
    const out = replaceTextAt(VIA_CHILDREN, VIA_CHILDREN_DIV, '辦法', {
      index: 0,
      expected: '主旨',
      shown: '主旨：本府訂於115年10月14日辦理研習營。',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain('<Section name="辦法">');
  });
});

describe('text that comes from a mapped array', () => {
  it('resolves one element of the array by what is on screen', () => {
    const info = readTextAt(VIA_MAP, VIA_MAP_DIV, '承辦人：陳小華');
    expect(info?.editable).toBe(true);
    expect(info?.parts).toEqual([{ kind: 'text', index: 0, value: '承辦人：陳小華' }]);
  });

  it('writes that entry and leaves its neighbours alone', () => {
    const out = replaceTextAt(VIA_MAP, VIA_MAP_DIV, '承辦人：王大明', {
      index: 0,
      expected: '承辦人：陳小華',
      shown: '承辦人：陳小華',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain("'承辦人：王大明'");
    expect(out.source).toContain("'地址：000範例市範例路1號'");
  });

  it('escapes a quote that would end the string literal', () => {
    const out = replaceTextAt(VIA_MAP, VIA_MAP_DIV, "it's here", {
      index: 0,
      shown: '承辦人：陳小華',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain("'it\\'s here'");
  });

  it('refuses when nothing on screen says which entry was clicked', () => {
    expect(readTextAt(VIA_MAP, VIA_MAP_DIV)?.editable).toBe(false);
  });

  it('destructures a pair into its own runs', () => {
    const info = readTextAt(VIA_PAIRS, VIA_PAIRS_DIV, '發文日期：中華民國115年8月16日');
    expect(info?.parts).toEqual([
      { kind: 'text', index: 0, value: '發文日期' },
      { kind: 'text', index: 1, value: '：', formattable: true },
      { kind: 'text', index: 2, value: '中華民國115年8月16日' },
    ]);
  });

  it('writes the half of the pair that was edited', () => {
    const out = replaceTextAt(VIA_PAIRS, VIA_PAIRS_DIV, '中華民國115年9月1日', {
      index: 2,
      expected: '中華民國115年8月16日',
      shown: '發文日期：中華民國115年8月16日',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.source).toContain("['發文日期', '中華民國115年9月1日']");
    expect(out.source).toContain("['速別', '普通件']");
  });
});

// A code block: the words are a template literal handed to a helper as
// children, so neither the element nor an attribute holds them.
const VIA_TEMPLATE = [
  'const Code = ({ children }: { children: ReactNode }) => (',
  '  <pre style={mono}>{children}</pre>',
  ');',
  '',
  'const Page = () => (',
  '  <div>',
  '    <Code>{`docs/',
  '  my-report/',
  '    index.tsx`}</Code>',
  '  </div>',
  ');',
  '',
].join('\n');

const VIA_TEMPLATE_PRE = { line: 2, column: 2 };

describe('text that is a template literal', () => {
  it('offers a code block as one editable run', () => {
    const info = readTextAt(VIA_TEMPLATE, VIA_TEMPLATE_PRE, 'docs/ my-report/ index.tsx');
    expect(info?.editable).toBe(true);
    expect(info?.parts).toEqual([
      { kind: 'text', index: 0, value: 'docs/\n  my-report/\n    index.tsx' },
    ]);
  });

  it('keeps the newlines and escapes what would end the literal', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${ is the point
    const typed = 'docs/\n  a-`b`-${c}';
    const out = replaceTextAt(VIA_TEMPLATE, VIA_TEMPLATE_PRE, typed, {
      index: 0,
      shown: 'docs/ my-report/ index.tsx',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // A backslash, a backtick and a substitution would each end or reopen the
    // literal; all three come back escaped.
    expect(out.source).toContain('{`docs/\n  a-');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: checking the escape, not a template
    expect(out.source).toContain('a-\\`b\\`-\\${c}`}');
  });
});

describe('readTextAt', () => {
  it('reports a single text child as one editable run', () => {
    const info = readTextAt(SOURCE, H1);
    expect(info?.editable).toBe(true);
    expect(info?.text).toBe('Executive summary');
    expect(info?.parts).toEqual([
      { kind: 'text', index: 0, value: 'Executive summary', formattable: true },
    ]);
  });

  it('reads text and bare marks as one formatted run', () => {
    const info = readTextAt(MIXED, MIXED_P);
    expect(info?.editable).toBe(true);
    expect(info?.parts).toEqual([
      {
        kind: 'text',
        index: 0,
        value: '對外端點為 /mcp，另外自訂 /healthz 供探針使用。',
        formattable: true,
        segments: [
          { text: '對外端點為 ' },
          { text: '/mcp', code: true },
          { text: '，另外自訂 ' },
          { text: '/healthz', code: true },
          { text: ' 供探針使用。' },
        ],
      },
    ]);
  });

  it('keeps an element with attributes as markup between runs', () => {
    const styled = `const P = () => (\n  <p>\n    before <code style={mono}>x</code> after\n  </p>\n);\n`;
    expect(readTextAt(styled, { line: 2, column: 2 })?.parts).toEqual([
      { kind: 'text', index: 0, value: 'before', formattable: true },
      { kind: 'markup', label: '<code>' },
      { kind: 'text', index: 1, value: 'after', formattable: true },
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

  it('refuses plain text over a formatted run rather than drop its formatting', () => {
    const result = replaceTextAt(MIXED, MIXED_P, '端點是', { index: 0 });
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it('rewrites a formatted run from segments', () => {
    const result = replaceTextAt(MIXED, MIXED_P, '端點是 /mcp。', {
      index: 0,
      segments: [{ text: '端點是 ' }, { text: '/mcp', code: true }, { text: '。' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<p style={p}>\n      端點是 <code>/mcp</code>。\n    </p>');
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

describe('JSX spacing', () => {
  const SPACED = `const Page = () => (
  <div>
    <p style={p}>
      fill{' '}
      <code>x</code>. Page numbers come from <code>y</code>{' '}
      and <code>z</code>.
    </p>
  </div>
);
`;

  it("reads {' '} as the space it renders, inside one run", () => {
    const info = readTextAt(SPACED, { line: 3, column: 4 });
    const runs = info?.parts.filter((part) => part.kind === 'text') ?? [];
    expect(runs.map((part) => part.kind === 'text' && part.value)).toEqual([
      'fill x. Page numbers come from y and z.',
    ]);
  });

  it('rewrites the run on one line, rendering exactly as before', () => {
    const { source, results } = replaceTextsAt(SPACED, [
      {
        line: 3,
        column: 4,
        index: 0,
        text: 'fill x. Page numbers come from y plus z.',
        expected: 'fill x. Page numbers come from y and z.',
        segments: [
          { text: 'fill ' },
          { text: 'x', code: true },
          { text: '. Page numbers come from ' },
          { text: 'y', code: true },
          { text: ' plus ' },
          { text: 'z', code: true },
          { text: '.' },
        ],
      },
    ]);
    expect(results).toEqual([{ ok: true }]);
    expect(source).toContain(
      '<p style={p}>\n      fill <code>x</code>. Page numbers come from <code>y</code> plus <code>z</code>.\n    </p>',
    );
  });
});

describe('replaceTextsAt', () => {
  it('locates every edit against the source the caller saw', () => {
    // The heading grows by a line's worth of text; the paragraph below it must
    // still be found at the location it had before that edit landed.
    const { source, results } = replaceTextsAt(SOURCE, [
      { ...H1, text: 'A much longer executive summary', expected: 'Executive summary' },
      { ...P, text: 'Availability slipped.', expected: 'Availability held above target.' },
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(source).toContain('<h1 style={h1}>A much longer executive summary</h1>');
    expect(source).toContain('Availability slipped.');
    expect(source).not.toContain('Availability held');
  });

  it('writes links, and shares one tag across neighbours that share a mark', () => {
    const { source, results } = replaceTextsAt(SOURCE, [
      {
        ...H1,
        text: 'See the docs now',
        segments: [
          { text: 'See ' },
          { text: 'the ', href: 'https://example.com/?a="b"' },
          { text: 'docs', href: 'https://example.com/?a="b"', bold: true },
          { text: ' now' },
        ],
      },
    ]);
    expect(results).toEqual([{ ok: true }]);
    expect(source).toContain(
      '<h1 style={h1}>See <a href="https://example.com/?a=&quot;b&quot;">the <strong>docs</strong></a> now</h1>',
    );
  });

  it('reads a written link back as the same segments', () => {
    const linked = `const P = () => (\n  <p>\n    See <a href="/guide">the <strong>guide</strong></a>.\n  </p>\n);\n`;
    expect(readTextAt(linked, { line: 2, column: 2 })?.parts[0]).toMatchObject({
      value: 'See the guide.',
      segments: [
        { text: 'See ' },
        { text: 'the ', href: '/guide' },
        { text: 'guide', href: '/guide', bold: true },
        { text: '.' },
      ],
    });
  });

  it('refuses a link that would run script', () => {
    const { source, results } = replaceTextsAt(SOURCE, [
      { ...H1, text: 'x', segments: [{ text: 'x', href: ' JavaScript:alert(1)' }] },
    ]);
    expect(results[0]).toMatchObject({ ok: false, status: 422 });
    expect(source).toBe(SOURCE);
  });

  it('skips a stale edit and still writes the rest', () => {
    const { source, results } = replaceTextsAt(SOURCE, [
      { ...H1, text: 'New title', expected: 'something else' },
      { ...P, text: 'Kept.', expected: 'Availability held above target.' },
    ]);
    expect(results[0]).toMatchObject({ ok: false, status: 409 });
    expect(results[1]).toEqual({ ok: true });
    expect(source).toContain('Executive summary');
    expect(source).toContain('Kept.');
  });

  it('writes emphasis as JSX around the formatted pieces', () => {
    const { source, results } = replaceTextsAt(SOURCE, [
      {
        ...H1,
        text: 'Executive summary',
        expected: 'Executive summary',
        segments: [{ text: 'Executive ' }, { text: 'summary', bold: true, italic: true }],
      },
    ]);
    expect(results).toEqual([{ ok: true }]);
    expect(source).toContain('<h1 style={h1}>Executive <strong><em>summary</em></strong></h1>');
  });

  it('escapes formatted text like any other', () => {
    const { source } = replaceTextsAt(SOURCE, [
      { ...H1, text: 'a {b}', segments: [{ text: 'a ' }, { text: '{b}', bold: true }] },
    ]);
    expect(source).toContain("<h1 style={h1}>a <strong>{'{'}b{'}'}</strong></h1>");
  });

  it('refuses emphasis in text that is a string, not JSX', () => {
    const { source, results } = replaceTextsAt(VIA_PROPS, [
      {
        line: 2,
        column: 2,
        index: 0,
        text: '範例市政府',
        shown: '範例市政府 函',
        segments: [{ text: '範例市政府', bold: true }],
      },
    ]);
    expect(results[0]).toMatchObject({ ok: false, status: 422 });
    expect(source).toBe(VIA_PROPS);
  });

  it('refuses two edits that disagree about the same span', () => {
    const { source, results } = replaceTextsAt(SOURCE, [
      { ...H1, text: 'First' },
      { ...H1, text: 'Second' },
    ]);
    expect(results[0]).toEqual({ ok: true });
    expect(results[1]).toMatchObject({ ok: false, status: 409 });
    expect(source).toContain('<h1 style={h1}>First</h1>');
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

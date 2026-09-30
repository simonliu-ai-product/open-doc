import { describe, expect, it } from 'vitest';
import { cleanRun, holdSpaces, isRunDirty, matchRuns } from './inline-edit.ts';

describe('matchRuns', () => {
  it('pairs runs with the element’s own text nodes, skipping separators', () => {
    // `{agency}　{kind}` renders three text nodes; the ideographic space is
    // whitespace and never offered as a run.
    const parts = [
      { index: 0, value: '範例市政府' },
      { index: 1, value: '函' },
    ];
    expect(matchRuns(parts, ['範例市政府', '函'], ['範例市政府', '函'])).toEqual({
      deep: false,
      at: [0, 1],
    });
  });

  it('prefers direct text over identical words inside markup', () => {
    // `<p><code>mcp</code> mcp</p>`: the run is the paragraph's own word, not
    // the one inside the code element.
    const parts = [{ index: 0, value: 'mcp' }];
    expect(matchRuns(parts, [' mcp'], ['mcp', ' mcp'])).toEqual({ deep: false, at: [0] });
  });

  it('falls back to descendants when a helper wraps its children', () => {
    const parts = [{ index: 0, value: 'Vertex AI Gemini' }];
    expect(matchRuns(parts, [], ['Vertex AI Gemini'])).toEqual({ deep: true, at: [0] });
  });

  it('matches across JSX line collapsing', () => {
    const parts = [{ index: 0, value: 'Availability held\n      above target.' }];
    expect(matchRuns(parts, ['Availability held above target.'], [])).toEqual({
      deep: false,
      at: [0],
    });
  });

  it('refuses when the rendered text is not what the source says', () => {
    const parts = [{ index: 0, value: 'Title' }];
    expect(matchRuns(parts, ['TITLE'], ['TITLE'])).toBeNull();
  });

  it('keeps runs in document order', () => {
    const parts = [
      { index: 0, value: 'b' },
      { index: 1, value: 'a' },
    ];
    expect(matchRuns(parts, ['a', 'b'], ['a', 'b'])).toBeNull();
  });
});

describe('cleanRun', () => {
  it('turns the browser’s non-breaking spaces back into spaces', () => {
    expect(cleanRun('a b', 'a b')).toBe('a b');
  });

  it('trims edges a trimmed source run never had', () => {
    expect(cleanRun('端點是 ', '對外端點為')).toBe('端點是');
  });

  it('keeps edge whitespace a run really holds', () => {
    expect(cleanRun('  indented\n', '  code\n')).toBe('  indented\n');
  });
});

describe('isRunDirty', () => {
  it('ignores whitespace-only differences', () => {
    expect(isRunDirty('Editable heading ', 'Editable heading')).toBe(false);
    expect(isRunDirty('Edited heading', 'Editable heading')).toBe(true);
  });
});

describe('holdSpaces', () => {
  it('keeps a trailing space from collapsing while the next word is typed', () => {
    expect(holdSpaces('Rewritten ')).toBe('Rewritten\u00a0');
    expect(cleanRun(`${holdSpaces('Rewritten ')}heading`, 'Editable heading')).toBe(
      'Rewritten heading',
    );
  });

  it('holds runs of spaces and leading spaces, not single inner ones', () => {
    expect(holdSpaces(' a  b c')).toBe('\u00a0a \u00a0b c');
  });
});

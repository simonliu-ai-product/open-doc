import { describe, expect, it } from 'vitest';
import {
  cleanRun,
  clearFormatting,
  hasMark,
  holdSpaces,
  hrefOf,
  isRunDirty,
  linkAt,
  mapSegmentText,
  matchRanges,
  mergeSegments,
  setHref,
  spliceSegments,
  toggleMark,
} from './inline-edit.ts';

const text = (value: string) => ({ text: value, inline: true });
const mark = (value: string) => ({ text: value, inline: true });
const markup = (value: string) => ({ text: value, inline: false });

describe('matchRanges', () => {
  it('pairs runs with text nodes, stepping over separators and markup', () => {
    // `{agency}　{kind}` renders three text nodes; the ideographic space is
    // whitespace and never part of a run.
    const parts = [
      { index: 0, value: '範例市政府' },
      { index: 1, value: '函' },
    ];
    expect(matchRanges(parts, [text('範例市政府'), text('　'), text('函')])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });

  it('gathers text and bare marks into one run', () => {
    const parts = [{ index: 0, value: 'Use real h1/h2 elements' }];
    expect(
      matchRanges(parts, [text('Use real '), mark('h1'), text('/'), mark('h2'), text(' elements')]),
    ).toEqual([[0, 4]]);
  });

  it('keeps runs apart at markup that is not a bare mark', () => {
    const parts = [
      { index: 0, value: 'before' },
      { index: 1, value: 'after' },
    ];
    expect(matchRanges(parts, [text('before '), markup('x'), text(' after')])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });

  it('steps over text the source cannot claim', () => {
    // `{count} items`, where the count is computed: its text node is not a run.
    const parts = [{ index: 0, value: 'items' }];
    expect(matchRanges(parts, [text('3'), text(' items')])).toEqual([[1, 1]]);
  });

  it('matches across JSX line collapsing', () => {
    const parts = [{ index: 0, value: 'Availability held\n      above target.' }];
    expect(matchRanges(parts, [text('Availability held above target.')])).toEqual([[0, 0]]);
  });

  it('refuses when the rendered text is not what the source says', () => {
    expect(matchRanges([{ index: 0, value: 'Title' }], [text('TITLE')])).toBeNull();
  });

  it('keeps runs in document order', () => {
    const parts = [
      { index: 0, value: 'b' },
      { index: 1, value: 'a' },
    ];
    expect(matchRanges(parts, [text('a'), markup('-'), text('b')])).toBeNull();
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

describe('segments', () => {
  const plain = [{ text: 'Executive summary' }];

  it('bolds a range and splits the run around it', () => {
    expect(toggleMark(plain, 10, 17, 'bold')).toEqual([
      { text: 'Executive ' },
      { text: 'summary', bold: true },
    ]);
  });

  it('takes the mark off when the whole range already has it', () => {
    const bolded = toggleMark(plain, 10, 17, 'bold');
    expect(toggleMark(bolded, 10, 17, 'bold')).toEqual(plain);
  });

  it('adds the mark when only part of the range has it', () => {
    const bolded = toggleMark(plain, 10, 17, 'bold');
    expect(hasMark(bolded, 5, 17, 'bold')).toBe(false);
    expect(toggleMark(bolded, 5, 17, 'bold')).toEqual([
      { text: 'Execu' },
      { text: 'tive summary', bold: true },
    ]);
  });

  it('keeps bold and italic independent', () => {
    const both = toggleMark(toggleMark(plain, 0, 9, 'bold'), 5, 9, 'italic');
    expect(both).toEqual([
      { text: 'Execu', bold: true },
      { text: 'tive', bold: true, italic: true },
      { text: ' summary' },
    ]);
  });

  it('continues the emphasis of the character before the caret', () => {
    const bolded = toggleMark(plain, 10, 17, 'bold');
    expect(spliceSegments(bolded, 17, 17, '!')).toEqual([
      { text: 'Executive ' },
      { text: 'summary!', bold: true },
    ]);
    expect(spliceSegments(bolded, 10, 10, 'x')).toEqual([
      { text: 'Executive x' },
      { text: 'summary', bold: true },
    ]);
  });

  it('keeps the formatting of the words a selection replaces', () => {
    const bolded = toggleMark(plain, 10, 17, 'bold');
    expect(spliceSegments(bolded, 10, 17, 'digest')).toEqual([
      { text: 'Executive ' },
      { text: 'digest', bold: true },
    ]);
  });

  it('deletes across pieces and merges what is left', () => {
    const bolded = toggleMark(plain, 10, 17, 'bold');
    expect(spliceSegments(bolded, 9, 17, '')).toEqual([{ text: 'Executive' }]);
  });

  it('counts UTF-16 units, as DOM offsets do', () => {
    // The emoji is two units; the selection's offsets for "ab" are 2–4.
    expect(toggleMark([{ text: '😀ab' }], 2, 4, 'bold')).toEqual([
      { text: '😀' },
      { text: 'ab', bold: true },
    ]);
  });

  it('rewrites text across piece boundaries without moving them', () => {
    const pieces = [{ text: 'a ' }, { text: ' b', bold: true }];
    expect(mapSegmentText(pieces, holdSpaces)).toEqual([
      { text: 'a ' },
      { text: '\u00a0b', bold: true },
    ]);
  });

  it('drops empty pieces and joins equal neighbours', () => {
    expect(mergeSegments([{ text: 'a' }, { text: '' }, { text: 'b' }])).toEqual([{ text: 'ab' }]);
  });
});

describe('code, links and clearing', () => {
  const plain = [{ text: 'See the guide now' }];

  it('toggles code like any other mark', () => {
    expect(toggleMark(plain, 8, 13, 'code')).toEqual([
      { text: 'See the ' },
      { text: 'guide', code: true },
      { text: ' now' },
    ]);
  });

  it('links a range, and finds the whole link from a caret inside it', () => {
    const linked = setHref(plain, 4, 13, '/guide');
    expect(linked).toEqual([
      { text: 'See ' },
      { text: 'the guide', href: '/guide' },
      { text: ' now' },
    ]);
    expect(linkAt(linked, 6)).toEqual({ from: 4, to: 13, href: '/guide' });
    expect(linkAt(linked, 13)).toEqual({ from: 4, to: 13, href: '/guide' });
    expect(linkAt(linked, 2)).toBeNull();
    expect(hrefOf(linked, 4, 13)).toBe('/guide');
    expect(hrefOf(linked, 2, 13)).toBeNull();
  });

  it('unlinks with a null href', () => {
    const linked = setHref(plain, 4, 13, '/guide');
    expect(setHref(linked, 4, 13, null)).toEqual(plain);
  });

  it('does not extend a link when typing just past its end', () => {
    const linked = setHref(plain, 4, 13, '/guide');
    expect(spliceSegments(linked, 13, 13, 's')).toEqual([
      { text: 'See ' },
      { text: 'the guide', href: '/guide' },
      { text: 's now' },
    ]);
    // Inside the link, typing stays in it.
    expect(spliceSegments(linked, 8, 8, 'x')).toEqual([
      { text: 'See ' },
      { text: 'the xguide', href: '/guide' },
      { text: ' now' },
    ]);
  });

  it('clears every kind of formatting from the range only', () => {
    const busy = toggleMark(setHref(toggleMark(plain, 0, 17, 'bold'), 4, 13, '/g'), 8, 13, 'code');
    expect(clearFormatting(busy, 4, 13)).toEqual([
      { text: 'See ', bold: true },
      { text: 'the guide' },
      { text: ' now', bold: true },
    ]);
  });
});

/**
 * CSS collapses white space across element boundaries; Word keeps every space
 * it is given. What reaches a run has to be what the browser showed.
 */

import { describe, expect, it } from 'vitest';
import type { Inline, RunStyle } from './model';
import { capitalize, ParagraphBuilder } from './paragraph';

const style: RunStyle = {
  fonts: { ascii: 'Inter' },
  size: 21,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: '000000',
};

function texts(inlines: Inline[]): string[] {
  return inlines.map((inline) => (inline.type === 'text' ? inline.text : `<${inline.type}>`));
}

describe('ParagraphBuilder', () => {
  it('keeps one space between spans and none at either end', () => {
    const p = new ParagraphBuilder();
    p.text(' Hello ', style, undefined, true);
    p.text(' world ', style, undefined, true);
    expect(texts(p.finish())).toEqual(['Hello ', 'world']);
  });

  it('collapses runs of spaces inside a span', () => {
    const p = new ParagraphBuilder();
    p.text('a    b', style, undefined, true);
    expect(texts(p.finish())).toEqual(['a b']);
  });

  it('leaves preformatted text as it is', () => {
    const p = new ParagraphBuilder();
    p.text('  indented  ', style, undefined, false);
    expect(texts(p.finish())).toEqual(['  indented  ']);
  });

  it('trims the space around a line break and a tab', () => {
    const p = new ParagraphBuilder();
    p.text('left ', style, undefined, true);
    p.push({ type: 'tab' });
    p.text(' right ', style, undefined, true);
    p.push({ type: 'break' });
    p.text(' next', style, undefined, true);
    expect(texts(p.finish())).toEqual(['left', '<tab>', 'right', '<break>', 'next']);
  });

  it('puts a nested block on its own line, but never opens with a break', () => {
    const p = new ParagraphBuilder();
    p.requestBreak();
    p.text('first', style, undefined, true);
    p.requestBreak();
    p.text('second', style, undefined, true);
    p.requestBreak();
    expect(texts(p.finish())).toEqual(['first', '<break>', 'second']);
  });

  it('knows the character before the next text, but not across a line break', () => {
    const p = new ParagraphBuilder();
    p.text('mac', style, undefined, true);
    expect(p.lastChar()).toBe('c');
    p.requestBreak();
    expect(p.lastChar()).toBe('');
  });

  it('counts only visible content as content', () => {
    const p = new ParagraphBuilder();
    p.text('   ', style, undefined, true);
    p.push({ type: 'break' });
    expect(p.empty).toBe(true);
    p.push({ type: 'footnote', id: 1, style });
    expect(p.empty).toBe(false);
  });
});

describe('capitalize', () => {
  it('capitalizes each word as the browser does, accents and apostrophes included', () => {
    expect(capitalize('naïve café élan', ' ')).toBe('Naïve Café Élan');
    expect(capitalize("don't stop", '')).toBe("Don't Stop");
  });

  it('continues a word that began in an earlier element', () => {
    expect(capitalize('book pro', 'c')).toBe('book Pro');
    expect(capitalize('book', ' ')).toBe('Book');
  });
});

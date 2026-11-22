import { describe, expect, it } from 'vitest';
import { child, parseXml, textContent } from './xml.ts';

describe('parseXml', () => {
  it('reads elements, attributes, entities and CDATA', () => {
    const root = parseXml(
      '<?xml version="1.0"?><!-- note --><a x="1 &gt; 0" y=\'&#x4e2d;\'><b>Tom &amp; Jerry &#169;</b><c/><![CDATA[<raw>]]></a>',
    );
    expect(root.name).toBe('a');
    expect(root.attrs).toEqual({ x: '1 > 0', y: '中' });
    expect(textContent(child(root, 'b') ?? root)).toBe('Tom & Jerry ©');
    expect(child(root, 'c')?.children).toEqual([]);
    expect(textContent(root)).toBe('Tom & Jerry ©<raw>');
  });

  it('keeps an unescaped > inside an attribute value and survives a stray close tag', () => {
    const root = parseXml('<a t="x>y"><b>one</b></z><b>two</b></a>');
    expect(root.attrs.t).toBe('x>y');
    expect(textContent(root)).toBe('onetwo');
  });
});

import { describe, expect, it } from 'vitest';
import { pushRecent, recentAmong } from './recent-docs.ts';

describe('pushRecent', () => {
  it('puts the opened document first without repeating it', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('keeps eight', () => {
    const list = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(pushRecent(list, 'new')).toEqual(['new', '1', '2', '3', '4', '5', '6', '7']);
  });
});

describe('recentAmong', () => {
  it('drops documents that are gone and caps the count', () => {
    expect(recentAmong(['gone', 'b', 'a', 'c'], ['a', 'b', 'c'], 2)).toEqual(['b', 'a']);
  });
});

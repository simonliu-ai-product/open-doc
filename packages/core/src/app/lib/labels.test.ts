import { describe, expect, it } from 'vitest';
import { defaultVocabulary, onPageParts } from './labels';

describe('onPageParts', () => {
  it('splits the page suffix around the page number', () => {
    expect(onPageParts(defaultVocabulary)).toEqual([' (p. ', ')']);
    expect(onPageParts({ ...defaultVocabulary, onPage: '（第 {page} 頁）' })).toEqual([
      '（第 ',
      ' 頁）',
    ]);
  });

  /* 沒有 {page} 的後綴要原樣印出，不能把頁碼黏在編號後面變成「Table 15」。 */
  it('has nothing to split when the suffix names no page', () => {
    expect(onPageParts({ ...defaultVocabulary, onPage: '' })).toBeNull();
    expect(onPageParts({ ...defaultVocabulary, onPage: ' (see below)' })).toBeNull();
  });
});

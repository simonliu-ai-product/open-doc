import { describe, expect, it } from 'vitest';
import { ZH_TW } from './i18n-zh-tw';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('zh-TW dictionary', () => {
  it('keeps every placeholder of the English key, and no others', () => {
    const broken = Object.entries(ZH_TW).filter(
      ([en, zh]) => placeholders(en).join() !== placeholders(zh).join(),
    );
    expect(broken).toEqual([]);
  });

  it('has no empty translations', () => {
    expect(Object.entries(ZH_TW).filter(([, zh]) => zh.trim() === '')).toEqual([]);
  });
});

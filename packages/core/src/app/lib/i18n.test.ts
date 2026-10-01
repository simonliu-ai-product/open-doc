import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from './i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const translated = Object.entries(DICTIONARIES).filter(([locale]) => locale !== 'en');
const reference = Object.keys(DICTIONARIES['zh-TW']).sort();

describe.each(translated)('%s dictionary', (_locale, dictionary) => {
  it('translates exactly the strings the others do', () => {
    expect(Object.keys(dictionary).sort()).toEqual(reference);
  });

  it('keeps every placeholder of the English key, and no others', () => {
    const broken = Object.entries(dictionary).filter(
      ([en, text]) => placeholders(en).join() !== placeholders(text).join(),
    );
    expect(broken).toEqual([]);
  });

  it('has no empty translations', () => {
    expect(Object.entries(dictionary).filter(([, text]) => text.trim() === '')).toEqual([]);
  });
});

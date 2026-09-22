import { describe, expect, it } from 'vitest';
import {
  eastAsiaLangFromFonts,
  fontKindOf,
  isCjkFace,
  parseFontFamily,
  pickFonts,
  standInFor,
} from './fonts';

describe('parseFontFamily', () => {
  it('splits on commas outside quotes and drops the quotes', () => {
    expect(parseFontFamily('"Noto Serif TC", \'Source Han Serif\', serif')).toEqual([
      'Noto Serif TC',
      'Source Han Serif',
      'serif',
    ]);
    expect(parseFontFamily('"Font, With Comma", Arial')).toEqual(['Font, With Comma', 'Arial']);
  });
});

describe('pickFonts', () => {
  it('skips system aliases Word cannot look up', () => {
    expect(pickFonts('-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif')).toEqual({
      ascii: 'Inter',
    });
  });

  it('names a real face for a stack of generics only', () => {
    expect(pickFonts('system-ui, sans-serif')).toEqual({ ascii: 'Arial' });
    expect(pickFonts('ui-monospace, monospace')).toEqual({ ascii: 'Courier New' });
    expect(pickFonts('serif')).toEqual({ ascii: 'Times New Roman' });
  });

  /* 主題指定的中文字型必須寫進 w:eastAsia，否則 Word 會換字型、斷行跟著變。 */
  it('keeps the theme’s CJK face for East Asian text', () => {
    expect(pickFonts('"Noto Serif TC", serif')).toEqual({
      ascii: 'Noto Serif TC',
      eastAsia: 'Noto Serif TC',
    });
    expect(pickFonts('"Inter", "Noto Sans TC", sans-serif')).toEqual({
      ascii: 'Inter',
      eastAsia: 'Noto Sans TC',
    });
    expect(pickFonts('"微軟正黑體", sans-serif')).toEqual({
      ascii: '微軟正黑體',
      eastAsia: '微軟正黑體',
    });
  });

  /* 小型大寫的拉丁字型（Playfair Display SC）和 HK Grotesk 不是中日韓字型。 */
  it('does not take a Latin small-caps or "HK" family for a CJK face', () => {
    for (const name of ['Playfair Display SC', 'Alegreya Sans SC', 'Amatic SC', 'HK Grotesk']) {
      expect(isCjkFace(name)).toBe(false);
    }
    for (const name of ['Noto Serif SC', 'Noto Sans CJK TC', 'LXGW WenKai TC', 'Chiron Hei HK']) {
      expect(isCjkFace(name)).toBe(true);
    }
    expect(pickFonts('"Playfair Display SC", serif')).toEqual({ ascii: 'Playfair Display SC' });
    expect(pickFonts('"HK Grotesk", "Noto Sans TC", sans-serif')).toEqual({
      ascii: 'HK Grotesk',
      eastAsia: 'Noto Sans TC',
    });
  });

  it('leaves the East Asian face to Word when the theme names none', () => {
    expect(pickFonts('"Century Gothic", Arial, sans-serif')).toEqual({ ascii: 'Century Gothic' });
    expect(isCjkFace('Century Gothic')).toBe(false);
  });

  it('ignores emoji faces at the end of a stack', () => {
    expect(pickFonts('"Apple Color Emoji", "Segoe UI Emoji", sans-serif')).toEqual({
      ascii: 'Arial',
    });
  });
});

describe('eastAsiaLangFromFonts', () => {
  it('reads the language from the face name', () => {
    expect(eastAsiaLangFromFonts(['Noto Sans TC'])).toBe('zh-TW');
    expect(eastAsiaLangFromFonts(['PingFang SC'])).toBe('zh-CN');
    expect(eastAsiaLangFromFonts(['Noto Sans HK'])).toBe('zh-HK');
    expect(eastAsiaLangFromFonts(['Hiragino Sans'])).toBe('ja-JP');
    expect(eastAsiaLangFromFonts(['Noto Sans KR'])).toBe('ko-KR');
  });

  it('guesses nothing from a face that does not say', () => {
    expect(eastAsiaLangFromFonts(['Source Han Sans'])).toBeUndefined();
    expect(eastAsiaLangFromFonts([])).toBeUndefined();
  });
});

describe('standInFor', () => {
  /* 沒有字族資訊時，Word 會把缺少的字型一律換成 Times New Roman。 */
  it('tells Word what kind of face to substitute for a missing one', () => {
    expect(fontKindOf('"Inter", system-ui, sans-serif')).toBe('sans');
    expect(fontKindOf('"Noto Serif TC", serif')).toBe('serif');
    expect(fontKindOf('"JetBrains Mono", monospace')).toBe('mono');
    expect(standInFor({ name: 'Inter', kind: 'sans', eastAsia: false }, undefined)).toEqual({
      altName: 'Arial',
      charset: '00',
      family: 'swiss',
      pitch: 'variable',
    });
    expect(
      standInFor({ name: 'JetBrains Mono', kind: 'mono', eastAsia: false }, undefined),
    ).toMatchObject({
      altName: 'Courier New',
      family: 'modern',
      pitch: 'fixed',
    });
  });

  it('stands a CJK face in with one for the same language', () => {
    expect(standInFor({ name: 'Noto Serif TC', kind: 'serif', eastAsia: true }, 'zh-TW')).toEqual({
      altName: 'PMingLiU',
      charset: '88',
      family: 'roman',
      pitch: 'variable',
    });
    expect(
      standInFor({ name: 'Noto Sans JP', kind: 'sans', eastAsia: true }, 'ja-JP'),
    ).toMatchObject({
      altName: 'Yu Gothic',
      charset: '80',
    });
    // No language, no guess at a face — only the family.
    expect(
      standInFor({ name: 'Source Han Sans', kind: 'sans', eastAsia: true }, undefined),
    ).toEqual({
      charset: '00',
      family: 'swiss',
      pitch: 'variable',
    });
  });
});

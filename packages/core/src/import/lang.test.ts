import { describe, expect, it } from 'vitest';
import { detectLang } from './lang.ts';

describe('detectLang', () => {
  it('tells the two Chinese scripts apart', () => {
    expect(detectLang('# 季度報告\n\n我們這個季度的營收成長，主要來自新客戶。')).toBe('zh-Hant');
    expect(detectLang('# 季度报告\n\n我们这个季度的营收成长，主要来自新客户。')).toBe('zh-Hans');
  });

  it('reads kana as Japanese and Hangul as Korean', () => {
    expect(detectLang('# 四半期報告\n\n今期の売上は新しいお客様によって伸びました。')).toBe('ja');
    expect(detectLang('# 분기 보고서\n\n이번 분기 매출은 신규 고객 덕분에 늘었습니다.')).toBe('ko');
  });

  it('leaves a Latin document alone, even with a stray character', () => {
    expect(detectLang('# Quarterly report\n\nRevenue grew, mostly from new customers.')).toBe(
      undefined,
    );
    expect(detectLang('The word for book is 本, and that is all the Japanese here.')).toBe(
      undefined,
    );
  });
});

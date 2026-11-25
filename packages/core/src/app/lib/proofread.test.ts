import { describe, expect, it } from 'vitest';
import { type ProofreadRule, proofreadRuns, type TextRun } from './proofread.ts';
import { SIMPLIFIED_ONLY, TRADITIONAL_ONLY } from './proofread-script.ts';

function check(texts: string | string[], lang = 'en') {
  const runs: TextRun[] = (Array.isArray(texts) ? texts : [texts]).map((text, i) => ({
    text,
    page: 1,
    loc: `${i + 1}:0`,
  }));
  return proofreadRuns(runs, lang).findings;
}

function rules(texts: string | string[], lang = 'en'): ProofreadRule[] {
  return check(texts, lang).map((f) => f.rule);
}

describe('fullwidth-alnum', () => {
  it('flags full-width letters and digits in any language', () => {
    const [finding] = check('Install Ｗｉｎｄｏｗｓ １１ first.');
    expect(finding).toMatchObject({ rule: 'fullwidth-alnum', page: 1, loc: '1:0' });
    expect(finding?.message).toContain('"Windows"');
    expect(finding?.message).toContain('2 in this block');
    expect(rules('請安裝Ｗｉｎｄｏｗｓ', 'zh-Hant-TW')).toEqual(['fullwidth-alnum']);
  });

  it('leaves half-width text and full-width punctuation alone', () => {
    expect(rules('Windows 11 is fine.')).toEqual([]);
    expect(rules('這樣就好了。', 'zh-Hant-TW')).toEqual([]);
  });
});

describe('punctuation-width', () => {
  const zh = 'zh-Hant-TW';

  it('flags half-width punctuation beside CJK text in a Chinese document', () => {
    expect(rules('中文,中文', zh)).toEqual(['punctuation-width']);
    expect(rules('真的嗎?', zh)).toEqual(['punctuation-width']);
    expect(rules('電話:02-1234', zh)).toEqual(['punctuation-width']);
    expect(rules('請見(附錄)說明', zh)).toEqual(['punctuation-width']);
    const [finding] = check('中文,中文;中文', zh);
    expect(finding?.message).toContain('"，"');
    expect(finding?.message).toContain('2 in this block');
  });

  it('flags it in a Japanese document', () => {
    expect(rules('これは本です,あれは', 'ja')).toEqual(['punctuation-width']);
  });

  it('leaves numbers, Latin brackets, URLs and emoticons alone', () => {
    expect(rules('共1,000人參加,', zh)).toEqual(['punctuation-width']);
    expect(rules('共1,000人參加', zh)).toEqual([]);
    expect(rules('下午3:00開始', zh)).toEqual([]);
    expect(rules('使用 API (Application Programming Interface) 串接', zh)).toEqual([]);
    expect(rules('框架React(v19)很好', zh)).toEqual([]);
    expect(rules('網址https://example.com/a?b=1,2:3!x說明', zh)).toEqual([]);
    expect(rules('好開心:)', zh)).toEqual([]);
    expect(rules('很好(^_^)', zh)).toEqual([]);
    expect(rules('寄到a.b@example.com', zh)).toEqual([]);
  });

  it('flags full-width punctuation between Latin text in other documents', () => {
    expect(rules('Hello，world')).toEqual(['punctuation-width']);
    expect(rules('Use the API（v2）today')).toEqual(['punctuation-width']);
    expect(check('Hello，world')[0]?.message).toContain('","');
  });

  it('leaves quoted CJK text in an English document alone', () => {
    expect(rules('The word 中文（Chinese）means Chinese.')).toEqual([]);
    expect(rules('它說：「好。」')).toEqual([]);
    expect(rules('Done.')).toEqual([]);
  });

  it('reads a run by its own language', () => {
    const runs: TextRun[] = [{ text: 'Hello，world', page: 1, lang: 'zh-TW' }];
    expect(proofreadRuns(runs, 'en').findings).toEqual([]);
  });

  it('treats Korean as a non-CJK document', () => {
    expect(rules('안녕하세요, 반갑습니다.', 'ko')).toEqual([]);
  });
});

describe('script-mix', () => {
  it('flags Simplified-only characters in a Traditional document', () => {
    const [finding] = check('我们这个系统', 'zh-Hant-TW');
    expect(finding?.rule).toBe('script-mix');
    expect(finding?.message).toContain('们→們');
    expect(finding?.message).toContain('这→這');
    expect(finding?.message).toContain('个→個');
    expect(rules('時间', 'zh-TW')).toEqual(['script-mix']);
    expect(rules('時间', 'zh-HK')).toEqual(['script-mix']);
  });

  it('flags Traditional-only characters in a Simplified document', () => {
    const [finding] = check('我們的系统', 'zh-Hans-CN');
    expect(finding?.message).toContain('們→们');
    expect(rules('這是', 'zh-CN')).toEqual(['script-mix']);
  });

  it('leaves characters both scripts write alone', () => {
    expect(rules('皇后在里長家吃面，只有台系干部', 'zh-Hant-TW')).toEqual([]);
    expect(rules('皇后在里长家吃面，只有台系干部', 'zh-Hans')).toEqual([]);
  });

  it('lets a language picker name the other script in that script', () => {
    expect(rules('介面支援繁體中文、简体中文與日本語', 'zh-Hant-TW')).toEqual([]);
    expect(rules('界面支持简体中文、繁體中文和日本語', 'zh-Hans-CN')).toEqual([]);
  });

  it('only runs when the document says which script it uses', () => {
    expect(rules('我们這個', 'zh')).toEqual([]);
    expect(rules('我们這個', 'ja')).toEqual([]);
    expect(rules('我们這個')).toEqual([]);
  });

  it('keeps the table one-to-one, with no character on both sides', () => {
    expect(SIMPLIFIED_ONLY.size).toBeGreaterThan(200);
    expect(TRADITIONAL_ONLY.size).toBe(SIMPLIFIED_ONLY.size);
    for (const [simplified, traditional] of SIMPLIFIED_ONLY) {
      expect(simplified).not.toBe(traditional);
      expect(TRADITIONAL_ONLY.has(simplified)).toBe(false);
      expect(SIMPLIFIED_ONLY.has(traditional)).toBe(false);
    }
    for (const shared of '后里干只台面系着于价准范') {
      expect(SIMPLIFIED_ONLY.has(shared)).toBe(false);
    }
  });
});

describe('repeated-word', () => {
  it('flags a doubled Latin word, ignoring case', () => {
    const [finding] = check('Open the the file.');
    expect(finding?.rule).toBe('repeated-word');
    expect(finding?.message).toContain('"the the"');
    expect(rules('The the file.')).toEqual(['repeated-word']);
    expect(rules('Save it\nit later.')).toEqual(['repeated-word']);
  });

  it('respects word boundaries and intended doubles', () => {
    expect(rules('the theme')).toEqual([]);
    expect(rules('I knew that that was wrong.')).toEqual([]);
    expect(rules('We flew to Bora Bora.')).toEqual([]);
    expect(rules('bye bye')).toEqual([]);
  });

  it('flags doubled CJK function characters', () => {
    expect(rules('我的的書', 'zh-Hant-TW')).toEqual(['repeated-word']);
    expect(rules('這是是對的', 'zh-Hant-TW')).toEqual(['repeated-word']);
    expect(rules('他在在家', 'zh-Hant-TW')).toEqual(['repeated-word']);
    expect(rules('吃了了飯', 'zh-Hant-TW')).toEqual(['repeated-word']);
  });

  it('leaves real reduplication alone', () => {
    for (const text of [
      '謝謝你',
      '常常來',
      '天天見',
      '的的確確',
      '是是非非',
      '在在皆是',
      '小時了了',
      '了了一樁心願',
    ]) {
      expect(rules(text, 'zh-Hant-TW')).toEqual([]);
    }
  });
});

describe('term-casing', () => {
  it('reports a term capitalised two ways once, at the minority spelling', () => {
    const findings = check(['Push to GitHub.', 'GitHub Actions run.', 'Open Github now.']);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'term-casing', loc: '3:0' });
    expect(findings[0]?.message).toContain('"GitHub" ×2');
    expect(findings[0]?.message).toContain('"Github" ×1');
    expect(findings[0]?.snippet).toContain('Github');
  });

  it('ignores a capital first letter and ALL CAPS', () => {
    expect(rules(['the guide', 'The guide'])).toEqual([]);
    expect(rules(['JavaScript', 'JAVASCRIPT'])).toEqual([]);
    expect(rules(['iPhone', 'IPhone'])).toEqual([]);
  });

  it('works in a CJK document too', () => {
    expect(rules(['用JavaScript寫', '用Javascript寫'], 'zh-Hant-TW')).toEqual(['term-casing']);
  });
});

describe('proofreadRuns', () => {
  it('keeps a clean English document clean', () => {
    expect(
      rules([
        'Quarterly report, 2026: revenue grew 12% (see Table 1).',
        'Visit https://example.com/path?a=1 or email team@example.com.',
        'Costs were $1,250; margins held at 3:1.',
      ]),
    ).toEqual([]);
  });

  it('keeps a clean Traditional Chinese document clean', () => {
    expect(
      rules(
        [
          '這份報告整理了 2026 年第一季的營運成果，營收成長 12%（見表 1）。',
          '我們使用 React 與 TypeScript 開發，部署在 Google Cloud 上。',
          '下午 3:00 開會，共 1,000 人參加。',
        ],
        'zh-Hant-TW',
      ),
    ).toEqual([]);
  });

  it('keeps a clean Japanese document clean', () => {
    expect(
      rules(['これはテストです。', '詳しくは（付録）を参照してください！', '会社の写真'], 'ja'),
    ).toEqual([]);
  });

  it('reports a slip in a running header once, and caps each rule per page', () => {
    const header: TextRun[] = [1, 2, 3].map((page) => ({ text: 'the the', page, loc: '9:0' }));
    expect(proofreadRuns(header, 'en').findings).toHaveLength(1);

    const many: TextRun[] = Array.from({ length: 5 }, (_, i) => ({
      text: `the the ${i}`,
      page: 1,
      loc: `${i}:0`,
    }));
    const result = proofreadRuns(many, 'en');
    expect(result.findings).toHaveLength(3);
    expect(result.omitted).toBe(2);
  });
});

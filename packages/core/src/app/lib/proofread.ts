import { SIMPLIFIED_ONLY, TRADITIONAL_ONLY } from './proofread-script';

export type ProofreadRule =
  | 'fullwidth-alnum'
  | 'punctuation-width'
  | 'script-mix'
  | 'repeated-word'
  | 'term-casing';

export type ProofreadFinding = {
  /** 1-based sheet the text is on. */
  page: number;
  rule: ProofreadRule;
  severity: 'warn';
  message: string;
  /** The words around the problem, as printed. */
  snippet: string;
  /** `line:column` in the document source, from the inspector's `data-od-loc`. */
  loc?: string;
};

/**
 * One stretch of printed text inside a single block, in reading order. Code
 * and block boundaries end a run, so two runs never read as adjacent text.
 */
export type TextRun = {
  text: string;
  page: number;
  loc?: string;
  /** A `lang` set inside the sheet; the document's language otherwise. */
  lang?: string;
};

export type ProofreadOptions = {
  /** Findings kept per rule per page, so one bad page can't drown the report. */
  perPageLimit?: number;
  /** Findings kept per rule across the document. */
  perRuleLimit?: number;
};

export type ProofreadResult = { findings: ProofreadFinding[]; omitted: number };

const DEFAULTS = { perPageLimit: 3, perRuleLimit: 20 } as const;
const CONTEXT = 16;
const MASK = '￼';

const CJK_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々〆〇ー　-〿＀-／：-＠［-｀｛-･]/u;
const LATIN_RE = /[\p{Script=Latin}0-9]/u;
const DIGIT_RE = /[0-9]/;

const isCjk = (ch: string | undefined) => ch !== undefined && CJK_RE.test(ch);
const isLatin = (ch: string | undefined) => ch !== undefined && LATIN_RE.test(ch);
const isDigit = (ch: string | undefined) => ch !== undefined && DIGIT_RE.test(ch);

function isCjkLang(lang: string): boolean {
  return /^(zh|ja)(-|$)/i.test(lang);
}

function chineseScript(lang: string): 'hant' | 'hans' | null {
  if (/^zh-(hant|tw|hk|mo)(-|$)/i.test(lang)) return 'hant';
  if (/^zh-(hans|cn|sg|my)(-|$)/i.test(lang)) return 'hans';
  return null;
}

const MASKS = [
  /(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯"'<>]+/giu,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /(?<![\p{Script=Latin}\p{N}])[:;=][-^']?[()DPpO3|\\/\][*]+(?![\p{Script=Latin}\p{N}])/gu,
  // Kaomoji: a bracketed face is drawn with these, never written as prose.
  /[(（][^()（）\s\p{Script=Han}\p{Script=Latin}]{0,10}[´`^∀ω・_;*°ﾟ▽◕‿≧≦⊙•ｰ＾﹏∇ε><Д][^()（）\s\p{Script=Han}\p{Script=Latin}]{0,10}[)）]/gu,
];

/** Same length as the text, with URLs, addresses and emoticons blanked out. */
function masked(text: string): string {
  let out = text;
  for (const re of MASKS) {
    out = out.replace(re, (m) => MASK.repeat(m.length));
  }
  return out;
}

function snippetAt(text: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT);
  const to = Math.min(text.length, end + CONTEXT);
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`;
}

function times(n: number): string {
  return n > 1 ? ` (${n} in this block)` : '';
}

type Hit = { start: number; end: number };

function finding(run: TextRun, rule: ProofreadRule, message: string, hit: Hit): ProofreadFinding {
  return {
    page: run.page,
    rule,
    severity: 'warn',
    message,
    snippet: snippetAt(run.text, hit.start, hit.end),
    ...(run.loc ? { loc: run.loc } : {}),
  };
}

const FULLWIDTH_ALNUM_RE = /[Ａ-Ｚａ-ｚ０-９]+/g;

function toHalfWidth(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function fullwidthAlnum(run: TextRun, text: string): ProofreadFinding[] {
  const hits = Array.from(text.matchAll(FULLWIDTH_ALNUM_RE));
  const first = hits[0];
  if (!first) return [];
  const word = first[0];
  return [
    finding(
      run,
      'fullwidth-alnum',
      `Full-width "${word}" — write "${toHalfWidth(word)}"${times(hits.length)}.`,
      { start: first.index, end: first.index + word.length },
    ),
  ];
}

const TO_FULL: Record<string, string> = {
  ',': '，',
  ';': '；',
  ':': '：',
  '?': '？',
  '!': '！',
  '(': '（',
  ')': '）',
};
const TO_HALF: Record<string, string> = Object.fromEntries(
  Object.entries(TO_FULL).map(([half, full]) => [full, half]),
);
TO_HALF['。'] = '.';

function halfWidthInCjk(text: string): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (!(ch in TO_FULL)) continue;
    const prev = text[i - 1];
    const next = text[i + 1];
    let wrong: boolean;
    // A bracket belongs to what it holds: `中文 (English)` is fine, `(中文)` is not.
    if (ch === '(') wrong = isCjk(next);
    else if (ch === ')') wrong = isCjk(prev);
    else if ((ch === ',' || ch === ':') && isDigit(prev) && isDigit(next)) wrong = false;
    else wrong = isCjk(prev) || isCjk(next);
    if (wrong) hits.push({ start: i, end: i + 1 });
  }
  return hits;
}

function neighbour(text: string, from: number, step: 1 | -1): string | undefined {
  let i = from + step;
  while (text[i] === ' ') i += step;
  return text[i];
}

function fullWidthInLatin(text: string): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    // The opening bracket speaks for the pair; `中文（Chinese）means` closes
    // a bracket opened after CJK text.
    if (!(ch in TO_HALF) || ch === '）') continue;
    if (isLatin(neighbour(text, i, -1)) && isLatin(neighbour(text, i, 1))) {
      hits.push({ start: i, end: i + 1 });
    }
  }
  return hits;
}

function punctuationWidth(run: TextRun, text: string, lang: string): ProofreadFinding[] {
  const cjk = isCjkLang(lang);
  const hits = cjk ? halfWidthInCjk(text) : fullWidthInLatin(text);
  const first = hits[0];
  if (!first) return [];
  const ch = text[first.start] as string;
  const message = cjk
    ? `Half-width "${ch}" next to CJK text — use "${TO_FULL[ch]}"${times(hits.length)}.`
    : `Full-width "${ch}" between Latin text — use "${TO_HALF[ch]}"${times(hits.length)}.`;
  return [finding(run, 'punctuation-width', message, first)];
}

const SIMPLIFIED_NAMES = /简体中文|中文简体|简体|简中/g;
const TRADITIONAL_NAMES = /日本語|繁體中文|中文繁體|正體中文|繁體|正體|繁中/g;

function scriptMix(run: TextRun, source: string, lang: string): ProofreadFinding[] {
  const script = chineseScript(lang);
  if (!script) return [];
  const table = script === 'hant' ? SIMPLIFIED_ONLY : TRADITIONAL_ONLY;
  // A language picker writes each script's name in that script.
  const own = script === 'hant' ? SIMPLIFIED_NAMES : TRADITIONAL_NAMES;
  const text = source.replace(own, (m) => MASK.repeat(m.length));
  const found = new Map<string, string>();
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    const other = table.get(ch);
    if (!other) continue;
    if (start < 0) start = i;
    found.set(ch, other);
  }
  if (start < 0) return [];
  const pairs = Array.from(found, ([from, to]) => `${from}→${to}`).join(', ');
  const message =
    script === 'hant'
      ? `Simplified characters in a Traditional Chinese document: ${pairs}.`
      : `Traditional characters in a Simplified Chinese document: ${pairs}.`;
  return [finding(run, 'script-mix', message, { start, end: start + 1 })];
}

/** Doubled on purpose often enough that flagging them would be noise. */
const LEGIT_DOUBLES = new Set([
  'that',
  'had',
  'is',
  'was',
  'bye',
  'ha',
  'no',
  'so',
  'very',
  'la',
  'knock',
  'can',
  'do',
  'yes',
  'oh',
  'ho',
  'hey',
  'now',
  'well',
  'go',
  'tut',
  'wait',
]);

const LATIN_DOUBLE_RE = /(?<![\p{L}\p{N}'’-])(\p{Script=Latin}+)\s+(\1)(?![\p{L}\p{N}'’-])/giu;

/**
 * Doubled function characters that are typing slips, each with the contexts
 * where the pair is a real word: 的的確確, 是是非非, 在在皆是, 小時了了.
 */
const CJK_DOUBLES: Record<string, { before?: string; after?: string }> = {
  的: { after: '確确' },
  是: { after: '非' },
  在: { after: '皆都顯显說说表證证' },
  了: { before: '時时小', after: '分無无可一心這这此卻却結结' },
};

function repeatedWord(run: TextRun, text: string): ProofreadFinding[] {
  const out: ProofreadFinding[] = [];
  for (const m of text.matchAll(LATIN_DOUBLE_RE)) {
    const [whole, word = '', second = ''] = m;
    if (LEGIT_DOUBLES.has(word.toLowerCase())) continue;
    // `Bora Bora`, `Walla Walla`: a capital on the second copy is a name.
    if (second[0] !== second[0]?.toLowerCase()) continue;
    out.push(
      finding(run, 'repeated-word', `"${word} ${second}" — the word is doubled.`, {
        start: m.index,
        end: m.index + whole.length,
      }),
    );
  }
  for (let i = 0; i + 1 < text.length; i++) {
    const ch = text[i] as string;
    const rule = CJK_DOUBLES[ch];
    if (!rule || text[i + 1] !== ch) continue;
    const prev = text[i - 1] ?? '';
    const next = text[i + 2] ?? '';
    if (prev === ch || next === ch) continue;
    if (rule.before && prev && rule.before.includes(prev)) continue;
    if (rule.after && next && rule.after.includes(next)) continue;
    out.push(
      finding(run, 'repeated-word', `"${ch}${ch}" — the character is doubled.`, {
        start: i,
        end: i + 2,
      }),
    );
    i++;
  }
  return out;
}

const WORD_RE =
  /(?<![\p{Script=Latin}\p{N}])\p{Script=Latin}[\p{Script=Latin}\p{N}]+(?![\p{Script=Latin}\p{N}])/gu;

type Occurrence = { run: TextRun; start: number; end: number; form: string };

/**
 * Compares how one term is capitalised across the whole document. A capital
 * only on the first letter is a sentence start and ALL CAPS is a heading
 * style, so neither counts as a different spelling.
 */
function termCasing(runs: Array<{ run: TextRun; text: string }>): ProofreadFinding[] {
  const terms = new Map<string, Map<string, Occurrence[]>>();
  for (const { run, text } of runs) {
    for (const m of text.matchAll(WORD_RE)) {
      const form = m[0];
      if (form === form.toUpperCase()) continue;
      const variant = (form[0] as string).toLowerCase() + form.slice(1);
      const key = form.toLowerCase();
      let variants = terms.get(key);
      if (!variants) {
        variants = new Map();
        terms.set(key, variants);
      }
      const list = variants.get(variant) ?? [];
      list.push({ run, start: m.index, end: m.index + form.length, form });
      variants.set(variant, list);
    }
  }

  const out: ProofreadFinding[] = [];
  for (const variants of terms.values()) {
    if (variants.size < 2) continue;
    // Most used first; on a tie the spelling met first is the one kept.
    const ranked = Array.from(variants.values()).sort((a, b) => b.length - a.length);
    const minority = ranked[ranked.length - 1] as Occurrence[];
    const first = minority[0] as Occurrence;
    const listed = ranked.map((list) => `"${commonForm(list)}" ×${list.length}`).join(', ');
    out.push(
      finding(
        first.run,
        'term-casing',
        `One term, several spellings: ${listed} — pick one.`,
        first,
      ),
    );
  }
  return out;
}

function commonForm(list: Occurrence[]): string {
  const counts = new Map<string, number>();
  for (const { form } of list) counts.set(form, (counts.get(form) ?? 0) + 1);
  return Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/**
 * Reads the printed text of a document and reports consistency slips a
 * proofreader would mark: full-width letters, punctuation of the wrong width
 * for the language, Simplified characters in a Traditional document (or the
 * reverse), a doubled word, a term capitalised two ways.
 *
 * Advice only: every finding is a warning.
 */
export function proofreadRuns(
  runs: TextRun[],
  docLang: string,
  opts: ProofreadOptions = {},
): ProofreadResult {
  const perPageLimit = opts.perPageLimit ?? DEFAULTS.perPageLimit;
  const perRuleLimit = opts.perRuleLimit ?? DEFAULTS.perRuleLimit;

  const prepared = runs.map((run) => ({ run, text: masked(run.text) }));
  const raw: ProofreadFinding[] = [];
  for (const { run, text } of prepared) {
    const lang = run.lang || docLang;
    raw.push(
      ...fullwidthAlnum(run, text),
      ...punctuationWidth(run, text, lang),
      ...scriptMix(run, text, lang),
      ...repeatedWord(run, text),
    );
  }
  raw.push(...termCasing(prepared));

  const seen = new Set<string>();
  const perPage = new Map<string, number>();
  const perRule = new Map<string, number>();
  const findings: ProofreadFinding[] = [];
  let omitted = 0;
  for (const f of raw.sort((a, b) => a.page - b.page)) {
    // A running header prints the same words from one source line on every sheet.
    const key = `${f.rule}\0${f.loc ?? ''}\0${f.message}\0${f.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pageKey = `${f.rule}\0${f.page}`;
    const onPage = perPage.get(pageKey) ?? 0;
    const inRule = perRule.get(f.rule) ?? 0;
    if (onPage >= perPageLimit || inRule >= perRuleLimit) {
      omitted++;
      continue;
    }
    perPage.set(pageKey, onPage + 1);
    perRule.set(f.rule, inRule + 1);
    findings.push(f);
  }
  return { findings, omitted };
}

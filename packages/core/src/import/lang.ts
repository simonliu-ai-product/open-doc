// Characters common enough to show up in any page of running text, written
// differently in the two Chinese scripts. A handful is enough to tell them
// apart; nothing here tries to be a dictionary.
const TRADITIONAL = '們這個說為國來會時對過還後點經學發應麼與實體關開種現當於從際';
const SIMPLIFIED = '们这个说为国来会时对过还后点经学发应么与实体关开种现当于从际';

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/**
 * The language a Markdown file is written in, when it is one whose sheets
 * need to say so — Chinese, Japanese, Korean — or `undefined` for anything
 * else, which the document then leaves at its default.
 */
export function detectLang(text: string): string | undefined {
  const han = count(text, /\p{Script=Han}/gu);
  const kana = count(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const hangul = count(text, /\p{Script=Hangul}/gu);
  const latin = count(text, /\p{Script=Latin}/gu);
  const cjk = han + kana + hangul;
  // Mostly Latin with a stray character or two is still a Latin document.
  if (cjk === 0 || cjk < latin * 0.25) return undefined;
  if (hangul > han + kana) return 'ko';
  if (kana > 0 && kana >= han * 0.05) return 'ja';

  let traditional = 0;
  let simplified = 0;
  for (const char of text) {
    // Characters the two scripts share appear in both strings at the same
    // index; only one that differs counts as a vote.
    const t = TRADITIONAL.indexOf(char);
    const s = SIMPLIFIED.indexOf(char);
    if (t !== -1 && SIMPLIFIED[t] !== char) traditional++;
    if (s !== -1 && TRADITIONAL[s] !== char) simplified++;
  }
  return simplified > traditional ? 'zh-Hans' : 'zh-Hant';
}

import type { FontSet } from './model';

/**
 * Names in a CSS stack that are not faces Word can look up. The browser
 * resolves them to whatever the system uses; Word would take them literally and
 * fall back to Times New Roman.
 */
const NOT_A_FACE = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'inherit',
  'initial',
  'unset',
  'revert',
]);

const EMOJI_FACE = /emoji|symbol/i;

/**
 * Faces that carry CJK glyphs. Matched by name because there is nothing else to
 * go on — the stack is text — and a name in any non-Latin script is taken as one too.
 * Deliberately not a bare "Gothic": Century Gothic is a Latin face.
 */
const CJK_FACE =
  /\bCJK\b|Source Han|PingFang|Hiragino|Meiryo|JhengHei|YaHei|SimSun|SimHei|MingLiU|DFKai|BiauKai|LiGothic|LiSung|LiHei|Heiti|Songti|Kaiti|STSong|FangSong|Malgun|Batang|Gulim|Dotum|Nanum|Apple SD Gothic|Yu Gothic|Mincho|MS P?Gothic|[^ -\u024F]/i;

/** Splits a computed `font-family` into names, quotes removed, order kept. */
export function parseFontFamily(value: string): string[] {
  const names: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      if (current.trim()) names.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) names.push(current.trim());
  return names;
}

/**
 * A region cut named at the end — "Noto Sans TC", "Chiron Hei HK". Case matters,
 * and SC counts only on a family that has CJK cuts: "Playfair Display SC" and
 * "Alegreya Sans SC" are small caps, and "HK Grotesk" is Latin.
 */
const CJK_REGION = /\s(?:TC|HK|JP|KR)$|\b(?:Noto|LXGW|WenKai|Sarasa|HarmonyOS|Chiron)\b.*\sSC$/;

export function isCjkFace(name: string): boolean {
  return CJK_FACE.test(name) || CJK_REGION.test(name);
}

export type FontKind = 'sans' | 'serif' | 'mono';

/** What the stack falls back to — the only thing it says about the face's design. */
export function fontKindOf(fontFamily: string): FontKind {
  for (const name of parseFontFamily(fontFamily).map((n) => n.toLowerCase())) {
    if (name === 'serif' || name === 'ui-serif') return 'serif';
    if (name === 'monospace' || name === 'ui-monospace') return 'mono';
  }
  return 'sans';
}

const LATIN_STANDIN: Record<FontKind, string> = {
  sans: 'Arial',
  serif: 'Times New Roman',
  mono: 'Courier New',
};

/**
 * The faces Word should ask for, taken in the theme's own order: the first real
 * face for Latin text, and the first CJK face for East Asian text. When the
 * stack names no CJK face the East Asian slot is left empty, so Word picks its
 * own for the language instead of being told to set Chinese in Arial.
 */
export function pickFonts(fontFamily: string): FontSet {
  const names = parseFontFamily(fontFamily);
  const faces = names.filter(
    (name) => !NOT_A_FACE.has(name.toLowerCase()) && !EMOJI_FACE.test(name),
  );
  const ascii = faces[0] ?? LATIN_STANDIN[fontKindOf(fontFamily)];
  const eastAsia = faces.find(isCjkFace);
  return eastAsia ? { ascii, eastAsia } : { ascii };
}

/**
 * The language tag Word uses for line breaking and proofing of East Asian
 * text, read from the face names. Nothing is guessed from the text itself: Han
 * characters alone do not say whether a document is Traditional or Simplified.
 */
export function eastAsiaLangFromFonts(faces: string[]): string | undefined {
  for (const face of faces) {
    if (/\bHK\b/.test(face)) return 'zh-HK';
    if (/\bTC\b|JhengHei|MingLiU|DFKai|BiauKai|LiGothic|LiSung/i.test(face)) return 'zh-TW';
    if (/\bSC\b|YaHei|SimSun|SimHei/i.test(face)) return 'zh-CN';
    if (/\bJP\b|Hiragino|Meiryo|Mincho|Yu Gothic|MS P?Gothic/i.test(face)) return 'ja-JP';
    if (/\bKR\b|Malgun|Batang|Gulim|Dotum|Nanum/i.test(face)) return 'ko-KR';
  }
  return undefined;
}

const CJK_STANDIN: Record<string, { sans: string; serif: string; charset: string }> = {
  'zh-TW': { sans: 'Microsoft JhengHei', serif: 'PMingLiU', charset: '88' },
  'zh-HK': { sans: 'Microsoft JhengHei', serif: 'PMingLiU', charset: '88' },
  'zh-CN': { sans: 'Microsoft YaHei', serif: 'SimSun', charset: '86' },
  'ja-JP': { sans: 'Yu Gothic', serif: 'Yu Mincho', charset: '80' },
  'ko-KR': { sans: 'Malgun Gothic', serif: 'Batang', charset: '81' },
};

export type FontDeclaration = {
  name: string;
  kind: FontKind;
  /** Used for East Asian text, so it wants a CJK face in its place. */
  eastAsia: boolean;
};

/**
 * Where Word should look when the face is not installed. Without a family,
 * Word substitutes Times New Roman for any missing face — a sans-serif theme
 * would arrive in a serif on every machine that lacks the exact face.
 */
export function standInFor(
  font: FontDeclaration,
  eastAsiaLang: string | undefined,
): {
  altName?: string;
  charset: string;
  family: 'swiss' | 'roman' | 'modern';
  pitch: 'variable' | 'fixed';
} {
  const family = font.kind === 'serif' ? 'roman' : font.kind === 'mono' ? 'modern' : 'swiss';
  const pitch = font.kind === 'mono' ? 'fixed' : 'variable';
  if (font.eastAsia) {
    const cjk = eastAsiaLang ? CJK_STANDIN[eastAsiaLang] : undefined;
    if (!cjk) return { charset: '00', family, pitch };
    const altName = font.kind === 'serif' ? cjk.serif : cjk.sans;
    return {
      altName: altName === font.name ? undefined : altName,
      charset: cjk.charset,
      family,
      pitch,
    };
  }
  const altName = LATIN_STANDIN[font.kind];
  return { altName: altName === font.name ? undefined : altName, charset: '00', family, pitch };
}

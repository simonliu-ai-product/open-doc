/**
 * The element panel's Format section, shared by the viewer and the dev server:
 * which style keys it may write, which design tokens each one offers, and what
 * a value has to look like before it is spliced into a document's source.
 */

export const STYLE_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'lineHeight',
  'letterSpacing',
  'color',
  'background',
] as const;

export type StyleProp = (typeof STYLE_PROPS)[number];

/** `null` takes the key off the element, so the value comes from wherever it did before. */
export type StyleValue = string | number | null;
export type StyleChanges = Partial<Record<StyleProp, StyleValue>>;

/** What the source says about one key: a literal, a design token, or code the panel can only show. */
export type StyleSource =
  | { kind: 'literal'; value: string | number }
  | { kind: 'token'; token: string }
  | { kind: 'code'; code: string };

/** `from` names the shared style object the key comes from, when it is not the element's own. */
export type StyleOrigin = StyleSource & { from?: string };

export type StyleInfo =
  | { editable: true; props: Partial<Record<StyleProp, StyleOrigin>> }
  | { editable: false; reason: string; props?: undefined };

export function isStyleProp(value: unknown): value is StyleProp {
  return typeof value === 'string' && (STYLE_PROPS as readonly string[]).includes(value);
}

export type TokenGroup = 'font' | 'size' | 'color' | 'leading';

/** The `--od-*` variables a document's design const defines, by what they can stand for. */
export const TOKENS: Record<TokenGroup, Array<{ token: string; label: string }>> = {
  font: [
    { token: 'font-heading', label: 'Heading' },
    { token: 'font-body', label: 'Body' },
    { token: 'font-mono', label: 'Mono' },
  ],
  size: [
    { token: 'size-title', label: 'Title' },
    { token: 'size-h1', label: 'H1' },
    { token: 'size-h2', label: 'H2' },
    { token: 'size-h3', label: 'H3' },
    { token: 'size-body', label: 'Body' },
    { token: 'size-caption', label: 'Caption' },
  ],
  color: [
    { token: 'text', label: 'Text' },
    { token: 'muted', label: 'Muted' },
    { token: 'accent', label: 'Accent' },
    { token: 'rule', label: 'Rule' },
    { token: 'bg', label: 'Background' },
  ],
  leading: [{ token: 'leading', label: 'Leading' }],
};

export const PROP_TOKENS: Partial<Record<StyleProp, TokenGroup>> = {
  fontFamily: 'font',
  fontSize: 'size',
  color: 'color',
  background: 'color',
  lineHeight: 'leading',
};

const TOKEN_VALUE = /^var\(\s*--od-([a-z0-9-]+)\s*\)$/;

/** `var(--od-accent)` → `accent`; anything else is not a token reference. */
export function tokenOf(value: string): string | null {
  return TOKEN_VALUE.exec(value.trim())?.[1] ?? null;
}

export function tokenValue(token: string): string {
  return `var(--od-${token})`;
}

function isToken(prop: StyleProp, value: string): boolean {
  const group = PROP_TOKENS[prop];
  const token = tokenOf(value);
  return group !== undefined && token !== null && TOKENS[group].some((t) => t.token === token);
}

const LENGTH = /^-?\d+(\.\d+)?(px|em|rem)$/;
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// Everything written is a quoted string literal, so nothing here can become
// code; this keeps out what would end a declaration in exported CSS instead.
const PLAIN = /^[^;{}<>\\\n\r]{1,200}$/;

/** Whether the panel may write this value for this key — the server's check, run again in the viewer. */
export function isValidStyleValue(prop: StyleProp, value: StyleValue): boolean {
  if (value === null) return true;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    if (prop === 'fontWeight') return value >= 100 && value <= 900 && value % 100 === 0;
    if (prop === 'lineHeight') return value > 0 && value <= 10;
    return false;
  }
  if (!PLAIN.test(value)) return false;
  if (isToken(prop, value)) return true;
  switch (prop) {
    case 'fontFamily':
      return tokenOf(value) === null;
    case 'fontSize':
      return LENGTH.test(value) && !value.startsWith('-');
    case 'letterSpacing':
      return LENGTH.test(value) || value === 'normal';
    case 'fontWeight':
      return value === 'normal' || value === 'bold';
    case 'fontStyle':
      return value === 'normal' || value === 'italic';
    case 'textAlign':
      return ['left', 'center', 'right', 'justify', 'start', 'end'].includes(value);
    case 'lineHeight':
      return value === 'normal';
    case 'color':
    case 'background':
      return HEX.test(value) || value === 'transparent';
  }
}

/** `fontSize` → `font-size`, for `style.setProperty`. */
export function cssName(prop: StyleProp): string {
  return prop.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/** A value as CSS, the way React would render it onto the element. */
export function cssValue(prop: StyleProp, value: string | number): string {
  return typeof value === 'number' && prop !== 'fontWeight' && prop !== 'lineHeight'
    ? `${value}px`
    : String(value);
}

/** `rgb(29, 78, 216)` → `#1d4ed8`; a translucent or unparseable colour is `null`. */
export function rgbToHex(value: string): string | null {
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
  if (!match) return HEX.test(value) ? value.toLowerCase() : null;
  const alpha = match[4];
  if (alpha !== undefined) {
    const a = alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
    if (a < 1) return null;
  }
  return `#${[match[1], match[2], match[3]]
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;
}

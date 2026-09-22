/**
 * XML 1.0 forbids most C0 controls even when escaped, and Word refuses a part
 * that contains one — a stray vertical tab pasted into a paragraph would make the
 * whole file unreadable. Lone surrogates are dropped for the same reason.
 */
const INVALID_XML =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching the characters XML forbids is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function xmlText(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function xmlAttr(value: string): string {
  return xmlText(value).replace(/"/g, '&quot;');
}

/** An element; numbers are rounded, since every measure WordprocessingML takes is whole. */
export function el(
  name: string,
  attrs: Record<string, string | number | undefined> = {},
  children?: string,
): string {
  let open = `<${name}`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    open += ` ${key}="${typeof value === 'number' ? Math.round(value) : xmlAttr(value)}"`;
  }
  if (children === undefined || children === '') return `${open}/>`;
  return `${open}>${children}</${name}>`;
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

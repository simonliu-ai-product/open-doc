const LINK_SCHEME = /^\s*([a-z][a-z0-9+.-]*):/i;

/**
 * A link survives into the exported HTML, where a `javascript:` URL would run.
 * Web, mail and phone addresses and in-document or relative paths only. The
 * page editor checks before it offers the link; the server checks again before
 * it writes one.
 */
export function isSafeHref(href: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being refused
  if (/[\u0000-\u001f]/.test(href) || href.trim() === '') return false;
  const scheme = href.match(LINK_SCHEME)?.[1]?.toLowerCase();
  return scheme === undefined || ['http', 'https', 'mailto', 'tel'].includes(scheme);
}

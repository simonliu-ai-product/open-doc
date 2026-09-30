/**
 * In dev, `loc-tags-plugin` stamps `data-od-loc` onto the call site of a
 * framework component that forwards it. The component puts it back on the
 * host that prints the call site's words, so the inspector can select what it
 * rendered — a table, a caption, a footnote — and find the source behind it.
 * `data-od-prop` says which attribute of the call site those words come from.
 */
export const LOC_PROP = 'data-od-loc';
export const PROP_ATTR = 'data-od-prop';

/** The attributes pointing a host back at its call site; nothing outside dev. */
export function sourceAttrs(loc: string | undefined, prop?: string): Record<string, string> {
  if (!loc) return {};
  return prop ? { [LOC_PROP]: loc, [PROP_ATTR]: prop } : { [LOC_PROP]: loc };
}

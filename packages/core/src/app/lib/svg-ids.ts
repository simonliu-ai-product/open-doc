/**
 * A page is drawn more than once — the thumbnail rail, the viewer, the print
 * copy, an export's offscreen copy — and an inline SVG's `id` comes along each
 * time. `url(#glow)` resolves to the *first* element in the document with that
 * id, which is the thumbnail's. When printing hides the rail, the print copy's
 * gradients, clip paths and markers point into a subtree that is not drawn,
 * and they vanish from the PDF. Renaming the ids inside a copy, and every
 * reference to them inside the same copy, keeps each copy pointing at itself.
 */

const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

export function scopeSvgIds(root: Element, suffix: string): void {
  const renamed = new Map<string, string>();
  for (const el of Array.from(root.querySelectorAll('svg [id]'))) {
    const next = `${el.id}--${suffix}`;
    renamed.set(el.id, next);
    el.id = next;
  }
  if (renamed.size === 0) return;

  for (const el of Array.from(root.querySelectorAll('svg, svg *'))) {
    for (const attr of Array.from(el.attributes)) {
      let value = attr.value;
      if ((attr.localName === 'href' || attr.name === 'xlink:href') && value.startsWith('#')) {
        const target = renamed.get(value.slice(1));
        if (target) value = `#${target}`;
      } else if (value.includes('url(')) {
        value = value.replace(URL_REF, (whole, quote: string, id: string) => {
          const target = renamed.get(id);
          return target ? `url(${quote}#${target}${quote})` : whole;
        });
      }
      if (value !== attr.value) el.setAttributeNS(attr.namespaceURI, attr.name, value);
    }
  }
}

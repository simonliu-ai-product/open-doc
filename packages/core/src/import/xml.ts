/**
 * Just enough XML for the parts of an OOXML package: elements, attributes,
 * text, CDATA and the predefined and numeric entities. Prefixes stay part of
 * the name (`w:p`) because Word writes the same ones everywhere; namespaces
 * are not resolved. Hand-written for the same reason as the Markdown parser —
 * `core` ships to every user.
 */

export type XmlElement = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
};

export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

const ATTR_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Parses `source`. With `canonical` (namespace URI → prefix), names are
 * rewritten to that prefix whatever the file declared — Strict OOXML, or a
 * producer that writes `ns0:p` — so readers can match `w:p` alone.
 */
export function parseXml(source: string, canonical?: Record<string, string>): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const raws: string[] = ['#document'];
  const scopes: Array<Record<string, string>> = [{}];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt === -1) {
      if (stack.length > 1) top.children.push(decodeEntities(source.slice(i)));
      break;
    }
    if (lt > i && stack.length > 1) top.children.push(decodeEntities(source.slice(i, lt)));

    if (source.startsWith('<!--', lt)) {
      i = endOf(source, '-->', lt);
    } else if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt);
      const stop = end === -1 ? source.length : end;
      top.children.push(source.slice(lt + 9, stop));
      i = stop + 3;
    } else if (source.startsWith('<?', lt)) {
      i = endOf(source, '?>', lt);
    } else if (source.startsWith('<!', lt)) {
      i = endOf(source, '>', lt);
    } else if (source[lt + 1] === '/') {
      const gt = source.indexOf('>', lt);
      const name = source.slice(lt + 2, gt === -1 ? source.length : gt).trim();
      // Pop to the matching element so one stray close tag cannot swallow the rest.
      for (let depth = stack.length - 1; depth > 0; depth--) {
        if (raws[depth] === name) {
          stack.length = depth;
          raws.length = depth;
          scopes.length = depth;
          break;
        }
      }
      i = gt === -1 ? source.length : gt + 1;
    } else {
      const gt = tagEnd(source, lt);
      const raw = source.slice(lt + 1, gt);
      const selfClosing = raw.endsWith('/');
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const nameEnd = body.search(/\s/);
      const name = nameEnd === -1 ? body : body.slice(0, nameEnd);
      const rawAttrs: Array<[string, string]> = [];
      if (nameEnd !== -1) {
        for (const match of body.slice(nameEnd).matchAll(ATTR_RE)) {
          rawAttrs.push([match[1], decodeEntities(match[2] ?? match[3] ?? '')]);
        }
      }
      let scope = scopes[scopes.length - 1];
      if (canonical && rawAttrs.some(([key]) => key === 'xmlns' || key.startsWith('xmlns:'))) {
        scope = { ...scope };
        for (const [key, value] of rawAttrs) {
          if (key === 'xmlns') scope[''] = value;
          else if (key.startsWith('xmlns:')) scope[key.slice(6)] = value;
        }
      }
      const rename = (qname: string, element: boolean) => {
        if (!canonical) return qname;
        const colon = qname.indexOf(':');
        if (colon === -1 && !element) return qname;
        const prefix = colon === -1 ? '' : qname.slice(0, colon);
        if (prefix === 'xmlns' || prefix === 'xml') return qname;
        const uri = scope[prefix];
        const target = uri === undefined ? undefined : canonical[uri];
        if (target === undefined) return qname;
        return `${target}:${colon === -1 ? qname : qname.slice(colon + 1)}`;
      };
      const attrs: Record<string, string> = {};
      for (const [key, value] of rawAttrs) attrs[rename(key, false)] = value;
      const element: XmlElement = { name: rename(name, true), attrs, children: [] };
      top.children.push(element);
      if (!selfClosing) {
        stack.push(element);
        raws.push(name);
        scopes.push(scope);
      }
      i = gt + 1;
    }
  }

  const first = root.children.find((node): node is XmlElement => typeof node !== 'string');
  return first ?? root;
}

function endOf(source: string, marker: string, from: number): number {
  const end = source.indexOf(marker, from);
  return end === -1 ? source.length : end + marker.length;
}

/** The `>` closing a start tag; an attribute value may itself contain one. */
function tagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from + 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return i;
    }
  }
  return source.length;
}

export function elements(node: XmlElement, name?: string): XmlElement[] {
  return node.children.filter(
    (child): child is XmlElement => typeof child !== 'string' && (!name || child.name === name),
  );
}

export function child(node: XmlElement | undefined, name: string): XmlElement | undefined {
  return node?.children.find(
    (entry): entry is XmlElement => typeof entry !== 'string' && entry.name === name,
  );
}

/** Every descendant with this name, in document order. */
export function descendants(node: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const entry of node.children) {
    if (typeof entry === 'string') continue;
    if (entry.name === name) out.push(entry);
    descendants(entry, name, out);
  }
  return out;
}

export function textContent(node: XmlElement): string {
  return node.children
    .map((entry) => (typeof entry === 'string' ? entry : textContent(entry)))
    .join('');
}

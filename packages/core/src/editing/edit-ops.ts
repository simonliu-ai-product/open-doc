import { isSafeHref } from '../app/lib/href.ts';
import {
  type AstNode,
  findJsxAt,
  findJsxOnLine,
  parseSource,
  walkAst,
  walkJsx,
} from './babel-walk.ts';

export type EditTarget = { line: number; column: number };

export type EditResult =
  | { ok: true; source: string }
  | { ok: false; status: number; error: string };

function escapeJsxText(text: string): string {
  return text.replace(/[{}<>]/g, (char) => `{'${char}'}`);
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * One editable run of text, or a piece of markup the editor must leave alone.
 * Splitting an element this way is what lets a paragraph like
 * `對外端點為 <code>/mcp</code>，另外自訂 …` stay editable without the editor
 * having to understand — or destroy — the inline markup.
 */
export type TextPart =
  | {
      kind: 'text';
      index: number;
      value: string;
      formattable?: true;
      /** Present when the run already carries emphasis, code, or links. */
      segments?: TextSegment[];
    }
  | { kind: 'markup'; label: string };

/** A stretch of a run and the inline formatting it carries. */
export type TextSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

export type TextTargetInfo = {
  editable: boolean;
  /** The element's own text, markup excluded. */
  text: string;
  parts: TextPart[];
  reason?: string;
};

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function jsxChildren(element: AstNode): AstNode[] {
  return (element.children ?? []) as AstNode[];
}

function labelOf(node: AstNode): string {
  if (node.type === 'JSXExpressionContainer') return '{…}';
  if (node.type === 'JSXElement') {
    const name = (node.openingElement as AstNode | undefined)?.name as
      | { name?: string }
      | undefined;
    return `<${name?.name ?? 'element'}>`;
  }
  return '…';
}

/*
 * ---------------------------------------------------------------------------
 * Where the words live
 * ---------------------------------------------------------------------------
 *
 * The text on screen is often nowhere near the element that renders it. A
 * government letter is written almost entirely through helpers:
 *
 *   {agency}　{kind}          ← an attribute at the call site
 *   {label}：{value}          ← one entry of an array the call site passed
 *   {name}：{children}        ← whatever sits between the call site's tags
 *
 * Each child of the element resolves on its own. Resolving the element as a
 * whole is what used to make `{label}：{value}` offer nothing but the colon:
 * the literal text was found, so the props were never looked for.
 */

/**
 * A span of source an edit may rewrite, and the escaping that span needs.
 * `jsx` marks text written between tags — the only kind that can take
 * `<strong>` or `<em>`; an attribute or a string literal holds a string.
 */
type Slot = {
  value: string;
  start: number;
  end: number;
  escape: (text: string) => string;
  jsx?: true;
  segments?: TextSegment[];
};

type Context = { ast: AstNode; source: string; shown?: string };

/** Text written straight into the JSX. Its surrounding whitespace is indentation, so the slot excludes it. */
function literalSlot(node: AstNode): Slot {
  const raw = node.value as string;
  const leading = (raw.match(/^\s*/)?.[0] ?? '').length;
  const trailing = (raw.match(/\s*$/)?.[0] ?? '').length;
  return {
    value: raw.trim(),
    start: node.start + leading,
    end: node.end - trailing,
    escape: escapeJsxText,
    jsx: true,
  };
}

/** `name="…"` at a call site. Only the quote in use has to be escaped. */
function attributeSlot(node: AstNode, source: string): Slot {
  const quote = source[node.start] ?? '"';
  const entity = quote === '"' ? '&quot;' : '&apos;';
  return {
    value: node.value as string,
    start: node.start + 1,
    end: node.end - 1,
    escape: (text) => text.split(quote).join(entity),
  };
}

/** A plain string in an array or object literal — a JS string, not JSX. */
function stringSlot(node: AstNode, source: string): Slot {
  const quote = source[node.start] ?? "'";
  return {
    value: node.value as string,
    start: node.start + 1,
    end: node.end - 1,
    escape: (text) => text.split('\\').join('\\\\').split(quote).join(`\\${quote}`),
  };
}

/**
 * A code block is written `<Code>{`docs/…`}</Code>` — the words are a template
 * literal, not JSX text. Nothing has to be traced to reach them, so they are a
 * slot wherever they appear: as a child of the element, or as the children one
 * call site handed a helper.
 */
function expressionSlot(child: AstNode, source: string): Slot | null {
  if (child.type !== 'JSXExpressionContainer') return null;
  const expression = child.expression as AstNode | undefined;
  if (expression?.type === 'StringLiteral') return stringSlot(expression, source);
  if (expression?.type !== 'TemplateLiteral') return null;
  // A substitution means part of the text is computed; writing over the whole
  // literal would delete it.
  if (((expression.expressions ?? []) as AstNode[]).length > 0) return null;
  const quasis = (expression.quasis ?? []) as AstNode[];
  const raw = ((quasis[0]?.value as { raw?: string } | undefined)?.raw ?? '') as string;
  if (quasis.length !== 1) return null;
  return {
    value: raw,
    start: expression.start + 1,
    end: expression.end - 1,
    escape: (text) => text.split('\\').join('\\\\').split('`').join('\\`').split('${').join('\\${'),
  };
}

function identifierName(child: AstNode): string | null {
  if (child.type !== 'JSXExpressionContainer') return null;
  const expression = child.expression as AstNode | undefined;
  if (expression?.type !== 'Identifier') return null;
  return (expression.name as string) ?? null;
}

/** The chain of nodes from the program down to this element — its scopes, in order. */
function pathTo(ast: AstNode, element: AstNode): AstNode[] | null {
  let found: AstNode[] | null = null;
  const visit = (node: AstNode, trail: AstNode[]): void => {
    if (found) return;
    const here = [...trail, node];
    if (node === element) {
      found = here;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (isAstNode(child)) visit(child, here);
      } else if (isAstNode(value)) visit(value, here);
    }
  };
  visit(ast, []);
  return found;
}

function propNames(declarator: AstNode): string[] {
  const params = (declarator.init as AstNode | undefined)?.params as AstNode[] | undefined;
  const pattern = params?.[0];
  if (pattern?.type !== 'ObjectPattern') return [];
  return ((pattern.properties ?? []) as AstNode[])
    .map((property) => ((property.key as AstNode | undefined)?.name as string | undefined) ?? '')
    .filter((name) => name !== '');
}

/** The component this element belongs to, and the props it declares. */
function componentScope(path: AstNode[]): { name: string; props: string[] } | null {
  for (let index = path.length - 1; index >= 0; index--) {
    const node = path[index];
    if (node?.type !== 'VariableDeclarator') continue;
    const name = (node.id as AstNode | undefined)?.name as string | undefined;
    const props = propNames(node);
    if (name !== undefined && props.length > 0) return { name, props };
  }
  return null;
}

/** The `xs.map(entry => …)` this element is rendered inside, if any. */
function mapScope(path: AstNode[]): { pattern: AstNode; array: string } | null {
  for (let index = path.length - 1; index >= 1; index--) {
    const arrow = path[index];
    const call = path[index - 1];
    if (arrow?.type !== 'ArrowFunctionExpression' || call?.type !== 'CallExpression') continue;
    const callee = call.callee as AstNode | undefined;
    if (callee?.type !== 'MemberExpression') continue;
    if (((callee.property as AstNode | undefined)?.name as string | undefined) !== 'map') continue;
    const object = callee.object as AstNode | undefined;
    const pattern = ((arrow.params ?? []) as AstNode[])[0];
    if (object?.type !== 'Identifier' || !pattern) continue;
    return { pattern, array: object.name as string };
  }
  return null;
}

function patternNames(pattern: AstNode): string[] {
  if (pattern.type === 'Identifier') return [pattern.name as string];
  if (pattern.type === 'ArrayPattern') {
    return ((pattern.elements ?? []) as (AstNode | null)[])
      .filter((element): element is AstNode => element?.type === 'Identifier')
      .map((element) => element.name as string);
  }
  if (pattern.type === 'ObjectPattern') {
    return ((pattern.properties ?? []) as AstNode[])
      .map(
        (property) => ((property.value as AstNode | undefined)?.name as string | undefined) ?? '',
      )
      .filter((name) => name !== '');
  }
  return [];
}

/** Destructure one array entry the way the map callback does. */
function entryBindings(pattern: AstNode, entry: AstNode, source: string): Map<string, Slot> | null {
  if (pattern.type === 'Identifier') {
    if (entry.type !== 'StringLiteral') return null;
    return new Map([[pattern.name as string, stringSlot(entry, source)]]);
  }

  const bindings = new Map<string, Slot>();
  if (pattern.type === 'ArrayPattern') {
    if (entry.type !== 'ArrayExpression') return null;
    const values = (entry.elements ?? []) as (AstNode | null)[];
    const targets = (pattern.elements ?? []) as (AstNode | null)[];
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      if (!target) continue;
      const value = values[index];
      if (target.type !== 'Identifier' || value?.type !== 'StringLiteral') return null;
      bindings.set(target.name as string, stringSlot(value, source));
    }
    return bindings.size > 0 ? bindings : null;
  }

  if (pattern.type === 'ObjectPattern') {
    if (entry.type !== 'ObjectExpression') return null;
    for (const property of (pattern.properties ?? []) as AstNode[]) {
      const key = ((property.key as AstNode | undefined)?.name as string | undefined) ?? '';
      const local = ((property.value as AstNode | undefined)?.name as string | undefined) ?? '';
      if (key === '' || local === '') return null;
      const match = ((entry.properties ?? []) as AstNode[]).find(
        (candidate) =>
          ((candidate.key as AstNode | undefined)?.name as string | undefined) === key ||
          ((candidate.key as AstNode | undefined)?.value as string | undefined) === key,
      );
      const value = match?.value as AstNode | undefined;
      if (value?.type !== 'StringLiteral') return null;
      bindings.set(local, stringSlot(value, source));
    }
    return bindings.size > 0 ? bindings : null;
  }

  return null;
}

/**
 * Two call sites of the same component render different words, and only what
 * is on screen can say which one was clicked — without it a save rewrites
 * whichever came first in the file. An entry that cannot be told apart from
 * its neighbours is therefore not editable at all.
 */
function fits(bindings: Map<string, Slot>, shown?: string): boolean {
  if (shown === undefined) return true;
  const visible = normalizeText(shown);
  const values = [...bindings.values()].map((slot) => normalizeText(slot.value));
  if (values.join('') === '') return false;
  return values.every((value) => visible.includes(value));
}

function tagName(node: AstNode): string | undefined {
  return ((node.openingElement as AstNode | undefined)?.name as AstNode | undefined)?.name as
    | string
    | undefined;
}

/**
 * `<Section name="主旨">…</Section>` puts its words between the tags rather
 * than in an attribute. Only a lone run of text qualifies: anything nested
 * would be flattened into a string and lost on the first save.
 */
function childrenSlot(node: AstNode, source: string): Slot | null {
  const children = jsxChildren(node).filter(
    (child) => child.type !== 'JSXText' || (child.value as string).trim() !== '',
  );
  const only = children[0];
  if (children.length !== 1 || !only) return null;
  if (only.type === 'JSXText') return literalSlot(only);
  return expressionSlot(only, source);
}

function callSiteBindings(
  node: AstNode,
  wanted: string[],
  source: string,
): Map<string, Slot> | null {
  const attributes = ((node.openingElement as AstNode | undefined)?.attributes ?? []) as AstNode[];
  const bindings = new Map<string, Slot>();
  for (const name of wanted) {
    if (name === 'children') {
      const slot = childrenSlot(node, source);
      if (!slot) return null;
      bindings.set(name, slot);
      continue;
    }
    const attribute = attributes.find(
      (candidate) => ((candidate.name as AstNode | undefined)?.name as string | undefined) === name,
    );
    const value = attribute?.value as AstNode | undefined;
    if (value?.type !== 'StringLiteral') return null;
    bindings.set(name, attributeSlot(value, source));
  }
  return bindings;
}

function propBindings(ctx: Context, component: string, wanted: string[]): Map<string, Slot> | null {
  const matches: Map<string, Slot>[] = [];
  walkJsx(ctx.ast, (node) => {
    if (tagName(node) !== component) return;
    const bindings = callSiteBindings(node, wanted, ctx.source);
    if (bindings && fits(bindings, ctx.shown)) matches.push(bindings);
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Every array literal that could be the one being mapped over. */
function arrayCandidates(ctx: Context, name: string, component: string | null): AstNode[] {
  const found: AstNode[] = [];
  walkAst(ctx.ast, (node) => {
    if (node.type === 'VariableDeclarator') {
      const id = node.id as AstNode | undefined;
      const init = node.init as AstNode | undefined;
      if (id?.type === 'Identifier' && id.name === name && init?.type === 'ArrayExpression') {
        found.push(init);
      }
      return;
    }
    if (node.type !== 'JSXElement' || component === null || tagName(node) !== component) return;
    const attributes = ((node.openingElement as AstNode).attributes ?? []) as AstNode[];
    for (const attribute of attributes) {
      if (((attribute.name as AstNode | undefined)?.name as string | undefined) !== name) continue;
      const value = attribute.value as AstNode | undefined;
      if (value?.type !== 'JSXExpressionContainer') continue;
      const expression = value.expression as AstNode | undefined;
      if (expression?.type === 'ArrayExpression') found.push(expression);
    }
  });
  return found;
}

function mapBindings(
  ctx: Context,
  scope: { pattern: AstNode; array: string },
  component: string | null,
  wanted: string[],
): Map<string, Slot> | null {
  const matches: Map<string, Slot>[] = [];
  for (const array of arrayCandidates(ctx, scope.array, component)) {
    for (const entry of (array.elements ?? []) as (AstNode | null)[]) {
      if (!entry) continue;
      const bindings = entryBindings(scope.pattern, entry, ctx.source);
      if (!bindings || !wanted.every((name) => bindings.has(name))) continue;
      if (fits(bindings, ctx.shown)) matches.push(bindings);
    }
  }
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function bindingsFor(ctx: Context, element: AstNode, names: string[]): Map<string, Slot> | null {
  const path = pathTo(ctx.ast, element);
  if (!path) return null;
  const map = mapScope(path);
  const component = componentScope(path);
  const mapped = map ? patternNames(map.pattern) : [];

  const bindings = new Map<string, Slot>();
  const fromMap = names.filter((name) => mapped.includes(name));
  if (map && fromMap.length > 0) {
    const entry = mapBindings(ctx, map, component?.name ?? null, fromMap);
    if (entry)
      for (const name of fromMap) {
        const slot = entry.get(name);
        if (slot) bindings.set(name, slot);
      }
  }

  const fromProps = names.filter(
    (name) => !mapped.includes(name) && (component?.props.includes(name) ?? false),
  );
  if (component && fromProps.length > 0) {
    const call = propBindings(ctx, component.name, fromProps);
    if (call) for (const [name, slot] of call) bindings.set(name, slot);
  }

  return bindings.size > 0 ? bindings : null;
}

/*
 * ---------------------------------------------------------------------------
 * Formatted runs
 * ---------------------------------------------------------------------------
 *
 * `Use real <code>h1</code>/<code>h2</code> elements` is one sentence to the
 * reader. Text next to `<strong>`, `<em>`, `<code>` or a plain `<a href>` is
 * read as a single run whose pieces carry their formatting, so the formatting
 * can be edited and taken off again. Anything more than a bare mark — a
 * `style`, a `className`, a component — is still markup the editor leaves
 * alone, because rewriting the run would drop whatever that attribute meant.
 */

const MARK_TAGS: Record<string, 'bold' | 'italic' | 'code'> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  code: 'code',
};

type Marks = Omit<TextSegment, 'text'>;

/** JSX's own whitespace rule: lines are trimmed at the break and joined by one space. */
function cookJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  if (lines.length === 1) return raw;
  return lines
    .map((line, at) => {
      let out = line;
      if (at > 0) out = out.replace(/^[ \t]+/, '');
      if (at < lines.length - 1) out = out.replace(/[ \t]+$/, '');
      return out;
    })
    .filter((line) => line !== '')
    .join(' ');
}

function isSpacing(node: AstNode): boolean {
  if (node.type === 'JSXText') return cookJsxText(node.value as string).trim() === '';
  if (node.type !== 'JSXExpressionContainer') return false;
  const expression = node.expression as AstNode | undefined;
  return expression?.type === 'StringLiteral' && (expression.value as string).trim() === '';
}

function markOf(node: AstNode): Marks | null {
  if (node.type !== 'JSXElement') return null;
  const name = tagName(node);
  const attributes = ((node.openingElement as AstNode).attributes ?? []) as AstNode[];
  if (name === 'a') {
    const only = attributes[0];
    const value = only?.value as AstNode | undefined;
    if (attributes.length !== 1 || (only?.name as AstNode | undefined)?.name !== 'href') {
      return null;
    }
    return value?.type === 'StringLiteral' ? { href: value.value as string } : null;
  }
  const mark = name ? MARK_TAGS[name] : undefined;
  return mark && attributes.length === 0 ? { [mark]: true } : null;
}

/** The pieces a run of children renders, or null when any of them is more than text and marks. */
function segmentsOf(children: AstNode[], inherited: Marks): TextSegment[] | null {
  const out: TextSegment[] = [];
  for (const child of children) {
    if (child.type === 'JSXText') {
      out.push({ text: cookJsxText(child.value as string), ...inherited });
    } else if (isSpacing(child)) {
      const expression = child.expression as AstNode;
      out.push({ text: expression.value as string, ...inherited });
    } else if (isBreak(child)) {
      out.push({ text: '\n', ...inherited });
    } else {
      const marks = markOf(child);
      if (!marks) return null;
      const inner = segmentsOf(jsxChildren(child), { ...inherited, ...marks });
      if (!inner) return null;
      out.push(...inner);
    }
  }
  return out;
}

/** `<br />`: a line break inside a run, read as `'\n'` and written back as the same tag. */
function isBreak(node: AstNode): boolean {
  if (node.type !== 'JSXElement' || tagName(node) !== 'br') return false;
  const attributes = ((node.openingElement as AstNode).attributes ?? []) as AstNode[];
  return attributes.length === 0 && jsxChildren(node).length === 0;
}

function isInline(child: AstNode): boolean {
  return child.type === 'JSXText' || isSpacing(child) || isBreak(child) || markOf(child) !== null;
}

function mergeSegments(segments: TextSegment[]): TextSegment[] {
  const out: TextSegment[] = [];
  const same = (a: TextSegment, b: TextSegment) =>
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.code) === Boolean(b.code) &&
    a.href === b.href;
  for (const segment of segments) {
    if (segment.text === '') continue;
    const last = out[out.length - 1];
    if (last && same(last, segment)) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

function isFormatted(segments: TextSegment[] | undefined): segments is TextSegment[] {
  return (
    segments?.some((segment) => segment.bold || segment.italic || segment.code || segment.href) ??
    false
  );
}

/**
 * A run of text and marks as one slot. Spacing at either end is left outside
 * it, as a literal run's indentation is, so a rewrite keeps the break the
 * formatter put there.
 */
function formattedSlot(group: AstNode[]): Slot | null {
  let first = 0;
  let last = group.length - 1;
  while (first <= last && isSpacing(group[first] as AstNode)) first++;
  while (last >= first && isSpacing(group[last] as AstNode)) last--;
  const inner = group.slice(first, last + 1);
  const head = inner[0];
  const tail = inner[inner.length - 1];
  if (!head || !tail) return null;
  if (inner.length === 1 && head.type === 'JSXText') return literalSlot(head);

  const pieces = segmentsOf(inner, {});
  if (!pieces) return null;
  const leading =
    head.type === 'JSXText' ? ((head.value as string).match(/^\s*/)?.[0] ?? '').length : 0;
  const trailing =
    tail.type === 'JSXText' ? ((tail.value as string).match(/\s*$/)?.[0] ?? '').length : 0;
  const segments = mergeSegments(pieces);
  // Indentation only: a `<br />` at either end is the author's.
  const firstPiece = segments[0];
  if (firstPiece) firstPiece.text = firstPiece.text.replace(/^[ \t]+/, '');
  const lastPiece = segments[segments.length - 1];
  if (lastPiece) lastPiece.text = lastPiece.text.replace(/[ \t]+$/, '');
  const trimmed = mergeSegments(segments);
  return {
    value: trimmed.map((segment) => segment.text).join(''),
    start: head.start + leading,
    end: tail.end - trailing,
    escape: escapeJsxText,
    jsx: true,
    ...(isFormatted(trimmed) ? { segments: trimmed } : {}),
  };
}

const NEST: Array<keyof Marks> = ['href', 'bold', 'italic', 'code'];

/**
 * Segments back to JSX. Neighbours that share a mark share one tag — a link
 * over a bold and a plain word is one `<a>`, not two.
 */
function renderSegments(
  segments: TextSegment[],
  escapeText: (text: string) => string,
  level = 0,
): string {
  const key = NEST[level];
  if (key === undefined) {
    return segments
      .map((segment) => segment.text.split('\n').map(escapeText).join('<br />'))
      .join('');
  }
  const groups: Array<{ value: TextSegment[keyof Marks]; items: TextSegment[] }> = [];
  for (const segment of segments) {
    const value = segment[key] || undefined;
    const last = groups[groups.length - 1];
    if (last && last.value === value) last.items.push(segment);
    else groups.push({ value, items: [segment] });
  }
  return groups
    .map(({ value, items }) => {
      const inner = renderSegments(items, escapeText, level + 1);
      if (!value) return inner;
      if (key === 'href')
        return `<a href="${String(value).split('"').join('&quot;')}">${inner}</a>`;
      const tag = key === 'bold' ? 'strong' : key === 'italic' ? 'em' : 'code';
      return `<${tag}>${inner}</${tag}>`;
    })
    .join('');
}

type Resolution = { parts: TextPart[]; slots: Slot[] };

/** The element's children, each resolved to a writable slot or left as markup. */
function resolve(element: AstNode, ctx?: Context): Resolution {
  const children = jsxChildren(element);
  const names = children
    .map((child) => identifierName(child))
    .filter((name): name is string => name !== null);
  const bindings = ctx && names.length > 0 ? bindingsFor(ctx, element, names) : null;

  const parts: TextPart[] = [];
  const slots: Slot[] = [];
  const take = (slot: Slot): void => {
    parts.push({
      kind: 'text',
      index: slots.length,
      value: slot.value,
      ...(slot.jsx ? { formattable: true as const } : {}),
      ...(slot.segments ? { segments: slot.segments } : {}),
    });
    slots.push(slot);
  };

  for (let at = 0; at < children.length; at++) {
    const child = children[at] as AstNode;
    if (isInline(child)) {
      let end = at;
      while (end + 1 < children.length && isInline(children[end + 1] as AstNode)) end++;
      const group = children.slice(at, end + 1);
      at = end;
      const slot = formattedSlot(group);
      if (slot && slot.value !== '') take(slot);
      continue;
    }
    const name = identifierName(child);
    const slot =
      (name === null ? undefined : bindings?.get(name)) ??
      (ctx ? (expressionSlot(child, ctx.source) ?? undefined) : undefined);
    // `{' '}` is how JSX keeps a space across a line break. It is spacing, not
    // words, and it renders as a node the page editor never pairs with a run
    // — offering it made every paragraph written that way uneditable.
    if (slot && slot.value.trim() === '') continue;
    if (slot) take(slot);
    else parts.push({ kind: 'markup', label: labelOf(child) });
  }
  return { parts, slots };
}

export function partsOf(element: AstNode): TextPart[] {
  return resolve(element).parts;
}

/*
 * ---------------------------------------------------------------------------
 * Text a framework component renders from an attribute
 * ---------------------------------------------------------------------------
 *
 * `<Figure caption="…">` and `<DataTable columns={[{ label: '…' }]}>` print
 * words that are not children of anything: they are attribute values at the
 * call site. The component marks the host that prints one with the call
 * site's loc and a path into its attributes (`data-od-prop="columns.2.label"`),
 * and the edit is written to that string and nowhere else.
 */

function propertyKey(property: AstNode): string | undefined {
  const key = property.key as AstNode | undefined;
  return (key?.name as string | undefined) ?? (key?.value as string | undefined);
}

/** The string a prop path names on the element, as a writable slot. */
function propSlot(element: AstNode, path: string, source: string): Slot | null {
  const [name, ...steps] = path.split('.');
  const attributes = ((element.openingElement as AstNode).attributes ?? []) as AstNode[];
  const attribute = attributes.find(
    (candidate) => ((candidate.name as AstNode | undefined)?.name as string | undefined) === name,
  );
  const value = attribute?.value as AstNode | undefined;
  if (value?.type === 'StringLiteral' && steps.length === 0) return attributeSlot(value, source);
  let node = value?.type === 'JSXExpressionContainer' ? (value.expression as AstNode) : undefined;
  for (const step of steps) {
    if (node?.type === 'ArrayExpression' && /^\d+$/.test(step)) {
      node = ((node.elements ?? []) as (AstNode | null)[])[Number(step)] ?? undefined;
    } else if (node?.type === 'ObjectExpression') {
      const match = ((node.properties ?? []) as AstNode[]).find(
        (property) => property.type === 'ObjectProperty' && propertyKey(property) === step,
      );
      node = match?.value as AstNode | undefined;
    } else {
      return null;
    }
  }
  return node?.type === 'StringLiteral' ? stringSlot(node, source) : null;
}

/**
 * Where an element's content comes from when it is data, not source: a table
 * whose rows are an imported `.csv`. Naming the file is the useful answer —
 * the words cannot be edited here, but the reader now knows where they can.
 */
function dataSource(element: AstNode, ast: AstNode): string | null {
  const attributes = ((element.openingElement as AstNode).attributes ?? []) as AstNode[];
  const names = attributes
    .map((attribute) => (attribute.value as AstNode | undefined)?.expression as AstNode | undefined)
    .filter((expression): expression is AstNode => expression?.type === 'Identifier')
    .map((expression) => expression.name as string);
  let found: string | null = null;
  walkAst(ast, (node) => {
    if (found || node.type !== 'ImportDeclaration') return;
    const from = (node.source as AstNode).value as string;
    if (!/\.(csv|tsv|json)$/.test(from)) return;
    const locals = ((node.specifiers ?? []) as AstNode[]).map(
      (specifier) => (specifier.local as AstNode).name as string,
    );
    if (locals.some((local) => names.includes(local))) found = from;
  });
  return found;
}

function describe(element: AstNode, ctx?: Context): TextTargetInfo {
  const { parts } = resolve(element, ctx);
  const texts = parts.filter(
    (part): part is Extract<TextPart, { kind: 'text' }> => part.kind === 'text',
  );
  if (texts.length === 0) {
    const generated = parts.some((part) => part.kind === 'markup' && part.label === '{…}');
    const data = ctx ? dataSource(element, ctx.ast) : null;
    return {
      editable: false,
      text: '',
      parts,
      reason: data
        ? `the values come from ${data} — edit that file, or leave a comment for the agent`
        : generated
          ? 'text is produced by code — edit whatever feeds it'
          : 'element has no text of its own',
    };
  }
  return { editable: true, text: texts.map((part) => part.value).join(' '), parts };
}

/** What the inspector shows before the user starts typing. */
export function readTextAt(
  source: string,
  target: EditTarget,
  shown?: string,
): TextTargetInfo | null {
  const ast = parseSource(source);
  if (!ast) return null;
  const element = findJsxAt(ast, target.line, target.column);
  return element ? describe(element, { ast, source, shown }) : null;
}

export type ResolvedTarget = TextTargetInfo & EditTarget;

/**
 * Picks the element an inspector click meant.
 *
 * Coordinates alone are not enough: fallback candidates come from React's
 * `_debugSource`, whose columns drift once the loc-tag transform has widened
 * the line. The rendered text the user is looking at is the tiebreaker — an
 * element only wins if its source text is part of what is on screen.
 */
export function resolveTextTarget(
  source: string,
  candidates: EditTarget[],
  expected?: string,
  prop?: string,
): ResolvedTarget | null {
  const ast = parseSource(source);
  if (!ast) return null;
  if (prop !== undefined) {
    const first = candidates[0];
    const element = first && findJsxAt(ast, first.line, first.column);
    if (!first || !element) return null;
    const slot = propSlot(element, prop, source);
    if (!slot) {
      return {
        editable: false,
        text: '',
        parts: [],
        reason: `\`${prop}\` is not a plain string here — edit it in source`,
        ...first,
      };
    }
    return {
      editable: true,
      text: slot.value,
      parts: [{ kind: 'text', index: 0, value: slot.value }],
      ...first,
    };
  }
  const ctx: Context = { ast, source, shown: expected };
  const shown = expected ? normalizeText(expected) : null;

  // Compare run by run. Joining them would introduce spacing the DOM never
  // had, so a paragraph interrupted by <strong> would fail to match itself.
  const matches = (info: TextTargetInfo) => {
    if (!shown) return true;
    const runs = info.parts.filter((part) => part.kind === 'text');
    if (runs.length === 0) return false;
    return runs.every((part) => part.kind === 'text' && shown.includes(normalizeText(part.value)));
  };

  for (const candidate of candidates) {
    const exact = findJsxAt(ast, candidate.line, candidate.column);
    if (exact) {
      const info = describe(exact, ctx);
      if (info.editable && matches(info)) return { ...info, ...candidate };
    }
    // The column may have drifted; scan the rest of the line, but only accept
    // an element whose text is actually on screen.
    if (!shown) continue;
    for (const node of findJsxOnLine(ast, candidate.line, candidate.column)) {
      const info = describe(node, ctx);
      const start = node.loc?.start;
      if (!info.editable || !matches(info) || !start) continue;
      return { ...info, line: start.line, column: start.column };
    }
  }

  const first = candidates[0];
  if (!first) return null;
  const clicked = findJsxAt(ast, first.line, first.column);
  return clicked ? { ...describe(clicked, ctx), ...first } : null;
}

/**
 * Replaces one text run of an element, leaving its markup and every other run
 * untouched. `expected` is the text the caller believes is there; a mismatch
 * means the source moved under us and the write is refused.
 */
export function replaceTextAt(
  source: string,
  target: EditTarget,
  text: string,
  opts: {
    index?: number;
    expected?: string;
    shown?: string;
    segments?: TextSegment[];
    prop?: string;
  } = {},
): EditResult {
  const { source: next, results } = replaceTextsAt(source, [{ ...target, ...opts, text }]);
  const result = results[0];
  if (!result) return { ok: false, status: 500, error: 'no result for the edit' };
  return result.ok ? { ok: true, source: next } : result;
}

type SlotResult = { ok: true; slot: Slot } | { ok: false; status: number; error: string };

function slotAt(
  ast: AstNode,
  source: string,
  edit: EditTarget & { index?: number; expected?: string; shown?: string; prop?: string },
): SlotResult {
  const element = findJsxAt(ast, edit.line, edit.column);
  if (!element) return { ok: false, status: 404, error: 'no element at that source location' };
  if (edit.prop !== undefined) {
    const slot = propSlot(element, edit.prop, source);
    if (!slot) return { ok: false, status: 422, error: `\`${edit.prop}\` is not a plain string` };
    if (edit.expected !== undefined && normalizeText(slot.value) !== normalizeText(edit.expected)) {
      return {
        ok: false,
        status: 409,
        error: 'source changed since this was opened — reselect it',
      };
    }
    return { ok: true, slot };
  }

  const { slots } = resolve(element, { ast, source, shown: edit.shown });
  if (slots.length === 0) {
    return { ok: false, status: 422, error: 'element has no text to replace' };
  }
  const slot = slots[edit.index ?? 0];
  if (!slot) return { ok: false, status: 404, error: 'no such text run in this element' };
  if (edit.expected !== undefined && normalizeText(slot.value) !== normalizeText(edit.expected)) {
    return { ok: false, status: 409, error: 'source changed since this was opened — reselect it' };
  }
  return { ok: true, slot };
}

export type TextEdit = EditTarget & {
  text: string;
  /** A path into the element's attributes, for words a component prints from a prop. */
  prop?: string;
  /** The run as formatted pieces; `text` is their concatenation. */
  segments?: TextSegment[];
  index?: number;
  expected?: string;
  shown?: string;
};

/** What goes into the slot: plain escaped text, or JSX for the formatted pieces. */
function slotText(slot: Slot, edit: TextEdit): string {
  if (!slot.jsx || !edit.segments) return slot.escape(edit.text);
  return renderSegments(mergeSegments(edit.segments), slot.escape);
}

export type TextEditOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * Applies several run replacements as one write.
 *
 * Every edit is located against the source as the caller last saw it, before
 * any of them lands: an edit's `line:column` is only true of that source, and
 * resolving each against the output of the previous one would find elements
 * shifted by whatever was typed above them. The splices then go in back to
 * front so none moves another.
 *
 * A failed edit is reported and skipped; the rest still land. Two edits that
 * reach the same span — one prop rendered by two elements — must agree, or the
 * later one is refused rather than silently winning.
 */
export function replaceTextsAt(
  source: string,
  edits: TextEdit[],
): { source: string; results: TextEditOutcome[] } {
  const ast = parseSource(source);
  if (!ast) {
    const error = { ok: false as const, status: 422, error: 'could not parse document source' };
    return { source, results: edits.map(() => error) };
  }

  const results: TextEditOutcome[] = [];
  const planned: Array<{ slot: Slot; text: string }> = [];
  for (const edit of edits) {
    const found = slotAt(ast, source, edit);
    if (!found.ok) {
      results.push(found);
      continue;
    }
    if (found.slot.segments && !edit.segments) {
      results.push({
        ok: false,
        status: 422,
        error:
          'this text carries code, emphasis or links — send it as segments so the formatting is kept',
      });
      continue;
    }
    if (isFormatted(edit.segments) && !found.slot.jsx) {
      results.push({
        ok: false,
        status: 422,
        error: 'formatting needs text written in the document itself, not passed in as a string',
      });
      continue;
    }
    const unsafe = edit.segments?.find((segment) => segment.href && !isSafeHref(segment.href));
    if (unsafe) {
      results.push({
        ok: false,
        status: 422,
        error: `links must be web, mail, phone, or in-document addresses: ${unsafe.href}`,
      });
      continue;
    }
    const text = slotText(found.slot, edit);
    const same = planned.find(
      (other) => other.slot.start === found.slot.start && other.slot.end === found.slot.end,
    );
    if (same && same.text !== text) {
      results.push({
        ok: false,
        status: 409,
        error: 'another edit in this save rewrites the same text',
      });
      continue;
    }
    if (!same) planned.push({ slot: found.slot, text });
    results.push({ ok: true });
  }

  let next = source;
  for (const { slot, text } of [...planned].sort((a, b) => b.slot.start - a.slot.start)) {
    next = next.slice(0, slot.start) + text + next.slice(slot.end);
  }
  return { source: next, results };
}

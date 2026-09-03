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
  | { kind: 'text'; index: number; value: string }
  | { kind: 'markup'; label: string };

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

/** A span of source an edit may rewrite, and the escaping that span needs. */
type Slot = { value: string; start: number; end: number; escape: (text: string) => string };

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
    parts.push({ kind: 'text', index: slots.length, value: slot.value });
    slots.push(slot);
  };

  for (const child of children) {
    if (child.type === 'JSXText') {
      if ((child.value as string).trim() !== '') take(literalSlot(child));
      continue;
    }
    const name = identifierName(child);
    const slot =
      (name === null ? undefined : bindings?.get(name)) ??
      (ctx ? (expressionSlot(child, ctx.source) ?? undefined) : undefined);
    if (slot) take(slot);
    else parts.push({ kind: 'markup', label: labelOf(child) });
  }
  return { parts, slots };
}

export function partsOf(element: AstNode): TextPart[] {
  return resolve(element).parts;
}

function describe(element: AstNode, ctx?: Context): TextTargetInfo {
  const { parts } = resolve(element, ctx);
  const texts = parts.filter(
    (part): part is Extract<TextPart, { kind: 'text' }> => part.kind === 'text',
  );
  if (texts.length === 0) {
    const generated = parts.some((part) => part.kind === 'markup' && part.label === '{…}');
    return {
      editable: false,
      text: '',
      parts,
      reason: generated
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
): ResolvedTarget | null {
  const ast = parseSource(source);
  if (!ast) return null;
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
  opts: { index?: number; expected?: string; shown?: string } = {},
): EditResult {
  const ast = parseSource(source);
  if (!ast) return { ok: false, status: 422, error: 'could not parse document source' };

  const element = findJsxAt(ast, target.line, target.column);
  if (!element) return { ok: false, status: 404, error: 'no element at that source location' };

  const { slots } = resolve(element, { ast, source, shown: opts.shown });
  if (slots.length === 0) {
    return { ok: false, status: 422, error: 'element has no text to replace' };
  }
  const slot = slots[opts.index ?? 0];
  if (!slot) return { ok: false, status: 404, error: 'no such text run in this element' };
  if (opts.expected !== undefined && normalizeText(slot.value) !== normalizeText(opts.expected)) {
    return { ok: false, status: 409, error: 'source changed since this was opened — reselect it' };
  }

  return {
    ok: true,
    source: source.slice(0, slot.start) + slot.escape(text) + source.slice(slot.end),
  };
}

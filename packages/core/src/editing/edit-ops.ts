import { type AstNode, findJsxAt, findJsxOnLine, parseSource, walkJsx } from './babel-walk.ts';

export type EditTarget = { line: number; column: number };

export type EditResult =
  | { ok: true; source: string }
  | { ok: false; status: number; error: string };

/** JSX text is written literally; only these characters have to be escaped. */
function escapeAttribute(text: string): string {
  return text.replace(/"/g, '&quot;');
}

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

/** Text children with content, in document order. */
function textNodes(element: AstNode): AstNode[] {
  return jsxChildren(element).filter(
    (child) => child.type === 'JSXText' && (child.value as string).trim() !== '',
  );
}

export function partsOf(element: AstNode): TextPart[] {
  const parts: TextPart[] = [];
  let index = 0;
  for (const child of jsxChildren(element)) {
    if (child.type === 'JSXText') {
      const value = child.value as string;
      if (value.trim() === '') continue;
      parts.push({ kind: 'text', index: index++, value: value.trim() });
      continue;
    }
    parts.push({ kind: 'markup', label: labelOf(child) });
  }
  return parts;
}

export type TextTargetInfo = {
  editable: boolean;
  /** The element's own text, markup excluded. */
  text: string;
  parts: TextPart[];
  reason?: string;
};

type PropRun = { name: string; value: string; start: number; end: number };

function componentOwning(ast: AstNode, element: AstNode): AstNode | null {
  let found: AstNode | null = null;
  const visit = (node: AstNode, declarator: AstNode | null): void => {
    if (found) return;
    if (node === element) {
      found = declarator;
      return;
    }
    const next = node.type === 'VariableDeclarator' ? node : declarator;
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (isAstNode(child)) visit(child, next);
      } else if (isAstNode(value)) visit(value, next);
    }
  };
  visit(ast, null);
  return found;
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function propNames(declarator: AstNode): string[] {
  const params = (declarator.init as AstNode | undefined)?.params as AstNode[] | undefined;
  const pattern = params?.[0];
  if (pattern?.type !== 'ObjectPattern') return [];
  return ((pattern.properties ?? []) as AstNode[])
    .map((property) => ((property.key as AstNode | undefined)?.name as string | undefined) ?? '')
    .filter((name) => name !== '');
}

function expressionNames(element: AstNode): string[] | null {
  const names: string[] = [];
  for (const child of jsxChildren(element)) {
    if (child.type === 'JSXText') {
      if ((child.value as string).trim() !== '') return null;
      continue;
    }
    if (child.type !== 'JSXExpressionContainer') return null;
    const name = ((child.expression as AstNode | undefined)?.name as string | undefined) ?? '';
    if (name === '') return null;
    names.push(name);
  }
  return names.length > 0 ? names : null;
}

function callSiteRuns(node: AstNode, wanted: string[]): PropRun[] | null {
  const attributes = ((node.openingElement as AstNode | undefined)?.attributes ?? []) as AstNode[];
  const runs: PropRun[] = [];
  for (const name of wanted) {
    const attribute = attributes.find(
      (candidate) => ((candidate.name as AstNode | undefined)?.name as string | undefined) === name,
    );
    const value = attribute?.value as AstNode | undefined;
    if (value?.type !== 'StringLiteral') return null;
    runs.push({ name, value: value.value as string, start: value.start + 1, end: value.end - 1 });
  }
  return runs;
}

/**
 * The words behind `{agency}` live at the call site, not in the element the
 * click landed on. Writing them into the element would replace the expression
 * with one caller's text, so the runs an edit may touch are the attributes.
 *
 * Two call sites of the same component render different words, and only what
 * is on screen can say which one was clicked — without it, a save rewrites
 * whichever came first in the file.
 */
function propRuns(ast: AstNode, element: AstNode, shown?: string): PropRun[] | null {
  const names = expressionNames(element);
  if (!names) return null;
  const owner = componentOwning(ast, element);
  const component = (owner?.id as AstNode | undefined)?.name as string | undefined;
  if (!owner || !component) return null;
  const declared = propNames(owner);
  if (!names.every((name) => declared.includes(name))) return null;

  const matches: PropRun[][] = [];
  walkJsx(ast, (node) => {
    const tag = ((node.openingElement as AstNode | undefined)?.name as AstNode | undefined)?.name as
      | string
      | undefined;
    if (tag !== component) return;
    const runs = callSiteRuns(node, names);
    if (!runs) return;
    if (shown !== undefined) {
      const visible = normalizeText(shown);
      if (!runs.every((run) => visible.includes(normalizeText(run.value)))) return;
    }
    matches.push(runs);
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function describe(element: AstNode, ast?: AstNode, shown?: string): TextTargetInfo {
  const parts = partsOf(element);
  const texts = parts.filter(
    (part): part is Extract<TextPart, { kind: 'text' }> => part.kind === 'text',
  );
  if (texts.length === 0) {
    const runs = ast ? propRuns(ast, element, shown) : null;
    if (runs) {
      return {
        editable: true,
        text: runs.map((run) => run.value).join(' '),
        parts: runs.map((run, index) => ({ kind: 'text', index, value: run.value })),
      };
    }
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
  return element ? describe(element, ast, shown) : null;
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
      const info = describe(exact, ast, expected);
      if (info.editable && matches(info)) return { ...info, ...candidate };
    }
    // The column may have drifted; scan the rest of the line, but only accept
    // an element whose text is actually on screen.
    if (!shown) continue;
    for (const node of findJsxOnLine(ast, candidate.line, candidate.column)) {
      const info = describe(node, ast, expected);
      const start = node.loc?.start;
      if (!info.editable || !matches(info) || !start) continue;
      return { ...info, line: start.line, column: start.column };
    }
  }

  const first = candidates[0];
  if (!first) return null;
  const clicked = findJsxAt(ast, first.line, first.column);
  return clicked ? { ...describe(clicked), ...first } : null;
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

  const runs = textNodes(element).length === 0 ? propRuns(ast, element, opts.shown) : null;
  if (runs) {
    const run = runs[opts.index ?? 0];
    if (!run) return { ok: false, status: 404, error: 'no such text run in this element' };
    if (opts.expected !== undefined && normalizeText(run.value) !== normalizeText(opts.expected)) {
      return {
        ok: false,
        status: 409,
        error: 'source changed since this was opened — reselect it',
      };
    }
    return {
      ok: true,
      source: source.slice(0, run.start) + escapeAttribute(text) + source.slice(run.end),
    };
  }

  const nodes = textNodes(element);
  if (nodes.length === 0) {
    return { ok: false, status: 422, error: 'element has no text to replace' };
  }
  const child = nodes[opts.index ?? 0];
  if (!child) return { ok: false, status: 404, error: 'no such text run in this element' };

  const raw = child.value as string;
  if (opts.expected !== undefined && normalizeText(raw) !== normalizeText(opts.expected)) {
    return { ok: false, status: 409, error: 'source changed since this was opened — reselect it' };
  }

  const leading = raw.match(/^\s*/)?.[0] ?? '';
  const trailing = raw.match(/\s*$/)?.[0] ?? '';
  const next =
    source.slice(0, child.start) +
    leading +
    escapeJsxText(text) +
    trailing +
    source.slice(child.end);

  return { ok: true, source: next };
}

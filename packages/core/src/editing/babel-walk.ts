import { parse as babelParse } from '@babel/parser';

export type AstNode = {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
} & Record<string, unknown>;

export function parseSource(code: string): AstNode | null {
  try {
    return babelParse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    }) as unknown as AstNode;
  } catch {
    return null;
  }
}

/**
 * `parseSource`, but a source with any recovered error is refused. Reading
 * tolerates a document mid-edit; writing splices text in by AST offset, and a
 * best-guess tree recovered from a syntax error must never decide where.
 */
export function parseStrict(code: string): AstNode | null {
  const ast = parseSource(code) as (AstNode & { errors?: unknown[] }) | null;
  if (!ast) return null;
  return ast.errors && ast.errors.length > 0 ? null : ast;
}

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

/** Depth-first walk over every node; the visitor decides what it cares about. */
export function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (!isNode(node)) return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    walkAst(node[key], visit);
  }
}

export function walkJsx(ast: AstNode, visit: (node: AstNode) => void): void {
  walkAst(ast, (node) => {
    if (node.type === 'JSXElement') visit(node);
  });
}

/**
 * The JSX element whose opening tag starts at this source position.
 *
 * The match is exact on both line and column. Anything looser can resolve to a
 * different element on the same line, and this location decides where an edit
 * gets written — a near miss silently rewrites the wrong text.
 */
export function findJsxAt(ast: AstNode, line: number, column: number): AstNode | null {
  let found: AstNode | null = null;
  walkJsx(ast, (node) => {
    if (found) return;
    const start = node.loc?.start;
    if (start && start.line === line && start.column === column) found = node;
  });
  return found;
}

/**
 * Every JSX element that starts on a line, nearest column first.
 *
 * Columns cannot be trusted for locations derived from React's `_debugSource`:
 * injecting the loc attribute shifts the columns of anything later on the same
 * line, so the offset differs per element. The line survives that, so callers
 * scan the line and pick by content instead.
 */
export function findJsxOnLine(ast: AstNode, line: number, column: number): AstNode[] {
  const hits: { node: AstNode; distance: number }[] = [];
  walkJsx(ast, (node) => {
    const start = node.loc?.start;
    if (!start || start.line !== line) return;
    hits.push({ node, distance: Math.abs(start.column - column) });
  });
  return hits.sort((a, b) => a.distance - b.distance).map((hit) => hit.node);
}

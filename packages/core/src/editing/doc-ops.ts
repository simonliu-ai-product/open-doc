import { type AstNode, parseSource, parseStrict } from './babel-walk.ts';

function programBody(ast: AstNode): AstNode[] {
  return (ast as unknown as { program?: { body?: AstNode[] } }).program?.body ?? [];
}

function metaObjectOf(node: AstNode): AstNode | null {
  if (node.type !== 'ExportNamedDeclaration') return null;
  const decl = (node as unknown as { declaration?: AstNode | null }).declaration;
  if (decl?.type !== 'VariableDeclaration') return null;
  const declarations = (decl as unknown as { declarations?: AstNode[] }).declarations ?? [];
  for (const d of declarations) {
    const id = (d as unknown as { id?: { type?: string; name?: string } }).id;
    if (id?.type !== 'Identifier' || id.name !== 'meta') continue;
    let init = (d as unknown as { init?: AstNode | null }).init;
    if (!init) return null;
    if (init.type === 'TSSatisfiesExpression' || init.type === 'TSAsExpression') {
      const expr = (init as unknown as { expression?: AstNode }).expression;
      if (expr) init = expr;
    }
    return init.type === 'ObjectExpression' ? init : null;
  }
  return null;
}

function findMetaObject(ast: AstNode): AstNode | null {
  for (const node of programBody(ast)) {
    const object = metaObjectOf(node);
    if (object) return object;
  }
  return null;
}

function jsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`;
}

export function validateDocTitle(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return null;
  return trimmed;
}

/**
 * Rewrites `meta.title` in place, adding the property when the meta object
 * exists without one. Returns null when there is no meta object to edit —
 * the caller reports that rather than inventing an export.
 */
export function setMetaTitle(source: string, title: string): string | null {
  const ast = parseStrict(source);
  if (!ast) return null;
  const object = findMetaObject(ast);
  if (!object) return null;

  const properties = (object as unknown as { properties: AstNode[] }).properties ?? [];
  for (const prop of properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const p = prop as unknown as {
      computed?: boolean;
      key: { type?: string; name?: string; value?: string };
      value: AstNode;
    };
    if (p.computed) continue;
    const key = p.key.type === 'Identifier' ? p.key.name : p.key.value;
    if (key !== 'title') continue;
    return source.slice(0, p.value.start) + jsString(title) + source.slice(p.value.end);
  }

  // No `title` yet — insert it as the first property so it reads first.
  const open = object.start + 1;
  const rest = source.slice(open, object.end - 1);
  const isEmpty = rest.trim() === '';
  const inserted = isEmpty ? `\n  title: ${jsString(title)},\n` : `\n  title: ${jsString(title)},`;
  return source.slice(0, open) + inserted + source.slice(open);
}

export function readMetaTitle(source: string): string | null {
  const ast = parseSource(source);
  if (!ast) return null;
  const object = findMetaObject(ast);
  if (!object) return null;
  const properties = (object as unknown as { properties: AstNode[] }).properties ?? [];
  for (const prop of properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const p = prop as unknown as {
      computed?: boolean;
      key: { type?: string; name?: string; value?: string };
      value: AstNode & { value?: unknown };
    };
    if (p.computed) continue;
    const key = p.key.type === 'Identifier' ? p.key.name : p.key.value;
    if (key !== 'title') continue;
    if (p.value.type !== 'StringLiteral') return null;
    return typeof p.value.value === 'string' ? p.value.value : null;
  }
  return null;
}

/** `q3-review` → `q3-review-copy`, `q3-review-copy` → `q3-review-copy-2`, … */
export function nextCopyId(baseId: string, taken: Set<string>): string {
  const stem = baseId.replace(/-copy(-\d+)?$/, '');
  let candidate = `${stem}-copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${stem}-copy-${n}`;
    n++;
  }
  return candidate;
}

export function copyTitle(title: string): string {
  return /\(copy( \d+)?\)$/.test(title) ? title : `${title} (copy)`;
}

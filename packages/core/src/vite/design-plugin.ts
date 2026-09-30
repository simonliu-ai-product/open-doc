import fs from 'node:fs/promises';
import type { Plugin, ViteDevServer } from 'vite';
import { type DesignSystem, defaultDesign } from '../app/lib/design.ts';
import { type AstNode, parseSource, parseStrict } from '../editing/babel-walk.ts';
import { validateMutationRequest } from '../http/request-guard.ts';
import { json, readBody, resolveDocPath } from './routes/context.ts';

type DesignDeclLocation = {
  declStart: number;
  declEnd: number;
  objectStart: number;
  objectEnd: number;
};

function programBody(ast: AstNode): AstNode[] {
  return (ast as unknown as { program?: { body?: AstNode[] } }).program?.body ?? [];
}

function designObjectOf(node: AstNode): { decl: AstNode; object: AstNode } | null | 'unsupported' {
  let varDecl: AstNode | null = null;
  if (node.type === 'VariableDeclaration') varDecl = node;
  else if (node.type === 'ExportNamedDeclaration') {
    const decl = (node as unknown as { declaration?: AstNode | null }).declaration;
    if (decl?.type === 'VariableDeclaration') varDecl = decl;
  }
  if (!varDecl) return null;

  const declarations = (varDecl as unknown as { declarations?: AstNode[] }).declarations ?? [];
  for (const d of declarations) {
    const id = (d as unknown as { id?: { type?: string; name?: string } }).id;
    if (id?.type !== 'Identifier' || id.name !== 'design') continue;
    const init = (d as unknown as { init?: AstNode | null }).init;
    if (!init) return 'unsupported';
    let inner: AstNode = init;
    if (inner.type === 'TSSatisfiesExpression' || inner.type === 'TSAsExpression') {
      const expr = (inner as unknown as { expression?: AstNode }).expression;
      if (expr) inner = expr;
    }
    if (inner.type !== 'ObjectExpression') return 'unsupported';
    return { decl: node, object: inner };
  }
  return null;
}

function findDesign(ast: AstNode): { loc: DesignDeclLocation; object: AstNode } | null {
  for (const node of programBody(ast)) {
    const hit = designObjectOf(node);
    if (hit === null) continue;
    if (hit === 'unsupported') return null;
    return {
      loc: {
        declStart: hit.decl.start,
        declEnd: hit.decl.end,
        objectStart: hit.object.start,
        objectEnd: hit.object.end,
      },
      object: hit.object,
    };
  }
  return null;
}

function literalToValue(node: AstNode): unknown {
  switch (node.type) {
    case 'StringLiteral':
      return (node as unknown as { value: string }).value;
    case 'NumericLiteral':
      return (node as unknown as { value: number }).value;
    case 'BooleanLiteral':
      return (node as unknown as { value: boolean }).value;
    case 'NullLiteral':
      return null;
    case 'UnaryExpression': {
      const op = (node as unknown as { operator: string }).operator;
      const arg = (node as unknown as { argument: AstNode }).argument;
      const v = literalToValue(arg);
      if (op === '-' && typeof v === 'number') return -v;
      if (op === '+' && typeof v === 'number') return v;
      throw new Error(`unsupported unary operator ${op}`);
    }
    case 'TemplateLiteral': {
      const quasis = (node as unknown as { quasis: AstNode[] }).quasis;
      const expressions = (node as unknown as { expressions: AstNode[] }).expressions;
      if (expressions.length > 0) throw new Error('template literal has expressions');
      const value = (quasis[0] as unknown as { value: { cooked?: string; raw: string } }).value;
      return value.cooked ?? value.raw;
    }
    case 'ObjectExpression': {
      const properties = (node as unknown as { properties: AstNode[] }).properties;
      const out: Record<string, unknown> = {};
      for (const prop of properties) {
        if (prop.type !== 'ObjectProperty') throw new Error('object has spread or method');
        const p = prop as unknown as {
          computed?: boolean;
          key: { type?: string; name?: string; value?: string };
          value: AstNode;
        };
        if (p.computed) throw new Error('object has computed key');
        let key: string;
        if (p.key.type === 'Identifier' && typeof p.key.name === 'string') key = p.key.name;
        else if (p.key.type === 'StringLiteral' && typeof p.key.value === 'string')
          key = p.key.value;
        else throw new Error('unsupported object key');
        out[key] = literalToValue(p.value);
      }
      return out;
    }
    default:
      throw new Error(`unsupported node type ${node.type}`);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function mergeDesign(base: DesignSystem, patch: Partial<DesignSystem>): DesignSystem {
  const out = JSON.parse(JSON.stringify(base)) as DesignSystem;
  const apply = (target: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (isPlainObject(v) && isPlainObject(target[k])) {
        apply(target[k] as Record<string, unknown>, v);
      } else {
        target[k] = v;
      }
    }
  };
  if (isPlainObject(patch)) apply(out as unknown as Record<string, unknown>, patch);
  return out;
}

function indent(level: number): string {
  return '  '.repeat(level);
}

function jsString(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function serializeValue(value: unknown, level: number): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return jsString(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const childIndent = indent(level + 1);
    const lines = entries.map(([k, v]) => {
      const key = isValidIdentifier(k) ? k : jsString(k);
      return `${childIndent}${key}: ${serializeValue(v, level + 1)},`;
    });
    return `{\n${lines.join('\n')}\n${indent(level)}}`;
  }
  throw new Error(`unsupported value type ${typeof value}`);
}

export function serializeDesign(design: DesignSystem): string {
  return serializeValue(design as unknown as Record<string, unknown>, 0);
}

export type ParsedDocDesign =
  | { ok: true; design: DesignSystem; loc: DesignDeclLocation }
  | { ok: false; exists: false }
  | { ok: false; exists: true; error: string };

export function parseDocDesign(source: string): ParsedDocDesign {
  const ast = parseSource(source);
  if (!ast) return { ok: false, exists: true, error: 'could not parse document source' };
  const found = findDesign(ast);
  if (!found) {
    // Absent and unsupported look the same from here; re-check whether a
    // `design` binding exists at all so the panel can say which it is.
    const hasBinding = programBody(ast).some((node) => designObjectOf(node) !== null);
    if (hasBinding) {
      return { ok: false, exists: true, error: 'design has an unsupported initializer' };
    }
    return { ok: false, exists: false };
  }
  let value: unknown;
  try {
    value = literalToValue(found.object);
  } catch (err) {
    return { ok: false, exists: true, error: (err as Error).message };
  }
  return {
    ok: true,
    design: mergeDesign(defaultDesign, value as Partial<DesignSystem>),
    loc: found.loc,
  };
}

type ImportInfo = { node: AstNode; source: string; specifiers: AstNode[] };

function findImports(ast: AstNode): ImportInfo[] {
  const out: ImportInfo[] = [];
  for (const node of programBody(ast)) {
    if (node.type !== 'ImportDeclaration') continue;
    const src = (node as unknown as { source?: { value?: unknown } }).source?.value;
    if (typeof src !== 'string') continue;
    out.push({
      node,
      source: src,
      specifiers: (node as unknown as { specifiers?: AstNode[] }).specifiers ?? [],
    });
  }
  return out;
}

function addDesignSystemImport(source: string, imports: ImportInfo[]): string {
  const stmt = `import type { DesignSystem } from '@open-document/core';\n`;
  if (imports.length > 0) {
    const insertAt = (imports[imports.length - 1] as ImportInfo).node.end;
    const trail = source[insertAt] === '\n' ? '' : '\n';
    return `${source.slice(0, insertAt)}\n${stmt.slice(0, -1)}${trail}${source.slice(insertAt)}`;
  }
  return `${stmt}\n${source}`;
}

function ensureDesignSystemImport(source: string, ast: AstNode): string {
  const imports = findImports(ast);
  const coreImport = imports.find((imp) => imp.source === '@open-document/core');
  if (!coreImport) return addDesignSystemImport(source, imports);

  const hasDesignSystem = coreImport.specifiers.some((spec) => {
    if (spec.type !== 'ImportSpecifier') return false;
    const imported = (spec as unknown as { imported?: { name?: string } }).imported;
    return imported?.name === 'DesignSystem';
  });
  if (hasDesignSystem) return source;

  // `import type { … }` already applies to every specifier; repeating the
  // modifier on one is a TypeScript error.
  const typeOnly = (coreImport.node as unknown as { importKind?: string }).importKind === 'type';
  const specifier = typeOnly ? 'DesignSystem' : 'type DesignSystem';

  // After the last named specifier, not before the brace: `{ a, }` would
  // otherwise become `{ a, , type DesignSystem }`.
  const named = coreImport.specifiers.filter((spec) => spec.type === 'ImportSpecifier');
  const lastNamed = named[named.length - 1];
  if (lastNamed) {
    return `${source.slice(0, lastNamed.end)}, ${specifier}${source.slice(lastNamed.end)}`;
  }

  const node = coreImport.node;
  const braceClose = source.slice(node.start, node.end).lastIndexOf('}');
  // A namespace, default-only, or side-effect import has no named list to
  // extend, so the type needs an import statement of its own.
  if (braceClose === -1) return addDesignSystemImport(source, imports);
  const absoluteBrace = node.start + braceClose;
  return `${source.slice(0, absoluteBrace)}${specifier}${source.slice(absoluteBrace)}`;
}

function findInsertionPoint(source: string, ast: AstNode): number {
  const imports = findImports(ast);
  if (imports.length === 0) return 0;
  let off = imports[imports.length - 1].node.end;
  while (off < source.length && source[off] !== '\n') off++;
  if (off < source.length) off++;
  return off;
}

export type WriteResult =
  | { ok: true; source: string; created: boolean }
  | { ok: false; status: number; error: string };

export function applyDesignWrite(source: string, next: DesignSystem): WriteResult {
  let body: string;
  try {
    body = serializeDesign(next);
  } catch (err) {
    return { ok: false, status: 422, error: `serialize failed: ${(err as Error).message}` };
  }

  const ast = parseStrict(source);
  if (!ast) {
    return {
      ok: false,
      status: 422,
      error: 'the document has a syntax error — fix it in source before saving the design',
    };
  }

  const found = findDesign(ast);
  if (found) {
    const out = source.slice(0, found.loc.objectStart) + body + source.slice(found.loc.objectEnd);
    return { ok: true, source: out, created: false };
  }

  const withImport = ensureDesignSystemImport(source, ast);
  const ast2 = parseStrict(withImport);
  if (!ast2) return { ok: false, status: 422, error: 'failed to re-parse after adding import' };
  const insertAt = findInsertionPoint(withImport, ast2);
  const block = `\nexport const design: DesignSystem = ${body};\n`;
  return {
    ok: true,
    source: withImport.slice(0, insertAt) + block + withImport.slice(insertAt),
    created: true,
  };
}

export type DesignPluginOptions = {
  userCwd: string;
  docsDir?: string;
};

// GET  /__design?docId=…        read the doc's design const (defaults when absent)
// PUT  /__design?docId=…        merge a patch into it and write the source back
// POST /__design/reset?docId=…  rewrite it to the framework defaults
export function designPlugin(opts: DesignPluginOptions): Plugin {
  const userCwd = opts.userCwd;
  const docsDir = opts.docsDir ?? 'docs';

  return {
    name: 'open-doc:design',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__design', async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        const method = req.method ?? 'GET';
        const docId = url.searchParams.get('docId') ?? '';
        const file = resolveDocPath(userCwd, docsDir, docId);
        if (!file) return json(res, 400, { error: 'invalid docId' });

        try {
          if (method === 'GET' && url.pathname === '/') {
            let source: string;
            try {
              source = await fs.readFile(file, 'utf8');
            } catch {
              return json(res, 404, { error: 'document not found' });
            }
            const parsed = parseDocDesign(source);
            if (parsed.ok) {
              return json(res, 200, { design: parsed.design, exists: true, warning: null });
            }
            if (parsed.exists === false) {
              return json(res, 200, { design: defaultDesign, exists: false, warning: null });
            }
            return json(res, 200, { design: defaultDesign, exists: true, warning: parsed.error });
          }

          if (method === 'PUT' && url.pathname === '/') {
            const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
            if (!requestCheck.ok) {
              return json(res, requestCheck.status, { error: requestCheck.error });
            }
            const body = (await readBody(req)) as { patch?: Partial<DesignSystem> };
            const patch = body.patch;
            if (!patch || typeof patch !== 'object') {
              return json(res, 400, { error: 'missing patch object' });
            }
            let source: string;
            try {
              source = await fs.readFile(file, 'utf8');
            } catch {
              return json(res, 404, { error: 'document not found' });
            }
            const parsed = parseDocDesign(source);
            if (!parsed.ok && parsed.exists) return json(res, 422, { error: parsed.error });

            const merged = mergeDesign(parsed.ok ? parsed.design : defaultDesign, patch);
            const written = applyDesignWrite(source, merged);
            if (!written.ok) return json(res, written.status, { error: written.error });
            if (written.source !== source) await fs.writeFile(file, written.source, 'utf8');
            return json(res, 200, { ok: true, design: merged, created: written.created });
          }

          if (method === 'POST' && url.pathname === '/reset') {
            const requestCheck = validateMutationRequest(req);
            if (!requestCheck.ok) {
              return json(res, requestCheck.status, { error: requestCheck.error });
            }
            let source: string;
            try {
              source = await fs.readFile(file, 'utf8');
            } catch {
              return json(res, 404, { error: 'document not found' });
            }
            const written = applyDesignWrite(source, defaultDesign);
            if (!written.ok) return json(res, written.status, { error: written.error });
            if (written.source !== source) await fs.writeFile(file, written.source, 'utf8');
            return json(res, 200, { ok: true, design: defaultDesign, created: written.created });
          }

          return next();
        } catch (err) {
          json(res, 500, { error: String((err as Error).message ?? err) });
        }
      });
    },
  };
}

import {
  isStyleProp,
  isValidStyleValue,
  type StyleChanges,
  type StyleInfo,
  type StyleOrigin,
  type StyleProp,
  type StyleSource,
  type StyleValue,
  tokenOf,
} from '../app/lib/inspector/format.ts';
import { type AstNode, findJsxAt, parseSource, parseStrict } from './babel-walk.ts';
import {
  applySplices,
  type EditTarget,
  planTextEdits,
  type Splice,
  SYNTAX_ERROR,
  type TextEdit,
  type TextEditOutcome,
} from './edit-ops.ts';

export type StyleEdit = EditTarget & {
  /** The tag the viewer clicked; a mismatch means the location points elsewhere now. */
  tag: string;
  changes: StyleChanges;
  /** What the viewer was shown for each changed key; a write over anything else is refused. */
  expected?: Partial<Record<StyleProp, StyleOrigin | null>>;
};

type Failure = { ok: false; status: number; error: string };

function unwrap(node: AstNode | undefined): AstNode | undefined {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression as AstNode;
  }
  return current;
}

function keyOf(property: AstNode): string | null {
  if (property.type !== 'ObjectProperty' || property.computed) return null;
  const key = property.key as AstNode;
  if (key.type === 'Identifier') return key.name as string;
  if (key.type === 'StringLiteral') return key.value as string;
  return null;
}

function sourceOf(value: AstNode, source: string): StyleSource {
  const node = unwrap(value) ?? value;
  if (node.type === 'StringLiteral') {
    const text = node.value as string;
    const token = tokenOf(text);
    return token ? { kind: 'token', token } : { kind: 'literal', value: text };
  }
  if (node.type === 'NumericLiteral') return { kind: 'literal', value: node.value as number };
  if (node.type === 'TemplateLiteral' && (node.expressions as AstNode[]).length === 0) {
    const text = ((node.quasis as AstNode[])[0]?.value as { cooked?: string })?.cooked ?? '';
    const token = tokenOf(text);
    return token ? { kind: 'token', token } : { kind: 'literal', value: text };
  }
  return { kind: 'code', code: source.slice(value.start, value.end) };
}

/** A top-level `const name = { … }` — the shared style objects documents are written with. */
function sharedObject(ast: AstNode, name: string): AstNode | null {
  const body = ((ast.program as AstNode | undefined)?.body ?? []) as AstNode[];
  for (const statement of body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? (statement.declaration as AstNode | null)
        : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of declaration.declarations as AstNode[]) {
      const id = declarator.id as AstNode;
      if (id.type !== 'Identifier' || id.name !== name) continue;
      const init = unwrap(declarator.init as AstNode | undefined);
      return init?.type === 'ObjectExpression' ? init : null;
    }
  }
  return null;
}

/** Folds an object's keys into `props`, later keys over earlier ones, as the spread would. */
function readObject(
  ast: AstNode,
  object: AstNode,
  source: string,
  from: string | undefined,
  props: Partial<Record<StyleProp, StyleOrigin>>,
  depth: number,
): void {
  for (const property of object.properties as AstNode[]) {
    if (property.type === 'SpreadElement') {
      const argument = unwrap(property.argument as AstNode);
      if (argument?.type !== 'Identifier' || depth > 3) continue;
      const shared = sharedObject(ast, argument.name as string);
      if (shared) readObject(ast, shared, source, argument.name as string, props, depth + 1);
      continue;
    }
    const key = keyOf(property);
    const prop = key === 'backgroundColor' ? 'background' : key;
    if (!isStyleProp(prop)) continue;
    const origin = sourceOf(property.value as AstNode, source);
    props[prop] = from ? { ...origin, from } : origin;
  }
}

type Located =
  | { ok: true; opening: AstNode; attr: AstNode | null; expression: AstNode | null }
  | Failure;

function locate(ast: AstNode, loc: EditTarget, tag: string): Located {
  const element = findJsxAt(ast, loc.line, loc.column);
  if (!element) return { ok: false, status: 404, error: 'element not found' };
  const opening = element.openingElement as AstNode;
  const name = opening.name as AstNode;
  if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name as string)) {
    return {
      ok: false,
      status: 422,
      error: 'This is a component — its styles are set inside it, not here.',
    };
  }
  if (name.name !== tag) {
    return { ok: false, status: 409, error: 'source does not match this element' };
  }
  const attrs = (opening.attributes as AstNode[]).filter(
    (attr) => attr.type === 'JSXAttribute' && (attr.name as AstNode).name === 'style',
  );
  const attr = attrs[attrs.length - 1] ?? null;
  if (!attr) return { ok: true, opening, attr: null, expression: null };
  const value = attr.value as AstNode | null;
  if (value?.type !== 'JSXExpressionContainer') {
    return { ok: false, status: 422, error: 'This element’s style is not written as an object.' };
  }
  return { ok: true, opening, attr, expression: value.expression as AstNode };
}

function readProps(
  ast: AstNode,
  source: string,
  expression: AstNode | null,
): Partial<Record<StyleProp, StyleOrigin>> {
  const props: Partial<Record<StyleProp, StyleOrigin>> = {};
  const node = unwrap(expression ?? undefined);
  if (node?.type === 'ObjectExpression') readObject(ast, node, source, undefined, props, 0);
  else if (node?.type === 'Identifier') {
    const shared = sharedObject(ast, node.name as string);
    if (shared) readObject(ast, shared, source, node.name as string, props, 1);
  }
  return props;
}

/** What the element at `loc` sets, key by key, for the panel to show before anything is written. */
export function readStyleAt(source: string, loc: EditTarget, tag: string): StyleInfo {
  const ast = parseSource(source);
  if (!ast) return { editable: false, reason: 'could not read source' };
  const found = locate(ast, loc, tag);
  if (!found.ok) return { editable: false, reason: found.error };
  return { editable: true, props: readProps(ast, source, found.expression) };
}

function literal(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? '';
}

function lineOf(source: string, offset: number): number {
  let line = 0;
  for (let i = source.indexOf('\n'); i !== -1 && i < offset; i = source.indexOf('\n', i + 1)) {
    line++;
  }
  return line;
}

/** Writes the keys into an object literal, touching only what changes. */
function planObject(
  source: string,
  object: AstNode,
  sets: Array<[StyleProp, string | number]>,
  removes: StyleProp[],
  attr: AstNode,
): Splice[] {
  const properties = object.properties as AstNode[];
  const lastSpread = properties.reduce(
    (at, property, index) => (property.type === 'SpreadElement' ? index : at),
    -1,
  );
  const ownIndex = (prop: StyleProp): number => {
    for (let i = properties.length - 1; i > lastSpread; i--) {
      const key = keyOf(properties[i] as AstNode);
      if (key === prop || (prop === 'background' && key === 'backgroundColor')) return i;
    }
    return -1;
  };

  const replaced = new Map<number, string>();
  const appended: string[] = [];
  for (const [prop, value] of sets) {
    const index = ownIndex(prop);
    if (index === -1) appended.push(`${prop}: ${literal(value)}`);
    else replaced.set(index, literal(value));
  }
  const removed = new Set(removes.map(ownIndex).filter((index) => index !== -1));

  if (removed.size === 0) {
    const splices: Splice[] = [];
    for (const [index, text] of replaced) {
      const value = (properties[index] as AstNode).value as AstNode;
      const shorthand = (properties[index] as AstNode).shorthand === true;
      splices.push(
        shorthand
          ? {
              start: (properties[index] as AstNode).start,
              end: (properties[index] as AstNode).end,
              text: `${keyOf(properties[index] as AstNode)}: ${text}`,
            }
          : { start: value.start, end: value.end, text },
      );
    }
    if (appended.length > 0) {
      const last = properties[properties.length - 1];
      if (!last) {
        splices.push({ start: object.start, end: object.end, text: `{ ${appended.join(', ')} }` });
      } else if (lineOf(source, last.start) > lineOf(source, object.start)) {
        const indent = lineIndent(source, last.start);
        const after = /^\s*,/.exec(source.slice(last.end));
        splices.push(
          after
            ? {
                start: last.end + after[0].length,
                end: last.end + after[0].length,
                text: appended.map((item) => `\n${indent}${item},`).join(''),
              }
            : {
                start: last.end,
                end: last.end,
                text: appended.map((item) => `,\n${indent}${item}`).join(''),
              },
        );
      } else {
        splices.push({ start: last.end, end: last.end, text: `, ${appended.join(', ')}` });
      }
    }
    return splices;
  }

  // Taking keys out is a rewrite of the property list — each kept property
  // keeps its own text — rather than a run of deletions whose commas would
  // have to be reconciled with each other.
  const items: string[] = [];
  properties.forEach((property, index) => {
    if (removed.has(index)) return;
    const text = replaced.get(index);
    items.push(
      text === undefined
        ? source.slice(property.start, property.end)
        : `${keyOf(property)}: ${text}`,
    );
  });
  items.push(...appended);
  if (items.length === 0) {
    const start = /\s*$/.exec(source.slice(0, attr.start))?.index ?? attr.start;
    return [{ start, end: attr.end, text: '' }];
  }
  const first = properties[0] as AstNode;
  if (lineOf(source, first.start) > lineOf(source, object.start)) {
    const indent = lineIndent(source, first.start);
    const closing = lineIndent(source, object.end - 1);
    return [
      {
        start: object.start,
        end: object.end,
        text: `{\n${items.map((item) => `${indent}${item},\n`).join('')}${closing}}`,
      },
    ];
  }
  return [{ start: object.start, end: object.end, text: `{ ${items.join(', ')} }` }];
}

function planStyle(
  ast: AstNode,
  source: string,
  edit: StyleEdit,
): { ok: true; splices: Splice[] } | Failure {
  const found = locate(ast, edit, edit.tag);
  if (!found.ok) return found;

  const sets: Array<[StyleProp, string | number]> = [];
  const removes: StyleProp[] = [];
  const current = readProps(ast, source, found.expression);
  for (const [prop, value] of Object.entries(edit.changes) as Array<[string, StyleValue]>) {
    if (!isStyleProp(prop))
      return { ok: false, status: 400, error: `not a style the panel writes: ${prop}` };
    if (!isValidStyleValue(prop, value)) {
      return { ok: false, status: 422, error: `not a value ${prop} can take: ${String(value)}` };
    }
    if (edit.expected && prop in edit.expected) {
      if (JSON.stringify(current[prop] ?? null) !== JSON.stringify(edit.expected[prop] ?? null)) {
        return {
          ok: false,
          status: 409,
          error: 'this element’s style changed in source since it was selected',
        };
      }
    }
    if (value === null) removes.push(prop);
    else sets.push([prop, value]);
  }

  const { opening, attr, expression } = found;
  const object = unwrap(expression ?? undefined);
  if (attr && object?.type === 'ObjectExpression') {
    return { ok: true, splices: planObject(source, object, sets, removes, attr) };
  }
  // Keys the element only inherits from a shared object cannot be taken off
  // it here; the panel offers that only for keys the element writes itself.
  if (sets.length === 0) return { ok: true, splices: [] };
  const items = sets.map(([prop, value]) => `${prop}: ${literal(value)}`).join(', ');
  if (attr && expression) {
    return {
      ok: true,
      splices: [
        {
          start: expression.start,
          end: expression.end,
          text: `{ ...${source.slice(expression.start, expression.end)}, ${items} }`,
        },
      ],
    };
  }
  const attributes = opening.attributes as AstNode[];
  const after = attributes[attributes.length - 1] ?? (opening.name as AstNode);
  return {
    ok: true,
    splices: [{ start: after.end, end: after.end, text: ` style={{ ${items} }}` }],
  };
}

function overlaps(a: Splice, b: Splice): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Text and style changes from one save, located against the same source and
 * written as one splice pass — so a save that retyped a heading and resized it
 * is one write and one hot reload, and neither edit's location is moved by
 * the other before it is found.
 */
export function replaceEditsAt(
  source: string,
  texts: TextEdit[],
  styles: StyleEdit[],
): { source: string; texts: TextEditOutcome[]; styles: TextEditOutcome[] } {
  const ast = parseStrict(source);
  if (!ast) {
    return { source, texts: texts.map(() => SYNTAX_ERROR), styles: styles.map(() => SYNTAX_ERROR) };
  }
  const text = planTextEdits(ast, source, texts);
  const splices = [...text.splices];
  const results: TextEditOutcome[] = [];
  for (const edit of styles) {
    const planned = planStyle(ast, source, edit);
    if (!planned.ok) {
      results.push(planned);
      continue;
    }
    if (planned.splices.some((splice) => splices.some((other) => overlaps(splice, other)))) {
      results.push({
        ok: false,
        status: 409,
        error: 'another edit in this save rewrites the same source',
      });
      continue;
    }
    splices.push(...planned.splices);
    results.push({ ok: true });
  }
  return { source: applySplices(source, splices), texts: text.results, styles: results };
}

import path from 'node:path';
import type { Plugin } from 'vite';
import { type AstNode, parseSource, walkJsx } from '../editing/babel-walk.ts';

// Injects `data-od-loc="<line>:<col>"` onto every host JSX element in document
// sources so a click in the inspector maps straight back to a source location —
// far more reliable than reading React's `_debugSource`, which goes stale
// across hot reloads.

// Capitalized components that forward `data-od-loc` to the hosts they render,
// so the inspector can target them like a host element. See `app/lib/source-loc.ts`.
const FORWARDING_COMPONENTS = new Set(['ImagePlaceholder', 'Figure', 'DataTable', 'Footnote']);

export function taggableName(opening: AstNode): string | null {
  const name = opening.name as { type?: string; name?: string } | undefined;
  if (name?.type !== 'JSXIdentifier' || typeof name.name !== 'string') return null;
  if (/^[a-z]/.test(name.name) || FORWARDING_COMPONENTS.has(name.name)) return name.name;
  return null;
}

function alreadyTagged(opening: AstNode): boolean {
  const attributes = (opening.attributes ?? []) as AstNode[];
  return attributes.some((attr) => {
    if (attr.type !== 'JSXAttribute') return false;
    const name = attr.name as { name?: string } | undefined;
    return name?.name === 'data-od-loc';
  });
}

export function injectLocTags(code: string): string | null {
  const ast = parseSource(code);
  if (!ast) return null;

  const insertions: { offset: number; text: string }[] = [];
  walkJsx(ast, (node) => {
    const opening = node.openingElement as AstNode | undefined;
    if (!opening || !node.loc) return;
    if (!taggableName(opening) || alreadyTagged(opening)) return;
    const nameNode = opening.name as AstNode;
    insertions.push({
      offset: nameNode.end,
      text: ` data-od-loc="${node.loc.start.line}:${node.loc.start.column}"`,
    });
  });

  if (insertions.length === 0) return null;
  insertions.sort((a, b) => b.offset - a.offset);
  let next = code;
  for (const insertion of insertions) {
    next = next.slice(0, insertion.offset) + insertion.text + next.slice(insertion.offset);
  }
  return next;
}

export type LocTagsPluginOptions = {
  userCwd: string;
  docsDir?: string;
};

// Vite normally hands plugins POSIX ids, but other plugins can pass Windows
// paths through. Compare both sides in POSIX shape.
function isDocSourceFile(id: string, docsRootPosix: string): boolean {
  const filePath = id.split(/[?#]/)[0].replace(/\\/g, '/');
  if (!filePath.startsWith(`${docsRootPosix}/`)) return false;
  if (!filePath.endsWith('.tsx')) return false;
  if (filePath.endsWith('.d.ts') || filePath.endsWith('.test.tsx')) return false;
  return filePath.slice(docsRootPosix.length + 1).includes('/');
}

export function locTagsPlugin(opts: LocTagsPluginOptions): Plugin {
  const docsRoot = path.resolve(opts.userCwd, opts.docsDir ?? 'docs').replace(/\\/g, '/');
  return {
    name: 'open-doc:loc-tags',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      if (!isDocSourceFile(id, docsRoot)) return null;
      const next = injectLocTags(code);
      return next === null ? null : { code: next, map: null };
    },
  };
}

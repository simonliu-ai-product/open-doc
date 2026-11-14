import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_FILES = ['open-doc.config.ts', 'open-doc.config.js', 'open-doc.config.mjs'];

/**
 * A directory is an open-doc workspace when it carries an `open-doc.config.*`
 * or a package.json that depends on `@open-document/core`.
 */
export function isWorkspace(dir: string): boolean {
  if (CONFIG_FILES.some((f) => existsSync(path.join(dir, f)))) return true;
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      pkg.dependencies?.['@open-document/core'] ?? pkg.devDependencies?.['@open-document/core'],
    );
  } catch {
    return false;
  }
}

/** The nearest workspace at or above `start`, or null. */
export function findWorkspace(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (isWorkspace(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The first `file://` root that is, or sits inside, a workspace. */
export function workspaceFromRoots(uris: readonly string[]): string | null {
  for (const uri of uris) {
    if (!uri.startsWith('file:')) continue;
    let dir: string;
    try {
      dir = fileURLToPath(uri);
    } catch {
      continue;
    }
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const found = findWorkspace(dir);
    if (found) return found;
  }
  return null;
}

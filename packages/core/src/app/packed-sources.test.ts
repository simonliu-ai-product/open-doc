import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The viewer ships as source: a workspace's Vite compiles `src/app` from the
 * installed package. Anything `src/app` imports at runtime from elsewhere in
 * `src/` therefore has to be listed in `files`, or every fresh workspace fails
 * at `open-doc dev` with "Could not resolve" (0.14.0 and 0.14.1 shipped without
 * `src/agent`). Type-only imports are erased and do not need to ship.
 */
const pkgDir = path.resolve(import.meta.dirname, '../..');
const appDir = path.join(pkgDir, 'src/app');
const files: string[] = JSON.parse(
  fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
).files;

const RUNTIME_IMPORT =
  /^(?:import|export)\s+(?!type\b)[^;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/gms;

function resolve(from: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
    (c) => fs.existsSync(c) && fs.statSync(c).isFile(),
  );
}

function isPacked(file: string): boolean {
  const rel = path.relative(pkgDir, file).split(path.sep).join('/');
  return files.some(
    (entry) => !entry.startsWith('!') && (rel === entry || rel.startsWith(`${entry}/`)),
  );
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

describe('packed sources', () => {
  it('ships every file the viewer imports at runtime', () => {
    const seen = new Set<string>();
    const missing: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of fs.readFileSync(file, 'utf8').matchAll(RUNTIME_IMPORT)) {
        const target = resolve(file, m[1] ?? m[2]);
        if (!target || !/\.tsx?$/.test(target)) continue;
        if (!isPacked(target))
          missing.push(
            `${path.relative(pkgDir, target)} (imported by ${path.relative(pkgDir, file)})`,
          );
        walk(target);
      }
    };
    for (const f of sources(appDir)) walk(f);
    expect(missing).toEqual([]);
  });
});

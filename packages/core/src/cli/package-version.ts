import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@open-document/core';

/**
 * Walks up for this package's own `package.json` instead of assuming a fixed
 * depth: the bundler decides which chunk a module lands in, so `../../` is
 * right from `dist/cli/` and wrong from `dist/`. Getting that wrong is silent —
 * it reports `0.0.0`, or finds no templates, rather than failing.
 */
async function findCorePackage(): Promise<{ root: string; version: string } | null> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 6; up += 1) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === PACKAGE_NAME && pkg.version !== undefined) {
        return { root: dir, version: pkg.version };
      }
    } catch {
      // Keep walking — a missing package.json at this level is expected.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function readCoreVersion(): Promise<string> {
  return (await findCorePackage())?.version ?? '0.0.0';
}

/** The installed package's root — where `skills/` and `templates/` ship. */
export async function corePackageRoot(): Promise<string | null> {
  return (await findCorePackage())?.root ?? null;
}

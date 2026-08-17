import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';

const here = dirname(fileURLToPath(import.meta.url));
const corePkg = JSON.parse(readFileSync(resolve(here, '..', 'core', 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  format: 'esm',
  target: 'node18',
  platform: 'node',
  // tsdown >=0.22 defaults fixedExtension to true on platform 'node', which
  // renames the output to .mjs/.d.mts. The package is already ESM-only, so keep
  // the plain .js/.d.ts names the exports map and bin point at.
  fixedExtension: false,
  clean: true,
  dts: false,
  shims: false,
  define: {
    __CORE_VERSION_AT_BUILD__: JSON.stringify(corePkg.version),
  },
});

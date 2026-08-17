import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/bin': 'src/cli/bin.ts',
    'ops/index': 'src/ops/index.ts',
    'vite/index': 'src/vite/index.ts',
  },
  format: 'esm',
  target: 'node18',
  platform: 'node',
  // tsdown >=0.22 defaults fixedExtension to true on platform 'node', which
  // renames the output to .mjs/.d.mts. The package is already ESM-only, so keep
  // the plain .js/.d.ts names the exports map and bin point at.
  fixedExtension: false,
  clean: true,
  dts: true,
  shims: false,
  external: ['vite', 'react', 'react-dom', 'react-router-dom'],
});

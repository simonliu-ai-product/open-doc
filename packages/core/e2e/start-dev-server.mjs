// Boots `open-doc dev` for the e2e suite against a throwaway copy of the
// fixture project (see scratch.mjs).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureDir, prepareScratchProject } from './scratch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(here, '..');

if (!existsSync(path.join(coreRoot, 'dist', 'cli', 'bin.js'))) {
  console.error(
    'packages/core/dist is missing. Run `pnpm --filter @open-document/core build` first.',
  );
  process.exit(1);
}
if (!existsSync(path.join(fixtureDir, 'node_modules'))) {
  console.error('e2e fixture has no node_modules. Run `pnpm install` first.');
  process.exit(1);
}

const scratchDir = prepareScratchProject('dev');

// Bind to 127.0.0.1 explicitly. Vite's default host resolves to `localhost`,
// which on CI runners can bind to IPv6 `::1` only, leaving Playwright's IPv4
// readiness probe hanging until the webServer timeout.
const child = spawn(
  process.execPath,
  [
    path.join(coreRoot, 'bin.js'),
    'dev',
    '--no-skills-check',
    '--host',
    '127.0.0.1',
    ...process.argv.slice(2),
  ],
  {
    cwd: scratchDir,
    stdio: 'inherit',
    // The model list a signed-in `codex` caches for its own picker, so the
    // panel's menu does not depend on this machine's ~/.codex.
    env: { ...process.env, CODEX_HOME: path.join(here, 'codex-home') },
  },
);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

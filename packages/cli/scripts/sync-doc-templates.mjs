import { existsSync } from 'node:fs';
import { cp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The document templates are canonical in @open-document/core; `init
// --template` copies one into the new workspace before core is installed, so
// the scaffolder carries a mirror made at build time — the same arrangement
// as the skills.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_TEMPLATES = path.resolve(HERE, '..', '..', 'core', 'templates');
const MIRROR = path.resolve(HERE, '..', 'doc-templates');

async function main() {
  if (!existsSync(CORE_TEMPLATES)) {
    throw new Error(`Canonical templates not found at ${CORE_TEMPLATES}.`);
  }
  await rm(MIRROR, { recursive: true, force: true });
  await cp(CORE_TEMPLATES, MIRROR, { recursive: true });
  const names = (await readdir(MIRROR, { withFileTypes: true })).filter((e) => e.isDirectory());
  process.stdout.write(`Mirrored ${names.length} document templates into doc-templates/.\n`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
});

import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SKILLS = path.join(ROOT, 'packages', 'core', 'skills');
const PLUGIN_SKILLS = path.join(ROOT, 'plugins', 'open-doc', 'skills');

const names = (await readdir(CORE_SKILLS, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

await rm(PLUGIN_SKILLS, { recursive: true, force: true });
await mkdir(PLUGIN_SKILLS, { recursive: true });
for (const name of names) {
  await cp(path.join(CORE_SKILLS, name), path.join(PLUGIN_SKILLS, name), { recursive: true });
}
process.stdout.write(`Mirrored ${names.length} skills into plugins/open-doc/skills/.\n`);

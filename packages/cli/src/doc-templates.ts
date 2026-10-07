import { existsSync } from 'node:fs';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC_TEMPLATES_DIR = resolve(HERE, '..', 'doc-templates');

export type DocTemplate = { name: string; title: string; description: string; category: string };

/** The templates this scaffolder carries — the same set `open-doc templates` lists once core is installed. */
export async function listDocTemplates(): Promise<DocTemplate[]> {
  if (!existsSync(DOC_TEMPLATES_DIR)) return [];
  const out: DocTemplate[] = [];
  for (const entry of await readdir(DOC_TEMPLATES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(DOC_TEMPLATES_DIR, entry.name);
    if (!existsSync(join(dir, 'index.tsx'))) continue;
    let manifest: Partial<DocTemplate> = {};
    try {
      manifest = JSON.parse(await readFile(join(dir, 'template.json'), 'utf8'));
    } catch {}
    out.push({
      name: entry.name,
      title: manifest.title ?? entry.name,
      description: manifest.description ?? '',
      category: manifest.category ?? 'general',
    });
  }
  return out.sort(
    (a, b) =>
      Number(a.name === 'blank') - Number(b.name === 'blank') ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Copies a template into `<workspace>/docs/<name>/`, dated today so it sorts
 * as new. No parser here — core is not installed yet — so the date is swapped
 * by pattern, on the one `createdAt` a template's meta carries.
 */
export async function addDocFromTemplate(workspace: string, name: string): Promise<string> {
  const templates = await listDocTemplates();
  if (!templates.some((template) => template.name === name)) {
    throw new Error(
      `No template named "${name}". Available: ${templates.map((t) => t.name).join(', ')}.`,
    );
  }
  const target = join(workspace, 'docs', name);
  await cp(join(DOC_TEMPLATES_DIR, name), target, {
    recursive: true,
    filter: (src) => !src.endsWith('template.json'),
  });
  const entry = join(target, 'index.tsx');
  const source = await readFile(entry, 'utf8');
  await writeFile(
    entry,
    source.replace(/createdAt:\s*'[^']*'/, `createdAt: '${new Date().toISOString()}'`),
  );
  return `docs/${name}/index.tsx`;
}

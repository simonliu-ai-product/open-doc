import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { corePackageRoot } from '../cli/package-version.ts';
import { setMetaString, validateDocTitle } from '../editing/doc-ops.ts';
import { DOC_ID_RE } from '../vite/open-doc-plugin.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { listDocIds, OpsError } from './documents.ts';

export type TemplateSummary = {
  /** What `--template` takes. */
  name: string;
  title: string;
  description: string;
  category: string;
  /** Shipped with open-doc, or written in this workspace's `templates/`. */
  source: 'builtin' | 'workspace';
};

const TEMPLATE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MANIFEST = 'template.json';

async function readTemplateDir(
  dir: string,
  name: string,
  source: TemplateSummary['source'],
): Promise<(TemplateSummary & { placeholder?: string }) | null> {
  if (!TEMPLATE_NAME_RE.test(name) || !existsSync(path.join(dir, 'index.tsx'))) return null;
  let manifest: Partial<Record<'title' | 'description' | 'category' | 'placeholder', unknown>> = {};
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, MANIFEST), 'utf8'));
  } catch {
    // A folder with an index.tsx is a template even without a manifest.
  }
  const text = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return {
    name,
    title: text(manifest.title, name),
    description: text(manifest.description, ''),
    category: text(manifest.category, 'general'),
    source,
    ...(typeof manifest.placeholder === 'string' && manifest.placeholder.trim()
      ? { placeholder: manifest.placeholder.trim() }
      : {}),
  };
}

async function templatesIn(
  root: string | null,
  source: TemplateSummary['source'],
): Promise<Map<string, { dir: string; summary: TemplateSummary & { placeholder?: string } }>> {
  const found = new Map<
    string,
    { dir: string; summary: TemplateSummary & { placeholder?: string } }
  >();
  if (!root || !existsSync(root)) return found;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const summary = await readTemplateDir(dir, entry.name, source);
    if (summary) found.set(entry.name, { dir, summary });
  }
  return found;
}

/**
 * Every template a document can start from: the ones open-doc ships, then the
 * workspace's own `templates/<name>/`, which win on a shared name — a team's
 * `report` is the report they mean.
 */
async function allTemplates(
  ctx: ApiContext,
): Promise<Map<string, { dir: string; summary: TemplateSummary & { placeholder?: string } }>> {
  const root = await corePackageRoot();
  const builtin = await templatesIn(root && path.join(root, 'templates'), 'builtin');
  const workspace = await templatesIn(path.join(ctx.userCwd, 'templates'), 'workspace');
  return new Map([...builtin, ...workspace]);
}

export async function listTemplates(ctx: ApiContext): Promise<TemplateSummary[]> {
  return [...(await allTemplates(ctx)).values()]
    .map(({ summary: { placeholder: _, ...summary } }) => summary)
    .sort(
      (a, b) =>
        Number(a.name === 'blank') - Number(b.name === 'blank') ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name),
    );
}

const slugOf = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/**
 * A free id from a title, else the template's name — a title in Chinese has
 * no letters to make one from: `quarterly-report`, then `quarterly-report-2`.
 */
export function suggestDocId(bases: string[], taken: Set<string>): string {
  const slug = bases.map(slugOf).find(Boolean) || 'document';
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
}

/**
 * A new document copied from a template: its folder as it is, minus the
 * manifest, with the title it was given and today as its creation date — so
 * it sorts as new, not as old as the template.
 */
export async function createFromTemplate(
  ctx: ApiContext,
  opts: { template: string; docId?: string; title?: string },
): Promise<{ id: string; entry: string }> {
  const template = (await allTemplates(ctx)).get(opts.template);
  if (!template) {
    throw new OpsError(404, `no template named "${opts.template}" — see \`open-doc templates\``);
  }
  const title = opts.title === undefined ? undefined : validateDocTitle(opts.title);
  if (opts.title !== undefined && !title) throw new OpsError(400, 'invalid title');

  const taken = new Set(await listDocIds(ctx));
  const id = opts.docId ?? suggestDocId([title ?? '', template.summary.name], taken);
  if (!DOC_ID_RE.test(id)) throw new OpsError(400, `invalid document id: ${id}`);
  if (taken.has(id)) throw new OpsError(409, `document already exists: ${id}`);

  const dir = path.join(ctx.docsRoot, id);
  await fs.cp(template.dir, dir, {
    recursive: true,
    filter: (src) => path.basename(src) !== MANIFEST,
  });
  const entry = path.join(dir, 'index.tsx');
  let source = await fs.readFile(entry, 'utf8');
  source = setMetaString(source, 'createdAt', new Date().toISOString()) ?? source;
  if (title) {
    // The template names its stand-in title, and the new one replaces it
    // wherever it prints — the cover, a running header — not only in meta.
    // A title that would need escaping in JSX text is left to meta alone.
    const placeholder = template.summary.placeholder;
    if (placeholder && !/[{}<>'"\\\n]/.test(title)) source = source.split(placeholder).join(title);
    source = setMetaString(source, 'title', title) ?? source;
  }
  await fs.writeFile(entry, source, 'utf8');
  return { id, entry: path.relative(ctx.userCwd, entry) };
}

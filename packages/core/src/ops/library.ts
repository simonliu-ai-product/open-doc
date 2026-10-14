import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {
  assetImportPath,
  countAssetUsages,
  resolveScopedAssetFile,
  resolveScopedAssetsDir,
  validateAssetName,
} from '../files/assets.ts';
import {
  type Folder,
  newFolderId,
  readManifest,
  validateIcon,
  validateName,
  writeManifest,
} from '../files/folders.ts';
import type { ApiContext } from '../vite/routes/context.ts';
import { parseFrontmatter } from '../vite/themes-plugin.ts';
import { withFileLock } from './concurrency.ts';
import { listDocIds, OpsError, resolveEntry } from './documents.ts';

/** Themes, assets, and folders — the material a document is written against. */

export type ThemeSummary = {
  id: string;
  name: string;
  description?: string;
  pageSize?: string;
  mode?: string;
  hasDemo: boolean;
};

function themesRoot(ctx: ApiContext, themesDir = 'themes'): string {
  return path.resolve(ctx.userCwd, themesDir);
}

async function themeFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  return (await fg('*.md', { cwd: root, absolute: true, onlyFiles: true })).sort();
}

function demoFor(root: string, id: string): string | null {
  for (const cand of [`${id}.demo.tsx`, `${id}.demo.jsx`, `${id}.demo.ts`, `${id}.demo.js`]) {
    const p = path.join(root, cand);
    if (existsSync(p)) return p;
  }
  return null;
}

export async function listThemes(ctx: ApiContext, themesDir?: string): Promise<ThemeSummary[]> {
  const root = themesRoot(ctx, themesDir);
  const out: ThemeSummary[] = [];
  for (const file of await themeFiles(root)) {
    const id = path.basename(file, '.md');
    const { fm } = parseFrontmatter(await fs.readFile(file, 'utf8'), id);
    out.push({
      id,
      name: fm.name,
      description: fm.description,
      pageSize: fm.pageSize,
      mode: fm.mode,
      hasDemo: demoFor(root, id) !== null,
    });
  }
  return out;
}

/**
 * The full theme document. This is what an agent reads before writing a doc —
 * the palette, type scale, and paste-ready components live in the body.
 */
export async function readTheme(
  ctx: ApiContext,
  themeId: string,
  themesDir?: string,
): Promise<{ id: string; frontmatter: unknown; body: string; demo?: string }> {
  const root = themesRoot(ctx, themesDir);
  const file = path.join(root, `${themeId}.md`);
  if (!file.startsWith(root + path.sep) || !existsSync(file)) {
    throw new OpsError(404, `theme not found: ${themeId}`);
  }
  const { fm, body } = parseFrontmatter(await fs.readFile(file, 'utf8'), themeId);
  const demoAbs = demoFor(root, themeId);
  return {
    id: themeId,
    frontmatter: fm,
    body,
    demo: demoAbs ? await fs.readFile(demoAbs, 'utf8') : undefined,
  };
}

export type AssetSummary = {
  scope: string;
  filename: string;
  bytes: number;
  importPath: string;
};

/** `scope` is a document id, or `global` for the shared assets directory. */
export async function listAssets(ctx: ApiContext, scope: string): Promise<AssetSummary[]> {
  const dir = resolveScopedAssetsDir(ctx.docsRoot, ctx.globalAssetsRoot, scope);
  if (!dir) throw new OpsError(400, `invalid scope: ${scope}`);
  if (!existsSync(dir)) return [];
  const names = await fs.readdir(dir);
  const out: AssetSummary[] = [];
  for (const filename of names.sort()) {
    const stat = await fs.stat(path.join(dir, filename)).catch(() => null);
    if (!stat?.isFile()) continue;
    out.push({
      scope,
      filename,
      bytes: stat.size,
      importPath: assetImportPath(scope, filename),
    });
  }
  return out;
}

export async function writeAsset(
  ctx: ApiContext,
  scope: string,
  filename: unknown,
  data: Buffer,
): Promise<AssetSummary> {
  const name = validateAssetName(filename);
  if (!name) throw new OpsError(400, 'invalid filename');
  const dir = resolveScopedAssetsDir(ctx.docsRoot, ctx.globalAssetsRoot, scope);
  if (!dir) throw new OpsError(400, `invalid scope: ${scope}`);
  await fs.mkdir(dir, { recursive: true });
  const file = resolveScopedAssetFile(ctx.docsRoot, ctx.globalAssetsRoot, scope, name);
  if (!file) throw new OpsError(400, 'invalid filename');
  await withFileLock(file, async () => {
    await fs.writeFile(file, data);
  });
  return {
    scope,
    filename: name,
    bytes: data.byteLength,
    importPath: assetImportPath(scope, name),
  };
}

export async function deleteAsset(ctx: ApiContext, scope: string, filename: string): Promise<void> {
  const file = resolveScopedAssetFile(ctx.docsRoot, ctx.globalAssetsRoot, scope, filename);
  if (!file) throw new OpsError(400, 'invalid filename');
  if (!existsSync(file)) throw new OpsError(404, `asset not found: ${scope}/${filename}`);
  await withFileLock(file, async () => {
    await fs.rm(file);
  });
}

/** Which documents import this asset — check before deleting one. */
export async function findAssetUsages(
  ctx: ApiContext,
  scope: string,
  filename: string,
): Promise<{ docId: string; count: number }[]> {
  const importPath = assetImportPath(scope, filename);
  const out: { docId: string; count: number }[] = [];
  for (const id of await listDocIds(ctx)) {
    const entry = resolveEntry(ctx, id);
    if (!entry) continue;
    const count = countAssetUsages(await fs.readFile(entry, 'utf8'), importPath);
    if (count > 0) out.push({ docId: id, count });
  }
  return out;
}

export async function listFolders(
  ctx: ApiContext,
): Promise<{ folders: Folder[]; assignments: Record<string, string> }> {
  const manifest = await readManifest(ctx.manifestPath);
  return { folders: manifest.folders, assignments: manifest.assignments };
}

/** Folders always carry an icon; agents rarely care, so this is the fallback. */
const DEFAULT_FOLDER_ICON = { type: 'color', value: '#6b7280' };

export async function createFolder(
  ctx: ApiContext,
  rawName: unknown,
  rawIcon?: unknown,
): Promise<Folder> {
  const name = validateName(rawName);
  if (!name) throw new OpsError(400, 'invalid folder name');
  const icon = validateIcon(rawIcon ?? DEFAULT_FOLDER_ICON);
  if (!icon) throw new OpsError(400, 'invalid icon');
  return withFileLock(ctx.manifestPath, async () => {
    const manifest = await readManifest(ctx.manifestPath);
    const folder: Folder = { id: newFolderId(), name, icon };
    manifest.folders.push(folder);
    await writeManifest(ctx.manifestPath, manifest);
    return folder;
  });
}

/** Filing only edits assignments — a document id never moves on disk. */
export async function fileDocument(
  ctx: ApiContext,
  docId: string,
  folderId: string | null,
): Promise<void> {
  await withFileLock(ctx.manifestPath, async () => {
    const manifest = await readManifest(ctx.manifestPath);
    if (folderId !== null && !manifest.folders.some((f) => f.id === folderId)) {
      throw new OpsError(404, `folder not found: ${folderId}`);
    }
    if (folderId === null) delete manifest.assignments[docId];
    else manifest.assignments[docId] = folderId;
    await writeManifest(ctx.manifestPath, manifest);
  });
}

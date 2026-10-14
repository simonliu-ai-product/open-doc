import type { ViteDevServer } from 'vite';
import {
  FOLDER_ID_RE,
  type Folder,
  newFolderId,
  readManifest,
  validateIcon,
  validateName,
  validateReorder,
  writeManifest,
} from '../../files/folders.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { withFileLock } from '../../ops/concurrency.ts';
import { DOC_ID_RE } from '../open-doc-plugin.ts';
import { type ApiContext, json, readBody } from './context.ts';

// GET    /__folders            list manifest
// POST   /__folders            create folder { name, icon }
// PUT    /__folders/assign     assign document to folder { docId, folderId | null }
// PUT    /__folders/reorder    reorder folders { ids: string[] } (permutation)
// PATCH  /__folders/:id        rename / re-icon folder { name?, icon? }
// DELETE /__folders/:id        delete folder + drop its assignments

export function registerFolderRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__folders', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/') {
        return json(res, 200, await readManifest(ctx.manifestPath));
      }

      if (method === 'POST' && url.pathname === '/') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) return json(res, requestCheck.status, { error: requestCheck.error });

        const body = (await readBody(req)) as { name?: unknown; icon?: unknown };
        const name = validateName(body.name);
        if (!name) return json(res, 400, { error: 'invalid name' });
        const icon = validateIcon(body.icon);
        if (!icon) return json(res, 400, { error: 'invalid icon' });

        const folder = await withFileLock(ctx.manifestPath, async () => {
          const manifest = await readManifest(ctx.manifestPath);
          const created: Folder = { id: newFolderId(), name, icon };
          manifest.folders.push(created);
          await writeManifest(ctx.manifestPath, manifest);
          return created;
        });
        return json(res, 200, folder);
      }

      if (method === 'PUT' && url.pathname === '/assign') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) return json(res, requestCheck.status, { error: requestCheck.error });

        const body = (await readBody(req)) as { docId?: unknown; folderId?: unknown };
        if (typeof body.docId !== 'string' || !DOC_ID_RE.test(body.docId)) {
          return json(res, 400, { error: 'invalid docId' });
        }
        const docId = body.docId;

        let folderId: string | null;
        if (body.folderId === null) folderId = null;
        else if (typeof body.folderId === 'string' && FOLDER_ID_RE.test(body.folderId)) {
          folderId = body.folderId;
        } else return json(res, 400, { error: 'invalid folderId' });

        const assigned = await withFileLock(ctx.manifestPath, async () => {
          const manifest = await readManifest(ctx.manifestPath);
          if (folderId && !manifest.folders.some((f) => f.id === folderId)) {
            return false;
          }
          if (folderId === null) delete manifest.assignments[docId];
          else manifest.assignments[docId] = folderId;
          await writeManifest(ctx.manifestPath, manifest);
          return true;
        });
        if (!assigned) return json(res, 404, { error: 'folder not found' });
        return json(res, 200, { ok: true });
      }

      if (method === 'PUT' && url.pathname === '/reorder') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) return json(res, requestCheck.status, { error: requestCheck.error });

        const body = (await readBody(req)) as { ids?: unknown };
        const reordered = await withFileLock(ctx.manifestPath, async () => {
          const manifest = await readManifest(ctx.manifestPath);
          const ids = validateReorder(body.ids, manifest.folders);
          if (!ids) return false;
          const byId = new Map(manifest.folders.map((f) => [f.id, f]));
          manifest.folders = ids.map((id) => byId.get(id) as Folder);
          await writeManifest(ctx.manifestPath, manifest);
          return true;
        });
        if (!reordered) return json(res, 400, { error: 'invalid ids' });
        return json(res, 200, { ok: true });
      }

      const idMatch = url.pathname.match(/^\/([^/]+)$/);
      if (idMatch) {
        const id = idMatch[1];
        if (!FOLDER_ID_RE.test(id)) return json(res, 400, { error: 'invalid id' });

        if (method === 'PATCH') {
          const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
          if (!requestCheck.ok) {
            return json(res, requestCheck.status, { error: requestCheck.error });
          }
          const body = (await readBody(req)) as { name?: unknown; icon?: unknown };
          const outcome = await withFileLock(ctx.manifestPath, async () => {
            const manifest = await readManifest(ctx.manifestPath);
            const folder = manifest.folders.find((f) => f.id === id);
            if (!folder) return { status: 404 as const, error: 'folder not found' };

            if (body.name !== undefined) {
              const name = validateName(body.name);
              if (!name) return { status: 400 as const, error: 'invalid name' };
              folder.name = name;
            }
            if (body.icon !== undefined) {
              const icon = validateIcon(body.icon);
              if (!icon) return { status: 400 as const, error: 'invalid icon' };
              folder.icon = icon;
            }
            await writeManifest(ctx.manifestPath, manifest);
            return { status: 200 as const, folder };
          });
          if (outcome.status !== 200) return json(res, outcome.status, { error: outcome.error });
          return json(res, 200, outcome.folder);
        }

        if (method === 'DELETE') {
          const requestCheck = validateMutationRequest(req);
          if (!requestCheck.ok) {
            return json(res, requestCheck.status, { error: requestCheck.error });
          }
          const deleted = await withFileLock(ctx.manifestPath, async () => {
            const manifest = await readManifest(ctx.manifestPath);
            const before = manifest.folders.length;
            manifest.folders = manifest.folders.filter((f) => f.id !== id);
            if (manifest.folders.length === before) return false;
            for (const [docId, folderId] of Object.entries(manifest.assignments)) {
              if (folderId === id) delete manifest.assignments[docId];
            }
            await writeManifest(ctx.manifestPath, manifest);
            return true;
          });
          if (!deleted) return json(res, 404, { error: 'folder not found' });
          return json(res, 200, { ok: true });
        }
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}

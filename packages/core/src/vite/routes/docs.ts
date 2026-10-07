import type { ViteDevServer } from 'vite';
import { validateMutationRequest } from '../../http/request-guard.ts';
import {
  deleteDocument,
  duplicateDocument,
  OpsError,
  renameDocument,
} from '../../ops/documents.ts';
import { type ApiContext, json, readBody } from './context.ts';
import { announceDocument } from './templates.ts';

// PATCH  /__docs/:id            rename the document's meta.title { title }
// POST   /__docs/:id/duplicate  copy the folder to a fresh id { newId? }
// DELETE /__docs/:id            delete the document folder from disk
//
// The work itself lives in `ops/` so the MCP server runs the same code.

export function registerDocRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__docs', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      const duplicateMatch = url.pathname.match(/^\/([^/]+)\/duplicate$/);
      const idMatch = url.pathname.match(/^\/([^/]+)$/);

      if (duplicateMatch && method === 'POST') {
        const requestCheck = validateMutationRequest(req);
        if (!requestCheck.ok) return json(res, requestCheck.status, { error: requestCheck.error });

        const docId = decodeURIComponent(duplicateMatch[1]);
        const body = (await readBody(req).catch(() => ({}))) as { newId?: unknown };
        const newId = typeof body.newId === 'string' && body.newId !== '' ? body.newId : undefined;
        const result = await duplicateDocument(ctx, docId, newId);
        announceDocument(server, ctx, result.id);
        return json(res, 200, { ok: true, docId: result.id });
      }

      if (idMatch) {
        const docId = decodeURIComponent(idMatch[1]);

        if (method === 'PATCH') {
          const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
          if (!requestCheck.ok) {
            return json(res, requestCheck.status, { error: requestCheck.error });
          }
          const body = (await readBody(req)) as { title?: unknown };
          const result = await renameDocument(ctx, docId, body.title);
          return json(res, 200, { ok: true, title: result.title });
        }

        if (method === 'DELETE') {
          const requestCheck = validateMutationRequest(req);
          if (!requestCheck.ok) {
            return json(res, requestCheck.status, { error: requestCheck.error });
          }
          await deleteDocument(ctx, docId);
          return json(res, 200, { ok: true });
        }
      }

      next();
    } catch (err) {
      if (err instanceof OpsError) return json(res, err.status, { error: err.message });
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}

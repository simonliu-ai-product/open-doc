import type { ViteDevServer } from 'vite';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { listRevisions, readChanges, revertChange } from '../../ops/changes.ts';
import { OpsError } from '../../ops/documents.ts';
import { type ApiContext, json, readBody } from './context.ts';

// GET  /__changes?docId=…&since=HEAD     the document's changes since a revision
// GET  /__changes/revisions?docId=…      recent commits that touched it
// POST /__changes/revert                 { docId, since?, file, hunk }

export function registerChangesRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__changes', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';
    try {
      if (method === 'GET' && url.pathname === '/') {
        const docId = url.searchParams.get('docId') ?? '';
        return json(
          res,
          200,
          await readChanges(ctx, docId, url.searchParams.get('since') || 'HEAD'),
        );
      }
      if (method === 'GET' && url.pathname === '/revisions') {
        return json(res, 200, {
          revisions: await listRevisions(ctx, url.searchParams.get('docId') ?? ''),
        });
      }
      if (method === 'POST' && url.pathname === '/revert') {
        const check = validateMutationRequest(req, { requireJsonBody: true });
        if (!check.ok) return json(res, check.status, { error: check.error });
        const body = (await readBody(req)) as Record<string, unknown>;
        if (
          typeof body.docId !== 'string' ||
          typeof body.file !== 'string' ||
          typeof body.hunk !== 'string'
        ) {
          return json(res, 400, { error: 'invalid payload' });
        }
        return json(
          res,
          200,
          await revertChange(ctx, body.docId, {
            file: body.file,
            hunk: body.hunk,
            ...(typeof body.since === 'string' ? { since: body.since } : {}),
          }),
        );
      }
      return next();
    } catch (err) {
      if (err instanceof OpsError) return json(res, err.status, { error: err.message });
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}

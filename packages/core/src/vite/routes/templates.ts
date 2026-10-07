import type { ViteDevServer } from 'vite';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { OpsError } from '../../ops/documents.ts';
import { fileDocument } from '../../ops/library.ts';
import { createFromTemplate, listTemplates } from '../../ops/templates.ts';
import { type ApiContext, json, readBody } from './context.ts';

// GET  /__templates                 every template, built-in and the workspace's own
// POST /__templates/:name/create    a new document from it { docId?, title?, folderId? }

export function registerTemplateRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__templates', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';
    try {
      if (method === 'GET' && url.pathname === '/') {
        return json(res, 200, { templates: await listTemplates(ctx) });
      }
      const create = url.pathname.match(/^\/([^/]+)\/create$/);
      if (create && method === 'POST') {
        const check = validateMutationRequest(req, { requireJsonBody: true });
        if (!check.ok) return json(res, check.status, { error: check.error });
        const body = (await readBody(req)) as Record<string, unknown>;
        const text = (value: unknown) =>
          typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
        const docId = text(body.docId);
        const title = text(body.title);
        const result = await createFromTemplate(ctx, {
          template: decodeURIComponent(create[1] as string),
          ...(docId ? { docId } : {}),
          ...(title ? { title } : {}),
        });
        const folderId = text(body.folderId);
        if (folderId) await fileDocument(ctx, result.id, folderId);
        return json(res, 200, { ok: true, docId: result.id });
      }
      return next();
    } catch (err) {
      if (err instanceof OpsError) return json(res, err.status, { error: err.message });
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}

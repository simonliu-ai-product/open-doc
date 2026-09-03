import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import { insertMarker, parseMarkers, removeMarker } from '../../editing/comments.ts';
import { replaceTextAt, resolveTextTarget } from '../../editing/edit-ops.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { type ApiContext, json, readBody, resolveDocEntry } from './context.ts';

// GET    /__edit/text?docId=…&locs=12:4,296:10&shown=…   resolve what was clicked
// PUT    /__edit/text   { docId, line, column, text, index?, expected? }
// POST   /__edit/comment                         { docId, line, column, note, hint? }
// GET    /__comments?docId=…                     list pending markers
// DELETE /__comments?docId=…&id=…                drop one marker

type Loc = { docId: string; line: number; column: number };

function readLoc(body: Record<string, unknown>): Loc | null {
  const { docId, line, column } = body as { docId?: unknown; line?: unknown; column?: unknown };
  if (typeof docId !== 'string') return null;
  if (typeof line !== 'number' || typeof column !== 'number') return null;
  return { docId, line, column };
}

export function registerEditRoutes(server: ViteDevServer, ctx: ApiContext): void {
  const entryFor = (docId: string) => resolveDocEntry(ctx.docsRoot, docId);

  server.middlewares.use('/__edit', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/text') {
        const docId = url.searchParams.get('docId') ?? '';
        const entry = entryFor(docId);
        const locs = (url.searchParams.get('locs') ?? '')
          .split(',')
          .map((pair) => pair.split(':').map(Number))
          .filter(([line, column]) => Number.isFinite(line) && Number.isFinite(column))
          .map(([line, column]) => ({ line, column }));
        if (!entry || locs.length === 0) return json(res, 400, { error: 'invalid target' });

        // The clicked host element often belongs to a local helper component;
        // the text the author wrote lives at the call site further up the
        // chain. The rendered text decides which candidate is really meant.
        const source = await fs.readFile(entry, 'utf8');
        const resolved = resolveTextTarget(
          source,
          locs,
          url.searchParams.get('shown') ?? undefined,
        );
        if (!resolved) return json(res, 404, { error: 'element not found' });
        return json(res, 200, resolved);
      }

      if (method === 'PUT' && url.pathname === '/text') {
        const check = validateMutationRequest(req, { requireJsonBody: true });
        if (!check.ok) return json(res, check.status, { error: check.error });

        const body = (await readBody(req)) as Record<string, unknown>;
        const loc = readLoc(body);
        const text = body.text;
        if (!loc || typeof text !== 'string') return json(res, 400, { error: 'invalid payload' });
        const entry = entryFor(loc.docId);
        if (!entry) return json(res, 404, { error: 'document not found' });

        const source = await fs.readFile(entry, 'utf8');
        const result = replaceTextAt(source, loc, text, {
          index: typeof body.index === 'number' ? body.index : undefined,
          expected: typeof body.expected === 'string' ? body.expected : undefined,
          shown: typeof body.shown === 'string' ? body.shown : undefined,
        });
        if (!result.ok) return json(res, result.status, { error: result.error });
        if (result.source !== source) await fs.writeFile(entry, result.source, 'utf8');
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/comment') {
        const check = validateMutationRequest(req, { requireJsonBody: true });
        if (!check.ok) return json(res, check.status, { error: check.error });

        const body = (await readBody(req)) as Record<string, unknown>;
        const loc = readLoc(body);
        const note = body.note;
        if (!loc || typeof note !== 'string' || note.trim() === '') {
          return json(res, 400, { error: 'invalid payload' });
        }
        const entry = entryFor(loc.docId);
        if (!entry) return json(res, 404, { error: 'document not found' });

        const source = await fs.readFile(entry, 'utf8');
        const inserted = insertMarker(
          source,
          loc,
          note.trim(),
          typeof body.hint === 'string' ? body.hint : undefined,
        );
        if (!inserted) {
          return json(res, 422, {
            error: 'cannot anchor a comment here — pick the surrounding element',
          });
        }
        await fs.writeFile(entry, inserted.source, 'utf8');
        return json(res, 200, { ok: true, id: inserted.id });
      }

      return next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });

  server.middlewares.use('/__comments', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';
    const docId = url.searchParams.get('docId') ?? '';
    const entry = entryFor(docId);

    try {
      if (method === 'GET') {
        if (!entry) return json(res, 200, { comments: [] });
        return json(res, 200, { comments: parseMarkers(await fs.readFile(entry, 'utf8')) });
      }

      if (method === 'DELETE') {
        const check = validateMutationRequest(req);
        if (!check.ok) return json(res, check.status, { error: check.error });
        const id = url.searchParams.get('id') ?? '';
        if (!entry || !/^c-[a-f0-9]+$/.test(id)) return json(res, 400, { error: 'invalid id' });

        const source = await fs.readFile(entry, 'utf8');
        const next = removeMarker(source, id);
        if (next === null) return json(res, 404, { error: 'comment not found' });
        await fs.writeFile(entry, next, 'utf8');
        return json(res, 200, { ok: true });
      }

      return next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}

import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import { insertMarker, parseMarkers, removeMarker } from '../../editing/comments.ts';
import { replaceTextAt, resolveTextTarget, type TextSegment } from '../../editing/edit-ops.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { OpsError } from '../../ops/documents.ts';
import { writeTexts } from '../../ops/text.ts';
import { type ApiContext, json, readBody, resolveDocEntry } from './context.ts';

// GET    /__edit/text?docId=…&locs=12:4,296:10&shown=…&prop=…   resolve what was clicked
// PUT    /__edit/text   { docId, line, column, text, index?, expected? }
// PUT    /__edit/texts  { docId, edits: [{ line, column, text, segments?, index?, expected?, shown? }] }
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

function readSegments(value: unknown): TextSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const segments: TextSegment[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    if (typeof raw?.text !== 'string') return undefined;
    segments.push({
      text: raw.text,
      bold: raw.bold === true,
      italic: raw.italic === true,
      code: raw.code === true,
      ...(typeof raw.href === 'string' ? { href: raw.href } : {}),
    });
  }
  return segments;
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
          url.searchParams.get('prop') ?? undefined,
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
          prop: typeof body.prop === 'string' ? body.prop : undefined,
        });
        if (!result.ok) return json(res, result.status, { error: result.error });
        if (result.source !== source) await fs.writeFile(entry, result.source, 'utf8');
        return json(res, 200, { ok: true });
      }

      if (method === 'PUT' && url.pathname === '/texts') {
        const check = validateMutationRequest(req, { requireJsonBody: true });
        if (!check.ok) return json(res, check.status, { error: check.error });

        const body = (await readBody(req)) as { docId?: unknown; edits?: unknown };
        if (typeof body.docId !== 'string' || !Array.isArray(body.edits)) {
          return json(res, 400, { error: 'invalid payload' });
        }
        const edits = [];
        for (const raw of body.edits as Record<string, unknown>[]) {
          const loc = readLoc({ ...raw, docId: body.docId });
          if (!loc || typeof raw.text !== 'string') {
            return json(res, 400, { error: 'invalid payload' });
          }
          edits.push({
            line: loc.line,
            column: loc.column,
            text: raw.text,
            segments: readSegments(raw.segments),
            index: typeof raw.index === 'number' ? raw.index : undefined,
            prop: typeof raw.prop === 'string' ? raw.prop : undefined,
            expected: typeof raw.expected === 'string' ? raw.expected : undefined,
            shown: typeof raw.shown === 'string' ? raw.shown : undefined,
          });
        }
        return json(res, 200, await writeTexts(ctx, body.docId, edits));
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
      if (err instanceof OpsError) return json(res, err.status, { error: err.message });
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

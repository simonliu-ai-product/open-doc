import fs from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { checkItemResult, shouldCheckAfterTurn } from '../../agent/check-after-turn.ts';
import { detectPackageManager } from '../../agent/install.ts';
import { extractDocSlug, stripDocSlug } from '../../agent/prompt.ts';
import type { AgentProvider } from '../../agent/provider.ts';
import { createProviders } from '../../agent/providers/index.ts';
import {
  type AgentRunner,
  createAgentRunner,
  type TurnEnd,
  type TurnSettings,
} from '../../agent/runner.ts';
import { agentStatus, installSdk } from '../../agent/status.ts';
import { createSessionStore, newId, type SessionStore } from '../../agent/store.ts';
import {
  type AgentStreamEvent,
  type AgentTurnContext,
  isAgentEffort,
  isAgentProviderId,
  type RespondPayload,
} from '../../agent/types.ts';
import { readMetaTitle } from '../../editing/doc-ops.ts';
import { UNTITLED_DOC_ID_RE } from '../../editing/placeholder-id.ts';
import { isLoopbackRequest, validateMutationRequest } from '../../http/request-guard.ts';
import { BLANK_DOC_TITLE, renameDocDir, resolveEntry } from '../../ops/documents.ts';
import { slugify } from '../../ops/import.ts';
import { checkLayout } from '../../ops/layout.ts';
import { DOC_ID_RE } from '../open-doc-plugin.ts';
import { type ApiContext, BodyTooLargeError, json, readBody } from './context.ts';
import { announceDocument } from './templates.ts';

// GET    /__agent/status                      → AgentStatus
// POST   /__agent/install                     { provider } → { ok }
// GET    /__agent/sessions                    → { sessions: AgentSessionSummary[] }
// POST   /__agent/sessions                    { provider, docId? } → AgentSession
// GET    /__agent/sessions/:id                → AgentSession
// DELETE /__agent/sessions/:id                → { ok }
// POST   /__agent/sessions/:id/messages       { text, context?, autoApprove?, model?, effort?, edit? } → { ok }
// POST   /__agent/sessions/:id/stop           → { ok }
// POST   /__agent/sessions/:id/respond        { itemId, answers? | allow? | cancel?, context?, autoApprove?, model?, effort? } → { ok }
// GET    /__agent/events                      → server-sent turn progress

function parseContext(raw: unknown): AgentTurnContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const ctx: AgentTurnContext = {};
  if (typeof r.docId === 'string' && DOC_ID_RE.test(r.docId)) ctx.docId = r.docId;
  if (typeof r.docTitle === 'string') ctx.docTitle = r.docTitle.slice(0, 120);
  if (typeof r.pageNumber === 'number' && Number.isFinite(r.pageNumber)) {
    ctx.pageNumber = Math.max(1, Math.floor(r.pageNumber));
  }
  if (typeof r.totalPages === 'number' && Number.isFinite(r.totalPages)) {
    ctx.totalPages = Math.max(1, Math.floor(r.totalPages));
  }
  if (typeof r.pendingComments === 'number' && Number.isFinite(r.pendingComments)) {
    ctx.pendingComments = Math.max(0, Math.floor(r.pendingComments));
  }
  if (r.newDoc === true) ctx.newDoc = true;
  const sel = r.selection;
  if (sel && typeof sel === 'object') {
    const s = sel as Record<string, unknown>;
    if (typeof s.line === 'number' && typeof s.column === 'number') {
      ctx.selection = {
        line: Math.max(1, Math.floor(s.line)),
        column: Math.max(0, Math.floor(s.column)),
        tagName: typeof s.tagName === 'string' ? s.tagName.slice(0, 32) : 'element',
        text: typeof s.text === 'string' ? s.text.slice(0, 120) : '',
      };
    }
  }
  return ctx;
}

const MODEL_RE = /^[\w.:[\]-]{1,80}$/;

function parseModel(raw: unknown): string | null {
  return typeof raw === 'string' && MODEL_RE.test(raw) ? raw : null;
}

// A document drafted into a blank `untitled` folder gets a real id once the
// turn that wrote it ends: the agent's <doc-slug> wins, else the title's slug.
// Renaming mid-turn would pull the file out from under the agent's edits.
async function renamePlaceholderDoc(
  server: ViteDevServer,
  ctx: ApiContext,
  store: SessionStore,
  broadcast: (event: AgentStreamEvent) => void,
  turn: TurnEnd,
): Promise<void> {
  const session = store.get(turn.sessionId);
  const docId = session?.docId;
  if (!session || !docId || !UNTITLED_DOC_ID_RE.test(docId)) return;

  const start = session.items.findIndex((i) => i.id === turn.userItemId);
  let marked: string | null = null;
  for (const item of session.items.slice(start + 1)) {
    if (item.kind !== 'assistant') continue;
    const slug = extractDocSlug(item.text);
    if (slug === null) continue;
    marked = slug;
    store.updateItem(session.id, item.id, 'assistant', { text: stripDocSlug(item.text) });
  }

  if (store.list().some((s) => s.docId === docId && s.status === 'running')) return;
  const entry = resolveEntry(ctx, docId);
  if (!entry) return;
  let source: string;
  try {
    source = await fs.readFile(entry, 'utf8');
  } catch {
    return;
  }
  const title = readMetaTitle(source);
  if (!title || title === BLANK_DOC_TITLE) return;
  const desired = slugify(marked ?? '', '') || slugify(title, '');
  if (!desired || UNTITLED_DOC_ID_RE.test(desired)) return;

  // A new turn may have started while the file was read; it must not lose the
  // folder it is writing into.
  if (store.list().some((s) => s.docId === docId && s.status === 'running')) return;
  const renamed = await renameDocDir(ctx, docId, desired).catch(() => null);
  if (!renamed || renamed.id === docId) return;
  for (const s of store.list()) {
    if (s.docId === docId) store.patch(s.id, { docId: renamed.id });
  }
  announceDocument(server, ctx, renamed.id);
  broadcast({ type: 'doc-renamed', from: docId, to: renamed.id });
}

// An agent whose sandbox cannot start a browser cannot run `open-doc check`;
// the dev server is not sandboxed, so it runs the check for it and the result
// lands in the transcript. Reuses this server, so the browser stays warm.
async function checkAfterTurn(
  server: ViteDevServer,
  ctx: ApiContext,
  store: SessionStore,
  providers: Record<string, AgentProvider>,
  turn: TurnEnd,
): Promise<void> {
  const session = store.get(turn.sessionId);
  const docId = session?.docId;
  if (!session || !docId) return;
  // A new turn on the same document would be checked half-written.
  if (store.list().some((s) => s.docId === docId && s.status === 'running')) return;
  const entry = resolveEntry(ctx, docId);
  const entryMtimeMs = entry ? ((await fs.stat(entry).catch(() => null))?.mtimeMs ?? null) : null;
  const check = shouldCheckAfterTurn({
    session,
    userItemId: turn.userItemId,
    canOpenBrowser: providers[session.provider]?.canOpenBrowser ?? true,
    entryMtimeMs,
  });
  if (!check) return;

  const item = store.appendItem(session.id, {
    kind: 'check',
    id: newId('c'),
    ts: new Date().toISOString(),
    docId,
    status: 'running',
    pageCount: null,
    findings: [],
    total: 0,
    error: null,
  });
  const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '');
  try {
    const report = await checkLayout(
      { ...ctx, ...(origin ? { serverOrigin: origin } : {}) },
      docId,
    );
    if (!store.get(session.id)) return;
    store.updateItem(session.id, item.id, 'check', { status: 'done', ...checkItemResult(report) });
  } catch (err) {
    if (!store.get(session.id)) return;
    store.updateItem(session.id, item.id, 'check', {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function parseRespond(raw: unknown): RespondPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.cancel === true) return { cancel: true };
  if (typeof r.allow === 'boolean') return { allow: r.allow };
  if (r.answers && typeof r.answers === 'object') {
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.answers as Record<string, unknown>)) {
      if (typeof v === 'string') answers[k] = v;
    }
    return { answers };
  }
  return null;
}

function parseTurnSettings(raw: Record<string, unknown>): TurnSettings {
  const settings: TurnSettings = {};
  const context = parseContext(raw.context);
  if (context) settings.context = context;
  if (typeof raw.autoApprove === 'boolean') settings.autoApprove = raw.autoApprove;
  if ('model' in raw) settings.model = parseModel(raw.model);
  if ('effort' in raw) settings.effort = isAgentEffort(raw.effort) ? raw.effort : null;
  return settings;
}

const AGENT_BODY_LIMIT = 1024 * 1024;

export function registerAgentRoutes(server: ViteDevServer, ctx: ApiContext): void {
  const providers = createProviders();
  const store = createSessionStore({
    file: path.join(ctx.userCwd, 'node_modules', '.open-doc', 'agent-sessions.json'),
  });
  // Agent output goes over its own stream rather than the HMR socket, which
  // every network client can subscribe to when the server runs with --host.
  const streams = new Set<ServerResponse>();
  const broadcast = (event: AgentStreamEvent) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const stream of streams) stream.write(frame);
  };
  const heartbeat = setInterval(() => {
    for (const stream of streams) stream.write(': ping\n\n');
  }, 25_000);
  heartbeat.unref();

  const runner: AgentRunner = createAgentRunner({
    userCwd: ctx.userCwd,
    writableRoots: [ctx.docsRoot, ctx.globalAssetsRoot],
    promptOptions: () => {
      const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '');
      return { docsDir: ctx.docsDir, ...(origin ? { origin } : {}) };
    },
    store,
    providers,
    onTurnEnd: async (turn) => {
      await renamePlaceholderDoc(server, ctx, store, broadcast, turn);
      await checkAfterTurn(server, ctx, store, providers, turn);
    },
  });

  store.subscribe(broadcast);
  server.httpServer?.on('close', () => {
    clearInterval(heartbeat);
    for (const stream of streams) stream.end();
    runner.stopAll();
    void store.flush();
  });

  const installsInFlight = new Map<string, Promise<void>>();

  server.middlewares.use('/__agent', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';
    const segments = url.pathname.split('/').filter(Boolean);

    // The agent runs commands in the workspace, so only this machine may drive
    // it, even when the dev server listens on the network.
    const enabled = isLoopbackRequest(req);

    try {
      if (method === 'GET' && url.pathname === '/status') {
        res.setHeader('cache-control', 'no-store');
        if (!enabled) return json(res, 200, { enabled: false, packageManager: '', providers: [] });
        const pm = await detectPackageManager(ctx.userCwd);
        return json(res, 200, await agentStatus(ctx.userCwd, providers, pm));
      }

      if (!enabled) return json(res, 404, { error: 'agent panel disabled' });

      if (method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write(': connected\n\n');
        streams.add(res);
        const drop = () => streams.delete(res);
        res.on('close', drop);
        res.on('error', drop);
        return;
      }

      if (method === 'POST' && url.pathname === '/install') {
        const guard = validateMutationRequest(req, { requireJsonBody: true });
        if (!guard.ok) return json(res, guard.status, { error: guard.error });
        const body = (await readBody(req, AGENT_BODY_LIMIT)) as { provider?: unknown };
        if (!isAgentProviderId(body.provider)) return json(res, 400, { error: 'invalid provider' });
        const provider = providers[body.provider];
        const pm = await detectPackageManager(ctx.userCwd);
        const pkg = provider.sdkPackage;
        let install = installsInFlight.get(pkg);
        if (!install) {
          install = installSdk(pm, pkg, ctx.userCwd).finally(() => installsInFlight.delete(pkg));
          installsInFlight.set(pkg, install);
        }
        await install;
        return json(res, 200, { ok: true });
      }

      if (method === 'GET' && url.pathname === '/sessions') {
        res.setHeader('cache-control', 'no-store');
        return json(res, 200, { sessions: store.list() });
      }

      if (method === 'POST' && url.pathname === '/sessions') {
        const guard = validateMutationRequest(req, { requireJsonBody: true });
        if (!guard.ok) return json(res, guard.status, { error: guard.error });
        const body = (await readBody(req, AGENT_BODY_LIMIT)) as {
          provider?: unknown;
          docId?: unknown;
        };
        if (!isAgentProviderId(body.provider)) return json(res, 400, { error: 'invalid provider' });
        const docId =
          typeof body.docId === 'string' && DOC_ID_RE.test(body.docId) ? body.docId : null;
        return json(res, 200, store.create(body.provider, docId));
      }

      if (segments[0] === 'sessions' && segments[1]) {
        const id = segments[1];
        const action = segments[2];
        const session = store.get(id);
        if (!session) return json(res, 404, { error: 'session not found' });

        if (method === 'GET' && !action) {
          res.setHeader('cache-control', 'no-store');
          return json(res, 200, session);
        }

        if (method === 'DELETE' && !action) {
          const guard = validateMutationRequest(req);
          if (!guard.ok) return json(res, guard.status, { error: guard.error });
          runner.stop(id);
          store.remove(id);
          return json(res, 200, { ok: true });
        }

        if (method === 'POST' && action === 'messages') {
          const guard = validateMutationRequest(req, { requireJsonBody: true });
          if (!guard.ok) return json(res, guard.status, { error: guard.error });
          const body = (await readBody(req, AGENT_BODY_LIMIT)) as {
            text?: unknown;
            context?: unknown;
            autoApprove?: unknown;
            model?: unknown;
            effort?: unknown;
            edit?: unknown;
          };
          if (typeof body.text !== 'string' || !body.text.trim()) {
            return json(res, 400, { error: 'missing text' });
          }
          if (runner.isRunning(id)) return json(res, 409, { error: 'session is already running' });
          if (
            body.edit !== undefined &&
            !session.items.some((i) => i.id === body.edit && i.kind === 'user')
          ) {
            return json(res, 400, { error: 'unknown message' });
          }
          await runner.send(id, {
            text: body.text,
            context: parseContext(body.context),
            autoApprove: body.autoApprove === true,
            model: parseModel(body.model),
            effort: isAgentEffort(body.effort) ? body.effort : null,
            edit: typeof body.edit === 'string' ? body.edit : undefined,
          });
          return json(res, 202, { ok: true });
        }

        if (method === 'POST' && action === 'stop') {
          const guard = validateMutationRequest(req);
          if (!guard.ok) return json(res, guard.status, { error: guard.error });
          return json(res, 200, { ok: runner.stop(id) });
        }

        if (method === 'POST' && action === 'respond') {
          const guard = validateMutationRequest(req, { requireJsonBody: true });
          if (!guard.ok) return json(res, guard.status, { error: guard.error });
          const body = (await readBody(req, AGENT_BODY_LIMIT)) as Record<string, unknown>;
          const payload = parseRespond(body);
          if (typeof body.itemId !== 'string' || !payload) {
            return json(res, 400, { error: 'invalid response' });
          }
          const ok = runner.respond(id, body.itemId, payload, parseTurnSettings(body));
          return json(res, ok ? 200 : 409, ok ? { ok } : { error: 'nothing pending' });
        }
      }

      next();
    } catch (err) {
      if (err instanceof BodyTooLargeError) return json(res, 413, { error: err.message });
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}

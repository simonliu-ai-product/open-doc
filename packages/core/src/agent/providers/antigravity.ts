import fs from 'node:fs/promises';
import path from 'node:path';
import { hasConsent } from '../consent.ts';
import { extractQuestionBlock, TEXT_QUESTIONS_INSTRUCTION } from '../prompt.ts';
import {
  type AgentProvider,
  clipDetail,
  isInsideRoots,
  type ProviderEvent,
  type ProviderRunOptions,
} from '../provider.ts';
import {
  collectUploads,
  decideWrites,
  hashBytes,
  readTar,
  SANDBOX_ROOT,
  snapshotRel,
  type UploadPlan,
} from '../sandbox-sync.ts';
import type { AgentModelOption } from '../types.ts';
import {
  ensureEnvironment,
  ensureWorker,
  forgetEnvironment,
  installCli,
  installedCliVersion,
  localModeSupported,
  stopWorker,
} from './antigravity-local.ts';

export const ANTIGRAVITY_AGENT = 'antigravity-preview-09-2026';
export const ANTIGRAVITY_CONSENT_VERSION = '2026-11-14.2';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_ENV = 'GEMINI_API_KEY';
// A cap per turn, so a runaway loop costs cents rather than dollars.
const MAX_TOTAL_TOKENS = 500_000;
const SNAPSHOT_ATTEMPTS = 4;

// Antigravity's own default comes first.
const MODELS: AgentModelOption[] = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', efforts: [] },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', efforts: [] },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', efforts: [] },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', efforts: [] },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', efforts: [] },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', efforts: [] },
];

// USD per million tokens, Standard tier, from the Gemini API price list; a model
// missing here gets no estimate.
const PRICES: Record<string, { from: string; input: number; cached: number; output: number }[]> = {
  'gemini-4-hydrogen': [{ from: '', input: 1.5, cached: 0.075, output: 7.5 }],
  'gemini-4-carbon': [
    { from: '2026-12-01', input: 4, cached: 0.2, output: 20 },
    { from: '', input: 2, cached: 0.1, output: 10 },
  ],
  'gemini-4-argon': [
    { from: '2026-12-01', input: 4, cached: 0.2, output: 20 },
    { from: '', input: 2, cached: 0.1, output: 10 },
  ],
  'gemini-3.8-flash': [
    { from: '2027-01-01', input: 1.5, cached: 0.15, output: 7.5 },
    { from: '', input: 0.75, cached: 0.075, output: 3.75 },
  ],
};

type Usage = {
  total_input_tokens?: number;
  total_cached_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
};

export function estimateCostUsd(model: string | null, usage: Usage | undefined, now = new Date()) {
  const tiers = model ? PRICES[model] : undefined;
  if (!tiers || !usage) return null;
  const day = now.toISOString().slice(0, 10);
  const price = tiers.find((t) => day >= t.from);
  if (!price) return null;
  const input = usage.total_input_tokens ?? 0;
  const cached = Math.min(usage.total_cached_tokens ?? 0, input);
  const output = (usage.total_output_tokens ?? 0) + (usage.total_thought_tokens ?? 0);
  return ((input - cached) * price.input + cached * price.cached + output * price.output) / 1e6;
}

function parseDotenv(source: string, key: string): string | null {
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || match[1] !== key) continue;
    const value = match[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
    return value || null;
  }
  return null;
}

// The key never leaves the dev server: the panel only learns whether one exists.
export async function resolveApiKey(cwd: string): Promise<string | null> {
  const fromEnv = process.env[KEY_ENV]?.trim();
  if (fromEnv) return fromEnv;
  for (const name of ['.env.local', '.env']) {
    const source = await fs.readFile(path.join(cwd, name), 'utf8').catch(() => null);
    const value = source ? parseDotenv(source, KEY_ENV) : null;
    if (value) return value;
  }
  return null;
}

function sandboxInstruction(docRel: string, skipped: string[]): string {
  const lines = [
    `You run in a cloud Linux sandbox, not on the user's machine. A copy of their open-doc workspace is at ${SANDBOX_ROOT}: work there (cd ${SANDBOX_ROOT}) and use paths relative to it.`,
    `The project skills are at ${SANDBOX_ROOT}/.agents/skills/<name>/SKILL.md; read the ones you need from there.`,
    `When your turn ends, only files under ${SANDBOX_ROOT}/${docRel}/ are copied back to the user's machine. Changes anywhere else are lost, so never edit other documents, and never delete files: deletions are not copied back.`,
    'There is no dev server, open-doc CLI or browser here, and none is needed: do not install packages or try to run the project.',
    'In replies, name files by their workspace-relative path as plain text, never as file:// links: the user cannot open sandbox paths.',
  ];
  if (skipped.length > 0) {
    const shown = skipped.slice(0, 20).join(', ');
    lines.push(
      `These files exist on the user's machine but were not uploaded (binary or too large): ${shown}${skipped.length > 20 ? ', …' : ''}. Reference them by path; do not recreate them.`,
    );
  }
  return lines.join(' ');
}

function localInstruction(docRel: string): string {
  return [
    "Your file tools run on the user's own computer, confined to their open-doc project folder, and edits appear in their viewer as you save them.",
    'The shell is disabled: never call execute_bash, it always fails. Commands, package installs and the dev server are unavailable, and none is needed.',
    `Open ${docRel}/index.tsx directly as your first step: do not list folders or search for it. Work only in ${docRel}/, never in other documents or project files such as package.json or open-doc.config.ts.`,
    'For a small change (wording, a translation, a value in a style) edit it straight away; that needs no skill. Read .agents/skills/doc-authoring/SKILL.md (or create-doc, apply-comments) only before adding pages, sections or structures you have not written here before. This overrides the general advice to read the skills before every edit.',
    "view_file shows no line numbers, so never guess a line range: when you call replace_file_content, set StartLine to 1 and EndLine to the file's last line, and let a TargetContent that occurs once in the file pick the spot.",
    'Never list, search or open node_modules, dist or out.',
    'In replies, name files by their project-relative path as plain text, never as file:// links.',
  ].join(' ');
}

type Step = {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  is_error?: boolean;
  result?: unknown;
};

type StreamEvent = {
  event_type?: string;
  index?: number;
  step?: Step;
  delta?: { type?: string; text?: string; arguments?: string };
  interaction?: {
    id?: string;
    status?: string;
    environment_id?: string;
    usage?: Usage;
  };
  interaction_id?: string;
  status?: string;
  error?: { message?: string };
};

const TOOL_TITLES: Record<string, string> = {
  view_file: 'Read',
  list_dir: 'List folder',
  replace_file_content: 'Edit',
  multi_replace_file_content: 'Edit',
  write_to_file: 'Write',
  create_file: 'Write',
  run_command: 'Run command',
  execute_bash: 'Run command',
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  grep_search: 'Search',
  find_by_name: 'Find files',
  search_web: 'Web search',
  read_url_content: 'Read URL',
};

function toolDetail(args: Record<string, unknown> | undefined, roots: string[]): string | null {
  if (!args) return null;
  const value =
    args.TargetFile ??
    args.AbsolutePath ??
    args.DirectoryPath ??
    args.SearchPath ??
    args.SearchDirectory ??
    args.path ??
    args.file_path ??
    args.CommandLine ??
    args.command ??
    args.Query ??
    args.Pattern;
  if (typeof value !== 'string') return null;
  const root = roots.find((r) => value.startsWith(`${r.replace(/[\\/]+$/, '')}/`));
  return clipDetail(root ? value.slice(root.replace(/[\\/]+$/, '').length + 1) : value);
}

const SHELL_TOOL = 'execute_bash';

function isBlockedShell(call: Step, result: Step): boolean {
  if (call.name !== SHELL_TOOL || result.is_error !== true) return false;
  return /disable-bash|is disabled/i.test(JSON.stringify(result.result ?? ''));
}

export function createAntigravityMapper(
  emit: (event: ProviderEvent) => void,
  roots: string[] = [SANDBOX_ROOT],
) {
  const steps = new Map<number, Step>();
  const texts = new Map<number, string>();
  let interactionId: string | null = null;
  let environmentId: string | null = null;
  let status: string | null = null;
  let usage: Usage | undefined;

  const textId = (index: number) => `${interactionId ?? 'agy'}-t${index}`;

  // A call's arguments stream in as deltas after its start, so it is shown
  // once they are complete: at its stop, or at its result if that comes first.
  const calls = new Map<number, { step: Step; args: string }>();
  const startCall = (index: number) => {
    const call = calls.get(index);
    if (!call?.step.id) return;
    calls.delete(index);
    let args = call.step.arguments;
    if (call.args) {
      try {
        args = { ...args, ...(JSON.parse(call.args) as Record<string, unknown>) };
      } catch {}
    }
    const name = call.step.name ?? 'tool';
    emit({
      type: 'tool-start',
      id: call.step.id,
      name,
      title: TOOL_TITLES[name] ?? name,
      detail: toolDetail(args, roots),
    });
  };

  const finishText = (index: number) => {
    const text = texts.get(index);
    if (text === undefined) return;
    texts.delete(index);
    const asked = extractQuestionBlock(text);
    emit({ type: 'text-end', id: textId(index), text: asked ? asked.text : text });
    if (asked) emit({ type: 'questions', questions: asked.questions });
  };

  return {
    get interactionId() {
      return interactionId;
    },
    get environmentId() {
      return environmentId;
    },
    get status() {
      return status;
    },
    get usage() {
      return usage;
    },
    handle(event: StreamEvent): void {
      switch (event.event_type) {
        case 'interaction.created':
        case 'interaction.completed': {
          const it = event.interaction;
          if (it?.id && it.id !== interactionId) {
            interactionId = it.id;
            emit({ type: 'session-id', id: it.id });
          }
          if (it?.environment_id) environmentId = it.environment_id;
          if (it?.status) status = it.status;
          if (it?.usage) usage = it.usage;
          return;
        }
        case 'interaction.status_update':
          if (event.status) status = event.status;
          return;
        case 'step.start': {
          const step = event.step;
          if (event.index === undefined || !step) return;
          steps.set(event.index, step);
          if (step.type === 'function_call' && step.id) {
            calls.set(event.index, { step, args: '' });
          } else if (step.type === 'function_result' && step.call_id) {
            const entry = [...calls].find(([, call]) => call.step.id === step.call_id);
            // Local mode runs with --disable-bash on purpose; a call it turns
            // away is not a failure worth showing.
            if (entry && isBlockedShell(entry[1].step, step)) {
              calls.delete(entry[0]);
              return;
            }
            if (entry) startCall(entry[0]);
            emit({ type: 'tool-end', id: step.call_id, ok: step.is_error !== true });
          } else if (step.type === 'model_output') {
            texts.set(event.index, '');
            emit({ type: 'text-start', id: textId(event.index) });
          }
          return;
        }
        case 'step.delta': {
          if (event.index === undefined) return;
          const call = calls.get(event.index);
          if (call && event.delta?.type === 'arguments_delta') {
            call.args += event.delta.arguments ?? '';
            return;
          }
          if (steps.get(event.index)?.type !== 'model_output') return;
          const text = event.delta?.type === 'text' ? event.delta.text : undefined;
          if (!text) return;
          texts.set(event.index, (texts.get(event.index) ?? '') + text);
          emit({ type: 'text-delta', id: textId(event.index), text });
          return;
        }
        case 'step.stop':
          if (event.index === undefined) return;
          // A shell call waits for its result: it may only be the disabled shell.
          if (calls.get(event.index)?.step.name !== SHELL_TOOL) startCall(event.index);
          finishText(event.index);
          return;
        case 'error':
          emit({ type: 'error', text: event.error?.message ?? 'Antigravity reported an error.' });
          return;
        default:
          return;
      }
    },
    flush(): void {
      for (const index of Array.from(calls.keys())) startCall(index);
      for (const index of Array.from(texts.keys())) finishText(index);
    },
  };
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trimEnd();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) {
        try {
          yield JSON.parse(line.slice(5));
        } catch {}
      }
      newline = buffer.indexOf('\n');
    }
    if (done) return;
  }
}

async function apiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return `Gemini API ${res.status}: ${parsed.error.message}`;
  } catch {}
  return `Gemini API ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`;
}

async function downloadSnapshot(key: string, environmentId: string, signal: AbortSignal) {
  const url = `${API_BASE}/files/environment-${encodeURIComponent(environmentId)}:download?alt=media`;
  let last = '';
  for (let attempt = 0; attempt < SNAPSHOT_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const res = await fetch(url, { headers: { 'x-goog-api-key': key }, signal });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    last = await apiError(res);
  }
  throw new Error(`Could not download the sandbox: ${last}`);
}

async function localHashes(cwd: string, rels: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const rel of rels) {
    const data = await fs.readFile(path.join(cwd, rel)).catch(() => null);
    if (data) out.set(rel, hashBytes(data));
  }
  return out;
}

async function writeBack(
  opts: ProviderRunOptions,
  docRel: string,
  plan: UploadPlan,
  tar: Uint8Array,
  interactionId: string,
) {
  const entries = readTar(tar).flatMap((e) => {
    const rel = snapshotRel(e.path, docRel);
    return rel ? [{ rel, data: e.data }] : [];
  });
  const uploaded = new Map(plan.files.map((f) => [f.rel, f.hash]));
  const local = await localHashes(
    opts.cwd,
    entries.map((e) => e.rel),
  );
  const written: string[] = [];
  const conflicts: string[] = [];
  const conflictDir = path.join(
    opts.cwd,
    'node_modules',
    '.open-doc',
    'antigravity-conflicts',
    interactionId.replace(/[^\w-]/g, '').slice(-24),
  );
  for (const decision of decideWrites(entries, uploaded, local)) {
    const target =
      decision.action === 'write'
        ? path.join(opts.cwd, decision.rel)
        : path.join(conflictDir, decision.rel);
    const root = decision.action === 'write' ? opts.docDir : conflictDir;
    if (!root || !isInsideRoots(opts.cwd, target, [root])) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, decision.data);
    (decision.action === 'write' ? written : conflicts).push(decision.rel);
  }
  return { written, conflicts, conflictDir };
}

class EnvironmentGoneError extends Error {}

async function streamTurn(
  opts: ProviderRunOptions,
  key: string,
  body: Record<string, unknown>,
  roots: string[],
) {
  const mapper = createAntigravityMapper(opts.emit, roots);
  const cancel = () => {
    const id = mapper.interactionId;
    if (!id) return;
    void fetch(`${API_BASE}/interactions/${encodeURIComponent(id)}:cancel`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key },
    }).catch(() => {});
  };
  opts.signal.addEventListener('abort', cancel, { once: true });

  const res = await fetch(`${API_BASE}/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const message = await apiError(res);
    if (typeof body.environment === 'string' && (res.status === 404 || res.status === 403)) {
      throw new EnvironmentGoneError(
        `${message} The local environment was reset; send the message again.`,
      );
    }
    throw new Error(message);
  }
  try {
    for await (const event of sseEvents(res.body)) mapper.handle(event);
  } catch (err) {
    if (opts.signal.aborted) return null;
    throw err;
  } finally {
    mapper.flush();
  }
  if (opts.signal.aborted) return null;
  if (mapper.status === 'failed' || mapper.status === 'cancelled') {
    throw new Error(`The Antigravity turn ${mapper.status}.`);
  }
  if (mapper.status === 'incomplete') {
    opts.emit({
      type: 'error',
      text: `Stopped at the ${MAX_TOTAL_TOKENS.toLocaleString('en-US')}-token budget for one turn. Send "continue" to go on.`,
    });
  }
  return mapper;
}

export function createAntigravityProvider(): AgentProvider {
  return {
    id: 'antigravity',
    name: 'Antigravity',
    sdkPackage: '',
    cliCommand: '',
    askInstruction: TEXT_QUESTIONS_INSTRUCTION,
    canRewind: false,
    canOpenBrowser: false,
    auth: 'api-key',
    preview: true,
    consentVersion: ANTIGRAVITY_CONSENT_VERSION,
    hasKey: async (cwd) => (await resolveApiKey(cwd)) !== null,
    models: async () => MODELS,
    async runtime(cwd) {
      const version = await installedCliVersion(cwd);
      return {
        mode: version ? 'local' : 'cloud',
        localSupported: localModeSupported(),
        localVersion: version,
      };
    },
    async install(cwd) {
      await installCli(cwd);
    },
    dispose: stopWorker,
    async run(opts: ProviderRunOptions): Promise<void> {
      if (!(await hasConsent(opts.cwd, 'antigravity', ANTIGRAVITY_CONSENT_VERSION))) {
        throw new Error('Accept the Antigravity preview terms in the agent panel first.');
      }
      const key = await resolveApiKey(opts.cwd);
      if (!key) throw new Error(`Set ${KEY_ENV} in the environment or .env to use Antigravity.`);
      if (!opts.docDir) {
        throw new Error('Open a document first: Antigravity works on one document at a time.');
      }
      const docRel = path.relative(opts.cwd, opts.docDir).split(path.sep).join('/');
      const turn = Date.now().toString(36);
      const local = (await installedCliVersion(opts.cwd)) !== null;
      const model = opts.model || null;
      const agentConfig = {
        type: 'antigravity',
        max_total_tokens: MAX_TOTAL_TOKENS,
        ...(model ? { model } : {}),
      };

      if (local) {
        const step = `agy-local-${turn}`;
        opts.emit({
          type: 'tool-start',
          id: step,
          name: 'sandbox',
          title: 'Run on this computer',
          detail: docRel,
        });
        let environment: Awaited<ReturnType<typeof ensureEnvironment>>;
        try {
          environment = await ensureEnvironment(opts.cwd, key);
          await ensureWorker(opts.cwd, environment);
          opts.emit({ type: 'tool-end', id: step, ok: true });
        } catch (err) {
          opts.emit({ type: 'tool-end', id: step, ok: false });
          throw err;
        }
        const body = {
          agent: ANTIGRAVITY_AGENT,
          input: opts.prompt,
          system_instruction: `${opts.systemPromptAppend} ${localInstruction(docRel)}`,
          agent_config: agentConfig,
          environment: environment.id,
          ...(opts.resume ? { previous_interaction_id: opts.resume } : {}),
          stream: true,
        };
        let mapper: Awaited<ReturnType<typeof streamTurn>>;
        try {
          mapper = await streamTurn(opts, key, body, [opts.cwd]);
        } catch (err) {
          // A stale environment (deleted, or made under another key) is
          // recreated on the next turn rather than failing every turn.
          if (err instanceof EnvironmentGoneError) await forgetEnvironment(opts.cwd);
          throw err;
        }
        if (opts.signal.aborted || !mapper) return;
        opts.emit({
          type: 'result',
          durationMs: null,
          costUsd: estimateCostUsd(model, mapper.usage),
        });
        return;
      }

      const upload = `agy-upload-${turn}`;
      opts.emit({
        type: 'tool-start',
        id: upload,
        name: 'sandbox',
        title: 'Upload to cloud sandbox',
        detail: docRel,
      });
      const plan = await collectUploads(opts.cwd, [
        opts.docDir,
        path.join(opts.cwd, '.agents', 'skills'),
      ]);
      opts.emit({ type: 'tool-end', id: upload, ok: true });

      const body = {
        agent: ANTIGRAVITY_AGENT,
        input: opts.prompt,
        system_instruction: `${opts.systemPromptAppend} ${sandboxInstruction(docRel, plan.skipped)}`,
        agent_config: agentConfig,
        environment: {
          type: 'remote',
          sources: plan.files.map((f) => ({
            type: 'inline',
            content: f.content,
            target: `${SANDBOX_ROOT}/${f.rel}`,
          })),
        },
        ...(opts.resume ? { previous_interaction_id: opts.resume } : {}),
        stream: true,
      };
      const mapper = await streamTurn(opts, key, body, [SANDBOX_ROOT]);
      if (opts.signal.aborted || !mapper) return;

      const environmentId = mapper.environmentId;
      if (environmentId && mapper.interactionId) {
        const sync = `agy-sync-${turn}`;
        opts.emit({
          type: 'tool-start',
          id: sync,
          name: 'sandbox',
          title: 'Copy changes back',
          detail: docRel,
        });
        try {
          const tar = await downloadSnapshot(key, environmentId, opts.signal);
          const { written, conflicts, conflictDir } = await writeBack(
            opts,
            docRel,
            plan,
            tar,
            mapper.interactionId,
          );
          opts.emit({ type: 'tool-end', id: sync, ok: true });
          if (written.length > 0) {
            opts.emit({
              type: 'tool-start',
              id: `agy-written-${turn}`,
              name: 'file_change',
              title: 'Edit',
              detail: clipDetail(written.join(', ')),
            });
            opts.emit({ type: 'tool-end', id: `agy-written-${turn}`, ok: true });
          }
          if (conflicts.length > 0) {
            opts.emit({
              type: 'error',
              text: `Not copied back, because they changed on this machine during the turn: ${conflicts.join(', ')}. The agent's versions are in ${path.relative(opts.cwd, conflictDir)}.`,
            });
          }
        } catch (err) {
          opts.emit({ type: 'tool-end', id: sync, ok: false });
          throw err;
        }
      }
      opts.emit({
        type: 'result',
        durationMs: null,
        costUsd: estimateCostUsd(model, mapper.usage),
      });
    },
  };
}

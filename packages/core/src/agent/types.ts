// Anthropic does not allow a third-party product to run on a reader's claude.ai
// login, so Claude Code is not offered here. Antigravity runs on the user's own
// Gemini API key, never their Antigravity sign-in, for the same reason. A new
// agent is one more id.
export const AGENT_PROVIDER_IDS = ['codex', 'antigravity'] as const;

export type AgentProviderId = (typeof AGENT_PROVIDER_IDS)[number];

export const AGENT_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type AgentEffort = (typeof AGENT_EFFORTS)[number];

export function isAgentProviderId(value: unknown): value is AgentProviderId {
  return typeof value === 'string' && (AGENT_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isAgentEffort(value: unknown): value is AgentEffort {
  return typeof value === 'string' && (AGENT_EFFORTS as readonly string[]).includes(value);
}

export type AgentModelOption = {
  // Empty when the option stands for the CLI's own default model.
  id: string;
  label: string;
  efforts: AgentEffort[];
};

export type AgentProviderStatus = {
  id: AgentProviderId;
  name: string;
  sdkPackage: string;
  sdkVersion: string | null;
  cliCommand: string;
  cliFound: boolean;
  cliVersion: string | null;
  ready: boolean;
  models: AgentModelOption[];
  // 'sdk' agents connect by installing their SDK beside a signed-in CLI;
  // 'api-key' agents need a key in the environment and nothing installed.
  auth: AgentProviderAuth;
  preview: boolean;
  keyFound: boolean | null;
  // Terms the user accepts before the panel may run this agent.
  consent: { version: string; accepted: boolean } | null;
  runtime: AgentRuntime | null;
};

export type AgentProviderAuth = 'sdk' | 'api-key';

export type AgentRuntime = {
  mode: 'local' | 'cloud';
  localSupported: boolean;
  localVersion: string | null;
};

export type AgentStatus = {
  enabled: boolean;
  packageManager: string;
  providers: AgentProviderStatus[];
};

type AgentQuestionOption = { label: string; description?: string };

export type AgentQuestion = {
  header: string;
  question: string;
  options: AgentQuestionOption[];
  multiSelect: boolean;
};

export type AgentItem =
  | {
      kind: 'user';
      id: string;
      ts: string;
      text: string;
      // The provider history point just before this message, so editing it
      // can rewind the agent's conversation there.
      resumeAt?: string;
      newDoc?: boolean;
    }
  | { kind: 'assistant'; id: string; ts: string; text: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      ts: string;
      name: string;
      title: string;
      detail: string | null;
      status: 'running' | 'done' | 'error';
    }
  | {
      kind: 'question';
      id: string;
      ts: string;
      questions: AgentQuestion[];
      answers: Record<string, string> | null;
      status: 'pending' | 'answered' | 'cancelled';
    }
  | {
      kind: 'permission';
      id: string;
      ts: string;
      tool: string;
      title: string;
      detail: string | null;
      status: 'pending' | 'allowed' | 'denied';
    }
  | { kind: 'error'; id: string; ts: string; text: string }
  // `open-doc check`, run by the dev server after a turn whose agent cannot
  // start a browser itself.
  | {
      kind: 'check';
      id: string;
      ts: string;
      docId: string;
      status: 'running' | 'done' | 'failed';
      pageCount: number | null;
      // The first few findings; `total` counts them all.
      findings: AgentCheckFinding[];
      total: number;
      error: string | null;
    }
  | {
      kind: 'result';
      id: string;
      ts: string;
      durationMs: number | null;
      costUsd: number | null;
      aborted: boolean;
    };

export type AgentCheckFinding = {
  page: number;
  severity: 'error' | 'warn';
  message: string;
  loc?: string;
};

type AgentSessionStatus = 'idle' | 'running';

export type AgentSessionSummary = {
  id: string;
  provider: AgentProviderId;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: AgentSessionStatus;
  docId: string | null;
};

export type AgentSession = AgentSessionSummary & {
  providerSessionId: string | null;
  providerCheckpoint?: string | null;
  // Set once the oldest items were dropped to stay under the item cap.
  trimmed?: boolean;
  items: AgentItem[];
};

export type AgentTurnContext = {
  docId?: string;
  docTitle?: string;
  pageNumber?: number;
  totalPages?: number;
  pendingComments?: number;
  selection?: { line: number; column: number; tagName: string; text: string } | null;
  newDoc?: boolean;
};

export type RespondPayload =
  | { answers: Record<string, string> }
  | { allow: boolean }
  | { cancel: true };

export type AgentStreamEvent =
  | { type: 'session'; session: AgentSessionSummary }
  | { type: 'session-removed'; sessionId: string }
  | { type: 'item'; sessionId: string; item: AgentItem }
  | { type: 'delta'; sessionId: string; itemId: string; text: string }
  | { type: 'truncate'; sessionId: string; itemId: string }
  | { type: 'doc-renamed'; from: string; to: string };

export function sessionSummary(session: AgentSession): AgentSessionSummary {
  const {
    providerSessionId: _p,
    providerCheckpoint: _c,
    trimmed: _t,
    items: _i,
    ...summary
  } = session;
  return summary;
}

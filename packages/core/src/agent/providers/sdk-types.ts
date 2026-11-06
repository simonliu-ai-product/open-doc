// Hand-written slices of the agent SDK's public types. The packages are
// resolved from the user's workspace at runtime and never installed here, so
// these cover only the fields the adapters read.

import type { AgentEffort } from '../types.ts';

type CodexOptions = { codexPathOverride?: string };

type CodexThreadOptions = {
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  model?: string;
  modelReasoningEffort?: AgentEffort;
};

export type CodexItem =
  | { type: 'agent_message'; id: string; text: string }
  | { type: 'reasoning'; id: string; text: string }
  | {
      type: 'command_execution';
      id: string;
      command: string;
      aggregated_output?: string;
      exit_code?: number;
      status: 'in_progress' | 'completed' | 'failed';
    }
  | {
      type: 'file_change';
      id: string;
      changes: { path: string; kind: 'add' | 'delete' | 'update' }[];
      status: 'completed' | 'failed';
    }
  | {
      type: 'mcp_tool_call';
      id: string;
      server: string;
      tool: string;
      status: 'in_progress' | 'completed' | 'failed';
    }
  | { type: 'web_search'; id: string; query: string }
  | { type: 'todo_list'; id: string; items: { text: string; completed: boolean }[] }
  | { type: 'error'; id: string; message: string };

export type CodexThreadEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage: unknown }
  | { type: 'turn.failed'; error: { message: string } }
  | { type: 'item.started'; item: CodexItem }
  | { type: 'item.updated'; item: CodexItem }
  | { type: 'item.completed'; item: CodexItem }
  | { type: 'error'; message: string };

type CodexThread = {
  id: string | null;
  runStreamed: (
    input: string,
    turnOptions?: { signal?: AbortSignal },
  ) => Promise<{ events: AsyncIterable<CodexThreadEvent> }>;
};

export type CodexSdkModule = {
  Codex: new (
    options?: CodexOptions,
  ) => {
    startThread: (options?: CodexThreadOptions) => CodexThread;
    resumeThread: (id: string, options?: CodexThreadOptions) => CodexThread;
  };
};

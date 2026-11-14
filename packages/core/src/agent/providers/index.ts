import type { AgentProvider } from '../provider.ts';
import type { AgentProviderId } from '../types.ts';
import { createAntigravityProvider } from './antigravity.ts';
import { createCodexProvider } from './codex.ts';

export function createProviders(): Record<AgentProviderId, AgentProvider> {
  return { codex: createCodexProvider(), antigravity: createAntigravityProvider() };
}

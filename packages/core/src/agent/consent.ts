import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentProviderId } from './types.ts';

type ConsentRecord = { version: string; acceptedAt: string };
type ConsentFile = Partial<Record<AgentProviderId, ConsentRecord>>;

export function consentFile(userCwd: string): string {
  return path.join(userCwd, 'node_modules', '.open-doc', 'agent-consent.json');
}

async function readAll(userCwd: string): Promise<ConsentFile> {
  try {
    const raw = JSON.parse(await fs.readFile(consentFile(userCwd), 'utf8'));
    return raw && typeof raw === 'object' ? (raw as ConsentFile) : {};
  } catch {
    return {};
  }
}

// Acceptance is kept by the dev server, not the browser, so the provider can
// refuse a turn itself rather than trusting the panel to have asked.
export async function hasConsent(
  userCwd: string,
  provider: AgentProviderId,
  version: string,
): Promise<boolean> {
  return (await readAll(userCwd))[provider]?.version === version;
}

export async function setConsent(
  userCwd: string,
  provider: AgentProviderId,
  version: string | null,
): Promise<void> {
  const all = await readAll(userCwd);
  if (version) all[provider] = { version, acceptedAt: new Date().toISOString() };
  else delete all[provider];
  const file = consentFile(userCwd);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(all, null, 2)}\n`);
}

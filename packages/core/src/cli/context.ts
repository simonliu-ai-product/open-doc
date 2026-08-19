import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUserConfig } from '../vite/open-doc-plugin.ts';
import { type ApiContext, makeContext } from '../vite/routes/context.ts';

async function coreVersion(): Promise<string> {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = await readFile(path.resolve(here, '..', '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** The same context the dev API and the MCP server run on, for commands that call `ops/`. */
export async function cliContext(userCwd = process.cwd()): Promise<ApiContext> {
  const config = await loadUserConfig(userCwd);
  return makeContext({
    userCwd,
    docsDir: config.docsDir ?? 'docs',
    assetsDir: config.assetsDir ?? 'assets',
    coreVersion: await coreVersion(),
  });
}

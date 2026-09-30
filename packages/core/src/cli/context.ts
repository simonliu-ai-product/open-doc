import { loadUserConfig } from '../vite/open-doc-plugin.ts';
import { type ApiContext, makeContext } from '../vite/routes/context.ts';
import { readCoreVersion } from './package-version.ts';

/** The same context the dev API and the MCP server run on, for commands that call `ops/`. */
export async function cliContext(userCwd = process.cwd()): Promise<ApiContext> {
  const config = await loadUserConfig(userCwd);
  return makeContext({
    userCwd,
    docsDir: config.docsDir ?? 'docs',
    assetsDir: config.assetsDir ?? 'assets',
    coreVersion: await readCoreVersion(),
  });
}

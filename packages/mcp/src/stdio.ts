#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { makeContext, OpsError } from '@open-document/core/ops';
import { registerTools } from './tools.ts';
import { findWorkspace, workspaceFromRoots } from './workspace.ts';

/**
 * `open-doc-mcp` — the same tools as `open-doc dev --mcp`, over stdio, for
 * clients that launch their MCP servers themselves (Antigravity plugins,
 * Claude Code, Gemini CLI). The workspace is the first of: `--cwd` /
 * `OPEN_DOC_CWD`, the roots the client reports, the launch directory or one
 * of its parents. Until one is found every tool refuses, so nothing is ever
 * written into a folder that is not an open-doc workspace.
 */

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const { values } = parseArgs({
  options: {
    cwd: { type: 'string' },
    'server-origin': { type: 'string' },
  },
  strict: false,
});
const explicit = (values.cwd as string | undefined) ?? process.env.OPEN_DOC_CWD;
const serverOrigin =
  (values['server-origin'] as string | undefined) ?? process.env.OPEN_DOC_SERVER_ORIGIN;

const contextFor = (userCwd: string) =>
  makeContext({
    userCwd,
    coreVersion: version,
    ...(serverOrigin ? { serverOrigin } : {}),
  });

// Tools close over this object, so settling the workspace later is a mutation.
const ctx = contextFor(process.cwd());
let settled = false;

const server = new McpServer({ name: 'open-doc', version, title: 'open-doc' });

async function resolveWorkspace(): Promise<string | null> {
  if (explicit) {
    const dir = path.resolve(explicit);
    return existsSync(dir) ? dir : null;
  }
  if (server.server.getClientCapabilities()?.roots) {
    try {
      const { roots } = await server.server.listRoots();
      const found = workspaceFromRoots(roots.map((r) => r.uri));
      if (found) return found;
    } catch {
      // A client that advertises roots but fails the request falls through.
    }
  }
  return findWorkspace(process.cwd());
}

async function ensureWorkspace(): Promise<void> {
  if (settled) return;
  const dir = await resolveWorkspace();
  if (!dir) {
    throw new OpsError(
      412,
      'No open-doc workspace found. Open the folder that holds docs/ and open-doc.config.ts, ' +
        'or create one with `npx @open-document/cli init my-docs`.',
    );
  }
  Object.assign(ctx, contextFor(dir));
  settled = true;
  console.error(`open-doc-mcp: workspace ${dir}`);
}

registerTools(server, ctx, undefined, ensureWorkspace);

// Re-resolve on the next call when the client's folders change.
server.server.setNotificationHandler('notifications/roots/list_changed', () => {
  if (!explicit) settled = false;
});

await server.connect(new StdioServerTransport());

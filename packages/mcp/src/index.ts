import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { type ApiContext, makeContext } from '@open-document/core/ops';
import { registerTools } from './tools.ts';

export type OpenDocMcpOptions = {
  /** The workspace root — the directory holding `docs/`. */
  userCwd: string;
  docsDir?: string;
  assetsDir?: string;
  version?: string;
  /**
   * Origin of the dev server serving this workspace. The rendering tools reuse
   * it instead of booting a private Vite server per call.
   */
  serverOrigin?: string;
  /**
   * Extra hostnames allowed in Host/Origin headers. Loopback is always allowed;
   * add to this only when the endpoint is deliberately exposed.
   */
  allowedHosts?: string[];
};

function contextFor(opts: OpenDocMcpOptions): ApiContext {
  return makeContext({
    userCwd: opts.userCwd,
    docsDir: opts.docsDir,
    assetsDir: opts.assetsDir,
    coreVersion: opts.version ?? '0.0.0',
    ...(opts.serverOrigin !== undefined ? { serverOrigin: opts.serverOrigin } : {}),
  });
}

/**
 * A fresh server per request. The tools only touch disk, so there is no state
 * worth carrying between calls — which is exactly the stateless shape the
 * 2026-07-28 revision expects, and what lets any client connect without a
 * session handshake.
 */
export function createOpenDocMcpServer(opts: OpenDocMcpOptions): McpServer {
  const server = new McpServer({
    name: 'open-doc',
    version: opts.version ?? '0.0.0',
    title: 'open-doc',
  });
  registerTools(server, contextFor(opts));
  return server;
}

export function createOpenDocMcpHandler(opts: OpenDocMcpOptions) {
  const allowedHostnames = [...localhostAllowedHostnames(), ...(opts.allowedHosts ?? [])];
  const allowedOrigins = [...localhostAllowedOrigins(), ...(opts.allowedHosts ?? [])];
  const handler = createMcpHandler(() => createOpenDocMcpServer(opts));

  return {
    ...handler,
    /**
     * These tools write to the user's disk, so a page in the browser must not be
     * able to drive them. Rejecting unexpected Host and Origin headers is what
     * closes the DNS-rebinding path onto a loopback endpoint.
     */
    fetch: async (request: Request): Promise<Response> => {
      const hostRejection = hostHeaderValidationResponse(request, allowedHostnames);
      if (hostRejection) return hostRejection;
      const originRejection = originValidationResponse(request, allowedOrigins);
      if (originRejection) return originRejection;
      return handler.fetch(request);
    },
  };
}

/** Connect/Express-style middleware, for mounting on the dev server. */
export function createOpenDocMcpMiddleware(opts: OpenDocMcpOptions) {
  return toNodeHandler(createOpenDocMcpHandler(opts));
}

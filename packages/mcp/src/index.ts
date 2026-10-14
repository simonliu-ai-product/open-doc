import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
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
import { type FileChangeTap, registerTools } from './tools.ts';

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
   * Extra hostnames allowed in Host/Origin headers, or `true` to allow any
   * host (e.g. behind Cloud Run's proxy). Loopback is always allowed.
   */
  allowedHosts?: string[] | true;
  /**
   * Optional Bearer token required in the `Authorization` header. Defaults to
   * `process.env.OPEN_DOC_MCP_TOKEN` when set.
   */
  authToken?: string;
  /**
   * Optional callback invoked whenever an MCP tool mutates a file on disk.
   */
  onFileChange?: FileChangeTap;
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

function verifyBearerToken(header: string | null, expectedToken: string): boolean {
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const actual = Buffer.from(match[1].trim(), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
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
  registerTools(server, contextFor(opts), opts.onFileChange);
  return server;
}

export function createOpenDocMcpHandler(opts: OpenDocMcpOptions) {
  const allowAllHosts =
    opts.allowedHosts === true ||
    process.env.OPEN_DOC_CLOUD === '1' ||
    Boolean(process.env.K_SERVICE);
  const extraHosts = Array.isArray(opts.allowedHosts) ? opts.allowedHosts : [];
  const allowedHostnames = [...localhostAllowedHostnames(), ...extraHosts];
  const allowedOrigins = [...localhostAllowedOrigins(), ...extraHosts];
  const handler = createMcpHandler(() => createOpenDocMcpServer(opts));

  return {
    ...handler,
    /**
     * These tools write to the user's disk, so a page in the browser must not be
     * able to drive them. Rejecting unexpected Host and Origin headers is what
     * closes the DNS-rebinding path onto a loopback endpoint; on cloud endpoints,
     * an optional Bearer token protects mutation access.
     */
    fetch: async (request: Request): Promise<Response> => {
      const requiredToken = (opts.authToken ?? process.env.OPEN_DOC_MCP_TOKEN ?? '').trim();
      if (requiredToken !== '') {
        const authHeader = request.headers.get('authorization');
        if (!verifyBearerToken(authHeader, requiredToken)) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: valid Bearer token required' }),
            {
              status: 401,
              headers: {
                'content-type': 'application/json',
                'www-authenticate': 'Bearer realm="open-doc-mcp"',
              },
            },
          );
        }
      }

      if (!allowAllHosts) {
        const hostRejection = hostHeaderValidationResponse(request, allowedHostnames);
        if (hostRejection) return hostRejection;
        const originRejection = originValidationResponse(request, allowedOrigins);
        if (originRejection) return originRejection;
      }
      return handler.fetch(request);
    },
  };
}

/** Connect/Express-style middleware, for mounting on the dev server. */
export function createOpenDocMcpMiddleware(opts: OpenDocMcpOptions) {
  return toNodeHandler(createOpenDocMcpHandler(opts));
}

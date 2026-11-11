import type { Connect } from 'vite';

type MutationRequestValidationResult = { ok: true } | { ok: false; status: number; error: string };

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function headerValue(req: Connect.IncomingMessage, name: string): string | null {
  return firstHeaderValue(req.headers[name.toLowerCase()])?.trim() ?? null;
}

function firstCommaToken(value: string | null): string | null {
  if (!value) return null;
  const [first] = value.split(',', 1);
  return first?.trim() || null;
}

/**
 * `null` when nothing says which scheme the browser used: a plain socket with no
 * `x-forwarded-proto`. Cloud Shell's Web Preview terminates TLS and forwards the
 * host without the proto, so the page is https while the socket is http.
 */
function requestProto(req: Connect.IncomingMessage): 'http' | 'https' | null {
  const forwarded = firstCommaToken(headerValue(req, 'x-forwarded-proto'))?.toLowerCase();
  if (forwarded === 'http' || forwarded === 'https') return forwarded;
  return 'encrypted' in req.socket && req.socket.encrypted ? 'https' : null;
}

function parsedOrigin(origin: string): { scheme: string; host: string } | null {
  try {
    const url = new URL(origin);
    return { scheme: url.protocol.slice(0, -1).toLowerCase(), host: url.host.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * The dev server writes to the user's filesystem, so every mutating endpoint is
 * guarded against a page on another origin driving it through the browser.
 */
export function validateMutationRequest(
  req: Connect.IncomingMessage,
  opts: { requireJsonBody?: boolean } = {},
): MutationRequestValidationResult {
  if (opts.requireJsonBody) {
    const contentType = headerValue(req, 'content-type')?.toLowerCase();
    if (!contentType?.startsWith('application/json')) {
      return { ok: false, status: 415, error: 'content-type must be application/json' };
    }
  }

  const fetchSite = firstCommaToken(headerValue(req, 'sec-fetch-site'))?.toLowerCase();
  if (fetchSite === 'cross-site') {
    return { ok: false, status: 403, error: 'cross-site request blocked' };
  }

  const originRaw = headerValue(req, 'origin');
  if (!originRaw) return { ok: true };
  if (originRaw.toLowerCase() === 'null') {
    return { ok: false, status: 403, error: 'opaque origin is not allowed' };
  }

  const actual = parsedOrigin(originRaw);
  if (!actual) return { ok: false, status: 403, error: 'invalid origin header' };

  const host = firstCommaToken(headerValue(req, 'x-forwarded-host')) ?? headerValue(req, 'host');
  if (!host) return { ok: false, status: 400, error: 'missing host header' };

  // One host:port serves one scheme, so when the scheme is unknown the host
  // alone still pins the request to this server.
  const proto = requestProto(req);
  const schemeOk = proto
    ? actual.scheme === proto
    : actual.scheme === 'http' || actual.scheme === 'https';
  if (!schemeOk || actual.host !== host.toLowerCase()) {
    return { ok: false, status: 403, error: 'origin mismatch' };
  }

  return { ok: true };
}

/** The agent runs commands in the workspace, so only this machine may drive it. */
export function isLoopbackRequest(req: Connect.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

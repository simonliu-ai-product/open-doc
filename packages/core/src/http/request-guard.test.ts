import type { Connect } from 'vite';
import { describe, expect, it } from 'vitest';
import { validateMutationRequest } from './request-guard';

function request(headers: Record<string, string>, encrypted = false): Connect.IncomingMessage {
  return {
    headers,
    socket: encrypted ? { encrypted: true } : {},
  } as unknown as Connect.IncomingMessage;
}

describe('validateMutationRequest', () => {
  it('accepts a same-origin request on a plain local server', () => {
    const req = request({ host: 'localhost:5273', origin: 'http://localhost:5273' });
    expect(validateMutationRequest(req)).toEqual({ ok: true });
  });

  it('accepts a request with no origin header', () => {
    expect(validateMutationRequest(request({ host: 'localhost:5273' }))).toEqual({ ok: true });
  });

  it('accepts an https page behind a proxy that forwards the host but not the proto', () => {
    const host = '5273-cs-1-default.cs-asia-east1-duck.cloudshell.dev';
    const req = request({
      host: '127.0.0.1:5273',
      'x-forwarded-host': host,
      origin: `https://${host}`,
    });
    expect(validateMutationRequest(req)).toEqual({ ok: true });
  });

  it('rejects another host behind the same proxy', () => {
    const req = request({
      host: '127.0.0.1:5273',
      'x-forwarded-host': '5273-cs-1-default.cloudshell.dev',
      origin: 'https://evil.example',
    });
    expect(validateMutationRequest(req)).toMatchObject({ ok: false, error: 'origin mismatch' });
  });

  it('rejects another port on the same host', () => {
    const req = request({ host: 'localhost:5273', origin: 'http://localhost:5274' });
    expect(validateMutationRequest(req)).toMatchObject({ ok: false, error: 'origin mismatch' });
  });

  it('holds the scheme to x-forwarded-proto when the proxy sends it', () => {
    const req = request({
      host: '127.0.0.1:5273',
      'x-forwarded-host': 'docs.example',
      'x-forwarded-proto': 'https',
      origin: 'http://docs.example',
    });
    expect(validateMutationRequest(req)).toMatchObject({ ok: false, error: 'origin mismatch' });
  });

  it('holds the scheme to https on an encrypted socket', () => {
    const req = request({ host: 'localhost:5273', origin: 'http://localhost:5273' }, true);
    expect(validateMutationRequest(req)).toMatchObject({ ok: false, error: 'origin mismatch' });
  });

  it('rejects a non-web scheme even when the scheme is unknown', () => {
    const req = request({ host: 'localhost:5273', origin: 'chrome-extension://localhost:5273' });
    expect(validateMutationRequest(req)).toMatchObject({ ok: false, error: 'origin mismatch' });
  });

  it('rejects cross-site and opaque origins', () => {
    expect(
      validateMutationRequest(request({ host: 'localhost:5273', 'sec-fetch-site': 'cross-site' })),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      validateMutationRequest(request({ host: 'localhost:5273', origin: 'null' })),
    ).toMatchObject({
      ok: false,
      error: 'opaque origin is not allowed',
    });
  });
});

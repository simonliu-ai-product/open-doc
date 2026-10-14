import { createHash } from 'node:crypto';
import path from 'node:path';
import { OpsError } from './documents.ts';

/**
 * Deterministic 16-char SHA-256 hex digest of a document's UTF-8 source.
 * Used as a lightweight optimistic concurrency token (`hash` / `expectedHash`)
 * so clients and MCP agents do not need to re-send the full source string.
 */
export function hashSource(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Verifies that `current` on disk still matches what the caller last read,
 * either via full-source comparison (`expected`) or SHA-256 digest (`expectedHash`).
 */
export function assertExpectedSource(
  current: string,
  opts?: { expected?: string; expectedHash?: string },
): void {
  if (opts?.expected !== undefined && current !== opts.expected) {
    throw new OpsError(409, 'document changed on disk since it was read');
  }
  if (opts?.expectedHash !== undefined && hashSource(current) !== opts.expectedHash) {
    throw new OpsError(409, 'document changed on disk since it was read (hash mismatch)');
  }
}

const fileQueues = new Map<string, Promise<unknown>>();

/**
 * Serializes async read-modify-write operations on the same file path in FIFO order.
 * Prevents concurrent edits (e.g. over high-latency GCS FUSE mounts or parallel
 * MCP tool calls) from reading the same stale snapshot and overwriting each other.
 */
export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const prev = fileQueues.get(key) ?? Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  fileQueues.set(key, tail);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (fileQueues.get(key) === tail) {
      fileQueues.delete(key);
    }
  }
}

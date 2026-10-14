import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeContext } from '../vite/routes/context.ts';
import { hashSource, withFileLock } from './concurrency.ts';
import {
  createDocument,
  OpsError,
  readDocument,
  renameDocument,
  writeDocument,
} from './documents.ts';
import { addComment, readText, writeText } from './text.ts';

const SAMPLE_DOC = `import { Page } from '@open-document/core';

export const meta = {
  title: 'Original Title',
};

export default function Doc() {
  return (
    <Page>
      <h1>First Heading</h1>
      <p>Second Paragraph</p>
    </Page>
  );
}
`;

describe('concurrency & optimistic locking', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-doc-concurrency-'));
    await fs.mkdir(path.join(tmpDir, 'docs'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns deterministic 16-char SHA-256 hash from readDocument and readText', async () => {
    const ctx = makeContext({ userCwd: tmpDir, docsDir: 'docs', coreVersion: '0.13.1' });
    const created = await createDocument(ctx, 'demo', SAMPLE_DOC);
    expect(created.hash).toBe(hashSource(SAMPLE_DOC));
    expect(created.hash).toHaveLength(16);

    const doc = await readDocument(ctx, 'demo');
    expect(doc.hash).toBe(created.hash);

    const textTarget = (await readText(ctx, 'demo', [{ line: 10, column: 6 }])) as {
      hash: string;
    };
    expect(textTarget.hash).toBe(created.hash);
  });

  it('enforces expectedHash optimistic locking on writeDocument and writeText', async () => {
    const ctx = makeContext({ userCwd: tmpDir, docsDir: 'docs', coreVersion: '0.13.1' });
    const { hash: initialHash } = await createDocument(ctx, 'demo', SAMPLE_DOC);

    // First write with matching expectedHash succeeds and returns new hash
    const write1 = await writeText(ctx, 'demo', { line: 10, column: 6 }, 'Updated Heading', {
      expectedHash: initialHash,
    });
    expect(write1.ok).toBe(true);
    expect(write1.hash).not.toBe(initialHash);

    // Second write using the stale initialHash is refused with 409 Conflict
    await expect(
      writeText(ctx, 'demo', { line: 11, column: 6 }, 'Stale Edit', {
        expectedHash: initialHash,
      }),
    ).rejects.toThrowError(OpsError);

    await expect(
      writeDocument(ctx, 'demo', SAMPLE_DOC, undefined, initialHash),
    ).rejects.toMatchObject({ status: 409 });

    // Using the updated hash succeeds
    const write2 = await writeText(ctx, 'demo', { line: 11, column: 6 }, 'Fresh Second Paragraph', {
      expectedHash: write1.hash,
    });
    expect(write2.ok).toBe(true);
  });

  it('serializes concurrent edits on the same file via withFileLock without clobbering', async () => {
    const ctx = makeContext({ userCwd: tmpDir, docsDir: 'docs', coreVersion: '0.13.1' });
    await createDocument(ctx, 'demo', SAMPLE_DOC);

    // Fire three concurrent mutations on the same document simultaneously
    // (simulating two people + an MCP agent editing at the same moment on GCS FUSE)
    await Promise.all([
      writeText(ctx, 'demo', { line: 10, column: 6 }, 'Concurrent Heading'),
      writeText(ctx, 'demo', { line: 11, column: 6 }, 'Concurrent Paragraph'),
      renameDocument(ctx, 'demo', 'Concurrent Title'),
      addComment(ctx, 'demo', { line: 11, column: 6 }, 'Concurrent review note'),
    ]);

    const finalDoc = await readDocument(ctx, 'demo');
    expect(finalDoc.source).toContain("title: 'Concurrent Title'");
    expect(finalDoc.source).toContain('<h1>Concurrent Heading</h1>');
    expect(finalDoc.source).toContain('Concurrent Paragraph</p>');
    expect(finalDoc.source).toContain('@doc-comment');
  });

  it('queues slow async operations in strict FIFO order per file', async () => {
    const file = path.join(tmpDir, 'docs', 'fifo.tsx');
    const order: number[] = [];

    await Promise.all([
      withFileLock(file, async () => {
        await new Promise((r) => setTimeout(r, 40));
        order.push(1);
      }),
      withFileLock(file, async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(2);
      }),
      withFileLock(file, async () => {
        order.push(3);
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});

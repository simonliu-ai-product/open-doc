import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findWorkspace, isWorkspace, workspaceFromRoots } from './workspace.ts';

function tree() {
  const root = mkdtempSync(path.join(tmpdir(), 'od-ws-'));
  const ws = path.join(root, 'my-docs');
  mkdirSync(path.join(ws, 'docs', 'report'), { recursive: true });
  writeFileSync(
    path.join(ws, 'package.json'),
    JSON.stringify({ devDependencies: { '@open-document/core': '^0.15.0' } }),
  );
  const other = path.join(root, 'other');
  mkdirSync(other);
  writeFileSync(
    path.join(other, 'package.json'),
    JSON.stringify({ dependencies: { react: '18' } }),
  );
  return { root, ws, other };
}

describe('workspace resolution', () => {
  it('recognises a workspace by its core dependency or its config file', () => {
    const { ws, other } = tree();
    expect(isWorkspace(ws)).toBe(true);
    expect(isWorkspace(other)).toBe(false);
    writeFileSync(path.join(other, 'open-doc.config.ts'), 'export default {};');
    expect(isWorkspace(other)).toBe(true);
  });

  it('walks up from a folder inside the workspace', () => {
    const { ws, other } = tree();
    expect(findWorkspace(path.join(ws, 'docs', 'report'))).toBe(ws);
    expect(findWorkspace(other)).toBeNull();
  });

  it('takes the first file root that is or sits in a workspace', () => {
    const { ws, other } = tree();
    const uris = [
      'https://example.com/',
      pathToFileURL(other).href,
      pathToFileURL(path.join(ws, 'docs')).href,
    ];
    expect(workspaceFromRoots(uris)).toBe(ws);
    expect(workspaceFromRoots([pathToFileURL(other).href])).toBeNull();
  });
});

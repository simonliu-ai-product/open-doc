import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildGcloudDeployArgs,
  type CommandRunner,
  defaultBucketName,
  detectPackageManager,
  formatAntigravityMcpSnippet,
  generateDockerfile,
  generateEntrypointScript,
  inferDefaultServiceName,
  inspectGcpEnvironment,
  readCloudState,
  resolveGcpDeployOptions,
  runGcpDown,
  runGcpStart,
  runGcpStop,
  runGcpUp,
  sanitizeKebab,
} from './deploy-gcp.ts';

describe('deploy-gcp helpers', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'open-doc-deploy-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('sanitizes service and bucket names into valid kebab-case identifiers', () => {
    expect(sanitizeKebab('@open-document/Sample_App!!')).toBe('sample-app');
    expect(defaultBucketName('gemma-4-practice', 'open-doc-sample')).toBe(
      'gemma-4-practice-open-doc-sample-data',
    );
  });

  it('detects package manager and default service name from package.json', () => {
    writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@my-org/quarterly-reports',
        packageManager: 'pnpm@10.0.0',
      }),
      'utf8',
    );
    expect(detectPackageManager(tempDir)).toBe('pnpm');
    expect(inferDefaultServiceName(tempDir)).toBe('quarterly-reports');
  });

  it('generates editable Dockerfile and entrypoint with GCS symlinks, node_modules link, and git init', () => {
    const dockerfile = generateDockerfile({
      packageManager: 'pnpm',
      docsDir: 'docs',
      assetsDir: 'assets',
      themesDir: 'themes',
      mode: 'editable',
    });
    expect(dockerfile).toContain('FROM node:22-slim');
    expect(dockerfile).toContain('apt-get install -y --no-install-recommends git');
    expect(dockerfile).toContain('ENV OPEN_DOC_CLOUD=1');

    const entrypoint = generateEntrypointScript({
      docsDir: 'docs',
      assetsDir: 'assets',
      themesDir: 'themes',
      mode: 'editable',
    });
    expect(entrypoint).toContain('ln -s /app/node_modules "$MOUNT_DIR/node_modules"');
    expect(entrypoint).toContain('git -C "$MOUNT_DIR" init -q');
    expect(entrypoint).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable expansion
      'exec npx open-doc dev --host 0.0.0.0 --port "${PORT:-8080}" --no-skills-check --mcp',
    );
  });

  it('builds gcloud run deploy arguments for editable mode with GCS volume mount', () => {
    const args = buildGcloudDeployArgs({
      userCwd: tempDir,
      docsDir: 'docs',
      assetsDir: 'assets',
      themesDir: 'themes',
      project: 'gemma-4-practice',
      region: 'asia-east1',
      service: 'open-doc-sample',
      bucket: 'gemma-4-practice-open-doc-sample-data',
      mode: 'editable',
      memory: '1Gi',
      mcpToken: 'od_mcp_test123',
      packageManager: 'pnpm',
    });

    expect(args).toContain('--execution-environment');
    expect(args).toContain('gen2');
    expect(args).toContain('--max-instances');
    expect(args).toContain('1');
    expect(args).toContain(
      'name=open-doc-storage,type=cloud-storage,bucket=gemma-4-practice-open-doc-sample-data',
    );
    expect(args).toContain(
      'OPEN_DOC_CLOUD=1,OPEN_DOC_MOUNT_DIR=/mnt/gcs,OPEN_DOC_MCP_TOKEN=od_mcp_test123',
    );
  });

  it('formats Antigravity MCP config snippet with Bearer token', () => {
    const snippet = JSON.parse(
      formatAntigravityMcpSnippet(
        'open-doc-sample',
        'https://open-doc-sample-xyz.asia-east1.run.app/',
        'od_mcp_secret',
      ),
    );
    expect(snippet).toEqual({
      mcpServers: {
        'open-doc-sample-cloud': {
          serverUrl: 'https://open-doc-sample-xyz.asia-east1.run.app/mcp',
          headers: {
            Authorization: 'Bearer od_mcp_secret',
          },
        },
      },
    });
  });

  it('inspects environment and reports gcloud auth, project, and API status', async () => {
    writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'sample-doc',
        devDependencies: { '@open-document/mcp': '^0.7.0' },
      }),
      'utf8',
    );

    const mockRunner: CommandRunner = (_cmd, args) => {
      const joined = args.join(' ');
      if (joined === '--version') {
        return { ok: true, status: 0, stdout: 'Google Cloud SDK 582.0.0', stderr: '' };
      }
      if (joined.startsWith('auth list')) {
        return { ok: true, status: 0, stdout: 'simonliuyuwei@gmail.com', stderr: '' };
      }
      if (joined.startsWith('projects list')) {
        return {
          ok: true,
          status: 0,
          stdout: 'gemma-4-practice\nsimonliuyuwei-blog-platform',
          stderr: '',
        };
      }
      if (joined.startsWith('config get-value project')) {
        return { ok: true, status: 0, stdout: '(unset)', stderr: '' };
      }
      if (joined.startsWith('services list')) {
        return {
          ok: true,
          status: 0,
          stdout: [
            'run.googleapis.com',
            'cloudbuild.googleapis.com',
            'artifactregistry.googleapis.com',
            'storage.googleapis.com',
          ].join('\n'),
          stderr: '',
        };
      }
      return { ok: true, status: 0, stdout: '', stderr: '' };
    };

    const withoutProject = await inspectGcpEnvironment(tempDir, {}, mockRunner);
    expect(withoutProject.ready).toBe(false);
    expect(withoutProject.account).toBe('simonliuyuwei@gmail.com');
    expect(withoutProject.accessibleProjects).toContain('gemma-4-practice');

    const withProject = await inspectGcpEnvironment(
      tempDir,
      { project: 'gemma-4-practice' },
      mockRunner,
    );
    expect(withProject.ready).toBe(true);
    expect(withProject.project).toBe('gemma-4-practice');
    expect(withProject.items.every((i) => i.status === 'ok')).toBe(true);
  });

  it('executes up, stop, start, and down lifecycle commands and persists cloud state', async () => {
    writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'demo-docs', packageManager: 'pnpm@11.0.0' }),
      'utf8',
    );
    writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules\n', 'utf8');

    const calls: string[] = [];
    const mockRunner: CommandRunner = (cmd, args) => {
      const full = `${cmd} ${args.join(' ')}`;
      calls.push(full);
      if (args[0] === '--version') {
        return { ok: true, status: 0, stdout: 'Google Cloud SDK 582.0.0', stderr: '' };
      }
      if (args[0] === 'auth') {
        return { ok: true, status: 0, stdout: 'user@example.com', stderr: '' };
      }
      if (args[0] === 'run' && args[1] === 'services' && args[2] === 'describe') {
        return {
          ok: true,
          status: 0,
          stdout: 'https://demo-docs-123.asia-east1.run.app',
          stderr: '',
        };
      }
      if (args[0] === 'projects' && args[1] === 'describe') {
        return { ok: true, status: 0, stdout: '123456789', stderr: '' };
      }
      return { ok: true, status: 0, stdout: '', stderr: '' };
    };

    await runGcpUp(
      { project: 'my-proj', region: 'asia-east1', token: 'od_mcp_fixed' },
      tempDir,
      mockRunner,
    );

    const stateAfterUp = readCloudState(tempDir);
    expect(stateAfterUp.project).toBe('my-proj');
    expect(stateAfterUp.service).toBe('demo-docs');
    expect(stateAfterUp.serviceUrl).toBe('https://demo-docs-123.asia-east1.run.app');
    expect(stateAfterUp.stopped).toBe(false);

    // Ensure subsequent commands reuse saved state without needing --project again
    const resolved = await resolveGcpDeployOptions(tempDir, {}, mockRunner, false);
    expect(resolved.project).toBe('my-proj');

    await runGcpStop({}, tempDir, mockRunner);
    expect(readCloudState(tempDir).stopped).toBe(true);
    expect(calls.some((c) => c.includes('remove-iam-policy-binding'))).toBe(true);

    await runGcpStart({}, tempDir, mockRunner);
    expect(readCloudState(tempDir).stopped).toBe(false);
    expect(calls.some((c) => c.includes('add-iam-policy-binding'))).toBe(true);

    await runGcpDown({ purgeStorage: true }, tempDir, mockRunner);
    expect(calls.some((c) => c.includes('run services delete demo-docs'))).toBe(true);
    expect(
      calls.some((c) => c.includes('storage rm --recursive gs://my-proj-demo-docs-data')),
    ).toBe(true);
  });
});

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { InlineConfig } from 'vite';
import { apiPlugin } from './api-plugin.ts';
import { currentPlugin } from './current-plugin.ts';
import { dataPlugin } from './data-plugin.ts';
import { designPlugin } from './design-plugin.ts';
import { diagramPlugin } from './diagram-plugin.ts';
import { locTagsPlugin } from './loc-tags-plugin.ts';
import { mcpPlugin } from './mcp-plugin.ts';
import { loadUserConfig, type OpenDocConfig, openDocPlugin } from './open-doc-plugin.ts';
import { themesPlugin } from './themes-plugin.ts';

function findPackageRoot(fromFile: string): string {
  let dir = path.dirname(fromFile);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Could not find package.json walking up from ${fromFile}`);
}

const PKG_ROOT = findPackageRoot(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(PKG_ROOT, 'src', 'app');

function readCoreVersion(): string {
  try {
    const raw = readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const CORE_VERSION = readCoreVersion();

function safeRealpath(target: string): string | null {
  try {
    return existsSync(target) ? realpathSync(target) : null;
  } catch {
    return null;
  }
}

export type CreateViteConfigOptions = {
  userCwd: string;
  /** Mount the MCP endpoint (requires `@open-document/mcp`). */
  mcp?: boolean;
  config?: OpenDocConfig;
  mode?: 'serve' | 'build';
  /**
   * Drive the app from a headless browser rather than a person. Leaves out the
   * plugins that exist to serve a reader — chiefly the one publishing the
   * reading position, which an export would otherwise overwrite.
   */
  headless?: boolean;
};

export async function createViteConfig(opts: CreateViteConfigOptions): Promise<InlineConfig> {
  const userCwd = path.resolve(opts.userCwd);
  const config = opts.config ?? (await loadUserConfig(userCwd));
  const docsDir = config.docsDir ?? 'docs';
  const assetsDir = config.assetsDir ?? 'assets';
  const docsAbs = path.resolve(userCwd, docsDir);
  const themesAbs = path.resolve(userCwd, config.themesDir ?? 'themes');
  const assetsAbs = path.resolve(userCwd, assetsDir);

  const isCloud = process.env.OPEN_DOC_CLOUD === '1' || Boolean(process.env.K_SERVICE);
  const allowedHosts = config.allowedHosts ?? (isCloud ? true : undefined);

  const fsAllow = new Set<string>([APP_ROOT, userCwd, docsAbs, themesAbs, assetsAbs]);
  for (const candidate of [userCwd, docsAbs, themesAbs, assetsAbs]) {
    const real = safeRealpath(candidate);
    if (real) fsAllow.add(real);
  }
  if (process.env.OPEN_DOC_MOUNT_DIR) {
    fsAllow.add(path.resolve(process.env.OPEN_DOC_MOUNT_DIR));
  }

  return {
    base: config.base ?? '/',
    root: APP_ROOT,
    configFile: false,
    envDir: userCwd,
    plugins: [
      dataPlugin(),
      diagramPlugin(),
      locTagsPlugin({ userCwd, docsDir }),
      react(),
      tailwindcss(),
      openDocPlugin({ userCwd, config, coreVersion: CORE_VERSION }),
      themesPlugin({ userCwd, config }),
      designPlugin({ userCwd, docsDir }),
      apiPlugin({ userCwd, docsDir, assetsDir, coreVersion: CORE_VERSION }),
      ...(opts.headless ? [] : [currentPlugin({ userCwd, docsDir })]),
      ...(opts.mcp
        ? [
            mcpPlugin({
              userCwd,
              docsDir,
              assetsDir,
              coreVersion: CORE_VERSION,
              ...(allowedHosts !== undefined ? { allowedHosts } : {}),
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': APP_ROOT,
        '@assets': assetsAbs,
      },
    },
    optimizeDeps: {
      entries: [path.join(APP_ROOT, 'main.tsx')],
      include: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/client',
        'react-router-dom',
        'next-themes',
        'lucide-react',
        'clsx',
        'tailwind-merge',
      ],
      // The app source ships inside node_modules/@open-document/core/src/app, so
      // Vite's dep scanner traverses it as a third-party dep and tries to
      // bundle the virtual imports with esbuild. Mark them external.
      esbuildOptions: {
        plugins: [
          {
            name: 'open-doc:virtual-externals',
            setup(build) {
              build.onResolve({ filter: /^virtual:open-doc\// }, (args) => ({
                path: args.path,
                external: true,
              }));
            },
          },
        ],
      },
    },
    server: {
      port: config.port ?? (process.env.PORT ? Number(process.env.PORT) : 5273),
      ...(allowedHosts !== undefined ? { allowedHosts } : {}),
      ...(isCloud ? { watch: { usePolling: true, interval: 1500 } } : {}),
      fs: { allow: [...fsAllow] },
    },
    build: {
      outDir: path.resolve(userCwd, 'dist'),
      emptyOutDir: true,
    },
  };
}

export { APP_ROOT };

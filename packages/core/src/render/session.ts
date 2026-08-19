import { createServer, mergeConfig, type ViteDevServer } from 'vite';
import type { BridgeBundle, BridgeReport, BridgeStatus } from '../app/lib/agent-bridge.ts';
import { createViteConfig } from '../vite/config.ts';

/**
 * Playwright is resolved at call time and is deliberately not a dependency: a
 * browser download is far too much to push onto everyone who only ever exports
 * from the Download menu. Structural types keep the published `.d.ts` free of
 * it too, so a consumer without playwright still typechecks.
 */
type HeadlessElement = {
  screenshot(opts?: { type?: 'png' | 'jpeg'; scale?: 'css' | 'device' }): Promise<Uint8Array>;
};

type HeadlessPage = {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  evaluate<T>(fn: string, arg?: unknown): Promise<T>;
  waitForFunction(fn: string, arg?: unknown, opts?: { timeout?: number }): Promise<unknown>;
  emulateMedia(opts: { media?: 'screen' | 'print' | null }): Promise<void>;
  pdf(opts?: {
    printBackground?: boolean;
    preferCSSPageSize?: boolean;
    scale?: number;
  }): Promise<Uint8Array>;
  $(selector: string): Promise<HeadlessElement | null>;
  close(): Promise<void>;
  on(event: 'pageerror' | 'console', handler: (arg: unknown) => void): void;
};

type HeadlessBrowser = {
  newPage(opts?: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
  }): Promise<HeadlessPage>;
  close(): Promise<void>;
};

type PlaywrightModule = {
  chromium: { launch(opts?: { headless?: boolean }): Promise<HeadlessBrowser> };
};

export class RenderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderUnavailableError';
  }
}

const INSTALL_HINT =
  'Headless rendering needs Playwright. Install it in this workspace:\n' +
  '  pnpm add -D playwright && pnpm exec playwright install chromium';

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    // Resolved through a variable so bundlers do not try to inline an optional
    // dependency that is usually absent.
    const specifier = 'playwright';
    return (await import(specifier)) as PlaywrightModule;
  } catch {
    throw new RenderUnavailableError(INSTALL_HINT);
  }
}

export type RenderSessionOptions = {
  userCwd: string;
  /** Reuse a dev server that is already running instead of booting a private one. */
  origin?: string;
  /** Raise for crisper page screenshots; 2 is retina. */
  deviceScaleFactor?: number;
  /** How long a document may take to load and finish measuring. */
  timeoutMs?: number;
};

export type DocRenderer = {
  status: BridgeStatus;
  diagnose(): Promise<BridgeReport>;
  pdf(): Promise<Uint8Array>;
  /** PNG of one sheet at true page size, 1-based. */
  screenshot(page: number): Promise<Uint8Array>;
  html(): Promise<BridgeBundle | null>;
  close(): Promise<void>;
};

export type RenderSession = {
  origin: string;
  open(docId: string): Promise<DocRenderer>;
  close(): Promise<void>;
};

const DEFAULT_TIMEOUT = 60_000;
const PRINT_PAGE_SELECTOR = '#od-print-root .od-print-page';

async function bootServer(userCwd: string): Promise<{ server: ViteDevServer; origin: string }> {
  const base = await createViteConfig({ userCwd, headless: true });
  const config = mergeConfig(base, {
    logLevel: 'silent',
    // Port 0 lets the OS pick, so an export never fights the dev server the
    // user already has running on 5273.
    server: { port: 0, strictPort: false, open: false },
  });
  const server = await createServer(config);
  await server.listen();
  const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '');
  if (!origin) {
    await server.close();
    throw new Error('Could not determine the dev server URL');
  }
  return { server, origin };
}

export async function createRenderSession(opts: RenderSessionOptions): Promise<RenderSession> {
  const { chromium } = await loadPlaywright();
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;

  let server: ViteDevServer | null = null;
  let origin = opts.origin?.replace(/\/$/, '') ?? '';
  if (!origin) {
    const booted = await bootServer(opts.userCwd);
    server = booted.server;
    origin = booted.origin;
  }

  let browser: HeadlessBrowser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    await server?.close();
    throw new RenderUnavailableError(
      `${INSTALL_HINT}\n\nChromium failed to launch: ${(err as Error).message}`,
    );
  }

  return {
    origin,
    async open(docId: string): Promise<DocRenderer> {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1024 },
        ...(opts.deviceScaleFactor !== undefined
          ? { deviceScaleFactor: opts.deviceScaleFactor }
          : {}),
      });

      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(String((err as Error)?.message ?? err)));

      await page.goto(`${origin}/d/${encodeURIComponent(docId)}`, {
        waitUntil: 'load',
        timeout,
      });

      try {
        await page.waitForFunction(
          'globalThis.__openDoc ? globalThis.__openDoc.status().ready : false',
          undefined,
          { timeout },
        );
      } catch {
        await page.close();
        const detail = errors.length ? `\n${errors.join('\n')}` : '';
        throw new Error(`Document "${docId}" never finished rendering.${detail}`);
      }

      const status = await page.evaluate<BridgeStatus>('globalThis.__openDoc.status()');

      return {
        status,
        diagnose: () => page.evaluate<BridgeReport>('globalThis.__openDoc.diagnose()'),
        async pdf() {
          await page.evaluate('globalThis.__openDoc.preparePrint()');
          try {
            return await page.pdf({ printBackground: true, preferCSSPageSize: true });
          } finally {
            await page.evaluate('globalThis.__openDoc.releasePrint()');
          }
        },
        async screenshot(pageNumber: number) {
          if (pageNumber < 1 || pageNumber > status.pageCount) {
            throw new Error(
              `page ${pageNumber} is out of range — "${docId}" has ${status.pageCount}`,
            );
          }
          await page.evaluate('globalThis.__openDoc.preparePrint()');
          // Print media is what lays the copy out at true sheet size and hides
          // the viewer chrome, so the shot matches the PDF rather than the app.
          await page.emulateMedia({ media: 'print' });
          try {
            const sheet = await page.$(`${PRINT_PAGE_SELECTOR}:nth-child(${pageNumber})`);
            if (!sheet) throw new Error(`page ${pageNumber} did not render`);
            return await sheet.screenshot({ type: 'png' });
          } finally {
            await page.emulateMedia({ media: null });
            await page.evaluate('globalThis.__openDoc.releasePrint()');
          }
        },
        html: () => page.evaluate<BridgeBundle | null>('globalThis.__openDoc.htmlBundle()'),
        close: () => page.close(),
      };
    },
    async close() {
      await browser.close();
      await server?.close();
    },
  };
}

export async function withRenderSession<T>(
  opts: RenderSessionOptions,
  fn: (session: RenderSession) => Promise<T>,
): Promise<T> {
  const session = await createRenderSession(opts);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

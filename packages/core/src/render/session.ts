import { Buffer } from 'node:buffer';
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
  evaluate<T>(fn: string | ((arg: never) => unknown), arg?: unknown): Promise<T>;
  waitForFunction(fn: string, arg?: unknown, opts?: { timeout?: number }): Promise<unknown>;
  emulateMedia(opts: { media?: 'screen' | 'print' | null }): Promise<void>;
  pdf(opts?: {
    printBackground?: boolean;
    preferCSSPageSize?: boolean;
    scale?: number;
    outline?: boolean;
    tagged?: boolean;
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

/** One printed sheet: how it looks and what it says. */
export type SheetSnapshot = { png: Uint8Array; text: string };

/** Where two pictures of a sheet differ, in the pictures' own pixels. */
export type ImageDiff = {
  width: number;
  height: number;
  /** Share of pixels that changed, 0–1. */
  changed: number;
  boxes: Array<{ x: number; y: number; width: number; height: number }>;
};

export type DocRenderer = {
  status: BridgeStatus;
  diagnose(): Promise<BridgeReport>;
  pdf(): Promise<Uint8Array>;
  /** PNG of one sheet at true page size, 1-based. */
  screenshot(page: number): Promise<Uint8Array>;
  /** Every sheet as printed, picture and text, from one print copy. */
  sheets(): Promise<SheetSnapshot[]>;
  html(): Promise<BridgeBundle | null>;
  docx(): Promise<BridgeBundle | null>;
  close(): Promise<void>;
};

export type RenderSession = {
  origin: string;
  open(docId: string): Promise<DocRenderer>;
  /** Compares two PNGs of the same sheet in the browser's own decoder. */
  compareImages(before: Uint8Array, after: Uint8Array): Promise<ImageDiff>;
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
            return await page.pdf({
              printBackground: true,
              preferCSSPageSize: true,
              outline: true,
              tagged: true,
            });
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
        async sheets() {
          await page.evaluate('globalThis.__openDoc.preparePrint()');
          await page.emulateMedia({ media: 'print' });
          try {
            const out: SheetSnapshot[] = [];
            for (let n = 1; n <= status.pageCount; n++) {
              const selector = `${PRINT_PAGE_SELECTOR}:nth-child(${n})`;
              const sheet = await page.$(selector);
              if (!sheet) throw new Error(`page ${n} did not render`);
              const png = await sheet.screenshot({ type: 'png' });
              const text = await page.evaluate<string>(
                `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`,
              );
              out.push({ png, text });
            }
            return out;
          } finally {
            await page.emulateMedia({ media: null });
            await page.evaluate('globalThis.__openDoc.releasePrint()');
          }
        },
        html: () => page.evaluate<BridgeBundle | null>('globalThis.__openDoc.htmlBundle()'),
        docx: () => page.evaluate<BridgeBundle | null>('globalThis.__openDoc.docxBundle()'),
        close: () => page.close(),
      };
    },
    async compareImages(before, after) {
      const page = await browser.newPage();
      try {
        const toUrl = (png: Uint8Array) =>
          `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
        return await page.evaluate<ImageDiff>(compareInBrowser, {
          a: toUrl(before),
          b: toUrl(after),
          cell: DIFF_CELL,
        });
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
      await server?.close();
    },
  };
}

/** Changed pixels are gathered into cells this many px square before boxing. */
const DIFF_CELL = 12;

/**
 * Runs in the page. The browser decodes both PNGs, so nothing on the Node side
 * has to: draw each onto white, mark every cell where a pixel moved by more
 * than antialiasing does, and box the clusters of marked cells. Clusters
 * within two cells of each other join, so one edited paragraph is one box.
 */
async function compareInBrowser({ a, b, cell }: { a: string; b: string; cell: number }) {
  const load = async (src: string) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  };
  const [x, y] = await Promise.all([load(a), load(b)]);
  const width = Math.max(x.naturalWidth, y.naturalWidth);
  const height = Math.max(x.naturalHeight, y.naturalHeight);
  const pixels = (image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, width, height);
    g.drawImage(image, 0, 0);
    return g.getImageData(0, 0, width, height).data;
  };
  const p = pixels(x);
  const q = pixels(y);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const hot = new Uint8Array(cols * rows);
  let changed = 0;
  for (let i = 0; i < p.length; i += 4) {
    const d =
      Math.abs((p[i] ?? 0) - (q[i] ?? 0)) +
      Math.abs((p[i + 1] ?? 0) - (q[i + 1] ?? 0)) +
      Math.abs((p[i + 2] ?? 0) - (q[i + 2] ?? 0));
    if (d <= 48) continue;
    changed++;
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    hot[Math.floor(py / cell) * cols + Math.floor(px / cell)] = 1;
  }
  const seen = new Uint8Array(cols * rows);
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let start = 0; start < hot.length; start++) {
    if (!hot[start] || seen[start]) continue;
    let minC = cols;
    let maxC = 0;
    let minR = rows;
    let maxR = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      const c = at % cols;
      const r = Math.floor(at / cols);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const next = nr * cols + nc;
          if (hot[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    boxes.push({
      x: minC * cell,
      y: minR * cell,
      width: Math.min(width, (maxC + 1) * cell) - minC * cell,
      height: Math.min(height, (maxR + 1) * cell) - minR * cell,
    });
  }
  return { width, height, changed: changed / (width * height), boxes };
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

import { expect, type Page, test } from '@playwright/test';
import { openDoc, readDocSource, writeDocSource } from './helpers.ts';

type ProviderStatus = {
  id: string;
  name: string;
  sdkPackage: string;
  sdkVersion?: string | null;
  cliCommand: string;
  cliFound: boolean;
  ready: boolean;
};

type Session = {
  id: string;
  provider: string;
  status: string;
  items: { id: string; kind: string; text?: string; aborted?: boolean }[];
};

async function mockStatus(
  page: Page,
  patch: (provider: ProviderStatus) => Partial<ProviderStatus>,
): Promise<void> {
  await page.route('**/__agent/status', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { providers: ProviderStatus[] };
    await route.fulfill({
      json: { ...body, providers: body.providers.map((p) => ({ ...p, ...patch(p) })) },
    });
  });
}

test.describe('agent panel', () => {
  test('status lists the Codex provider and whether it is connected', async ({ request }) => {
    const res = await request.get('/__agent/status');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { enabled: boolean; providers: ProviderStatus[] };
    expect(body.enabled).toBe(true);
    // Claude Code is not offered: Anthropic does not allow a third-party
    // product to run on a reader's claude.ai login.
    expect(body.providers.map((p) => p.id)).toEqual(['codex', 'antigravity']);
    const codex = body.providers[0];
    expect(codex.sdkPackage).toBe('@openai/codex-sdk');
    expect(codex.cliCommand).toBe('codex');
    expect(typeof codex.ready).toBe('boolean');
    // Antigravity runs on a Gemini API key and preview terms, never a sign-in,
    // and the status says only whether a key exists, never the key.
    const antigravity = body.providers[1] as ProviderStatus & Record<string, unknown>;
    expect(antigravity.auth).toBe('api-key');
    expect(antigravity.preview).toBe(true);
    expect(typeof antigravity.keyFound).toBe('boolean');
    expect(antigravity.consent).toMatchObject({ accepted: false });
    expect(JSON.stringify(antigravity)).not.toMatch(/AIza/);
  });

  test('sessions can be created, listed, read and deleted', async ({ request }) => {
    const created = await request.post('/__agent/sessions', {
      data: { provider: 'codex', docId: 'alpha' },
    });
    expect(created.status()).toBe(200);
    const session = (await created.json()) as Session & { docId: string | null };
    expect(session.provider).toBe('codex');
    expect(session.docId).toBe('alpha');
    expect(session.items).toEqual([]);

    const list = (await (await request.get('/__agent/sessions')).json()) as {
      sessions: { id: string }[];
    };
    expect(list.sessions.some((s) => s.id === session.id)).toBe(true);

    const read = await request.get(`/__agent/sessions/${session.id}`);
    expect(read.status()).toBe(200);

    const removed = await request.delete(`/__agent/sessions/${session.id}`);
    expect(removed.status()).toBe(200);
    expect((await request.get(`/__agent/sessions/${session.id}`)).status()).toBe(404);
  });

  test('a turn against an unconnected provider records the error in the transcript', async ({
    request,
  }) => {
    const status = (await (await request.get('/__agent/status')).json()) as {
      providers: ProviderStatus[];
    };
    const missing = status.providers.find((p) => !p.ready);
    test.skip(!missing, 'every provider SDK is installed in this environment');
    if (!missing) return;

    const session = (await (
      await request.post('/__agent/sessions', { data: { provider: missing.id } })
    ).json()) as Session;

    const sent = await request.post(`/__agent/sessions/${session.id}/messages`, {
      data: { text: 'hello', context: { docId: 'alpha', pageNumber: 1, totalPages: 1 } },
    });
    expect(sent.status()).toBe(202);

    await expect
      .poll(async () => {
        const body = (await (
          await request.get(`/__agent/sessions/${session.id}`)
        ).json()) as Session;
        return body.status === 'idle' ? body.items.map((i) => i.kind) : null;
      })
      .toEqual(['user', 'error', 'result']);

    const final = (await (await request.get(`/__agent/sessions/${session.id}`)).json()) as Session;
    expect(final.items[1].text).toContain(missing.sdkPackage);

    const again = await request.post(`/__agent/sessions/${session.id}/respond`, {
      data: { itemId: final.items[1].id, allow: true },
    });
    expect(again.status()).toBe(409);

    await request.delete(`/__agent/sessions/${session.id}`);
  });

  test('rejects malformed requests', async ({ request }) => {
    expect((await request.post('/__agent/sessions', { data: { provider: 'nope' } })).status()).toBe(
      400,
    );
    expect((await request.get('/__agent/sessions/s-missing')).status()).toBe(404);
    expect((await request.post('/__agent/install', { data: { provider: 'nope' } })).status()).toBe(
      400,
    );
  });

  test('the panel asks for the CLI when Codex is not installed', async ({ page }) => {
    await mockStatus(page, () => ({ cliFound: false, ready: false }));
    let installs = 0;
    await page.route('**/__agent/install', (route) => {
      installs += 1;
      return route.fulfill({ json: { ok: true } });
    });
    await openDoc(page, 'alpha');
    const dock = page.locator('[data-agent-dock]');
    await expect(dock).toHaveCount(0);

    await page.keyboard.press('a');
    await expect(dock).toBeVisible();
    await expect(dock.getByRole('heading', { name: 'Install Codex first' })).toBeVisible();
    await expect(dock.getByText('npm install -g @openai/codex')).toBeVisible();
    await expect(dock.getByText(/claude-code/)).toHaveCount(0);
    expect(installs).toBe(0);

    await page.getByRole('button', { name: 'Close agent panel' }).click();
    await expect(dock).toHaveCount(0);

    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await expect(dock).toBeVisible();
  });

  test('the panel connects an installed CLI on first use', async ({ page }) => {
    let installed = false;
    const requested: string[] = [];
    await mockStatus(page, (p) =>
      p.id === 'codex'
        ? { cliFound: true, ready: installed, sdkVersion: '0.0.0' }
        : { cliFound: false, ready: false },
    );
    await page.route('**/__agent/install', async (route) => {
      requested.push(route.request().postDataJSON().provider);
      installed = true;
      await route.fulfill({ json: { ok: true } });
    });
    await openDoc(page, 'alpha');
    await page.keyboard.press('a');
    const dock = page.locator('[data-agent-dock]');
    await expect(dock.getByPlaceholder(/Ask Codex/)).toBeVisible();
    expect(requested).toEqual(['codex']);
  });

  test('transcript messages can be copied, and sent ones edited', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockStatus(page, (p) =>
      p.id === 'codex'
        ? { cliFound: true, ready: true, sdkVersion: '0.0.0' }
        : { cliFound: false, ready: false },
    );
    const ts = new Date().toISOString();
    const session = {
      id: 's-edit',
      provider: 'codex',
      title: 'Make the cover bolder',
      createdAt: ts,
      updatedAt: ts,
      status: 'idle',
      docId: 'alpha',
      providerSessionId: null,
      items: [
        { kind: 'user', id: 'u-1', ts, text: 'Make the cover bolder' },
        { kind: 'assistant', id: 'a-0', ts, text: 'Reading the cover first.', streaming: false },
        {
          kind: 'tool',
          id: 't-1',
          ts,
          name: 'Read',
          title: 'Read',
          detail: 'docs/alpha/index.tsx',
          status: 'done',
        },
        { kind: 'assistant', id: 'a-1', ts, text: 'Bolded the **cover** title.', streaming: false },
        { kind: 'result', id: 'r-1', ts, durationMs: 1000, costUsd: null, aborted: false },
      ],
    };
    const { items: _items, providerSessionId: _p, ...summary } = session;
    await page.route('**/__agent/sessions', (route) =>
      route.fulfill({ json: { sessions: [summary] } }),
    );
    await page.route('**/__agent/sessions/s-edit', (route) => route.fulfill({ json: session }));
    const sent: Record<string, unknown>[] = [];
    await page.route('**/__agent/sessions/s-edit/messages', (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { ok: true } });
    });
    await page.addInitScript(() => localStorage.setItem('open-doc:agent-session', 's-edit'));

    await openDoc(page, 'alpha');
    await page.keyboard.press('a');
    const dock = page.locator('[data-agent-dock]');
    const reply = dock.getByText('Bolded the');
    await reply.hover();
    const replyCopy = dock
      .getByRole('listitem')
      .filter({ hasText: 'Bolded the' })
      .getByRole('button', {
        name: 'Copy',
      });
    await expect(
      dock.getByRole('listitem').filter({ hasText: 'Reading the cover' }).getByRole('button'),
    ).toHaveCount(0);
    await replyCopy.click();
    await expect(dock.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'Reading the cover first.\n\nBolded the **cover** title.',
    );

    await dock.getByText('Make the cover bolder').hover();
    await dock.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = dock.getByRole('textbox', { name: 'Edit', exact: true });
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue('Make the cover bolder');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(dock).toBeVisible();

    await dock.getByText('Make the cover bolder').hover();
    await dock.getByRole('button', { name: 'Edit', exact: true }).click();
    await editor.fill('Make the cover title red');
    await editor.press('Enter');
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ text: 'Make the cover title red', edit: 'u-1' });
  });

  test('shows the check the dev server ran after a turn, and hands its findings back', async ({
    page,
  }) => {
    await mockStatus(page, () => ({ cliFound: true, ready: true, sdkVersion: '0.0.0' }));
    const ts = new Date().toISOString();
    const session = {
      id: 's-check',
      provider: 'codex',
      title: 'Tighten page two',
      createdAt: ts,
      updatedAt: ts,
      status: 'idle',
      docId: 'alpha',
      providerSessionId: null,
      items: [
        { kind: 'user', id: 'u-1', ts, text: 'Tighten page two' },
        { kind: 'assistant', id: 'a-1', ts, text: 'Tightened it.', streaming: false },
        { kind: 'result', id: 'r-1', ts, durationMs: 4000, costUsd: null, aborted: false },
        {
          kind: 'check',
          id: 'c-1',
          ts,
          docId: 'alpha',
          status: 'done',
          pageCount: 3,
          findings: [
            { page: 2, severity: 'error', message: 'Text runs past the page edge', loc: '40:6' },
            { page: 3, severity: 'warn', message: 'Type smaller than 8pt' },
          ],
          total: 7,
          error: null,
        },
      ],
    };
    const { items: _items, providerSessionId: _p, ...summary } = session;
    await page.route('**/__agent/sessions', (route) =>
      route.fulfill({ json: { sessions: [summary] } }),
    );
    await page.route('**/__agent/sessions/s-check', (route) => route.fulfill({ json: session }));
    const sent: Record<string, unknown>[] = [];
    await page.route('**/__agent/sessions/s-check/messages', (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { ok: true } });
    });
    await page.addInitScript(() => {
      localStorage.setItem('open-doc:agent-session', 's-check');
      localStorage.setItem('open-doc:agent-dock', '1');
    });

    await openDoc(page, 'alpha');
    const card = page.locator('[data-agent-dock] [data-agent-check]');
    await expect(card).toContainText('The check found 7 problems');
    await expect(card).toContainText('Text runs past the page edge');
    await expect(card).toContainText('+5 more');

    await card.getByRole('button', { name: 'Ask the agent to fix' }).click();
    await expect.poll(() => sent.length).toBe(1);
    const text = String(sent[0].text);
    expect(text).toContain('open-doc check');
    expect(text).toContain('- page 2 [error] Text runs past the page edge (at 40:6)');
    expect(text).toContain('5 more');
  });

  test('opening the panel on another document starts a new conversation', async ({ page }) => {
    await mockStatus(page, (p) =>
      p.id === 'codex'
        ? { cliFound: true, ready: true, sdkVersion: '0.0.0' }
        : { cliFound: false, ready: false },
    );
    const ts = new Date().toISOString();
    const session = {
      id: 's-alpha',
      provider: 'codex',
      title: 'Tighten the alpha cover',
      createdAt: ts,
      updatedAt: ts,
      status: 'idle',
      docId: 'alpha',
      providerSessionId: null,
      items: [{ kind: 'user', id: 'u-1', ts, text: 'Tighten the alpha cover' }],
    };
    const { items: _items, providerSessionId: _p, ...summary } = session;
    await page.route('**/__agent/sessions', (route) =>
      route.fulfill({ json: { sessions: [summary] } }),
    );
    await page.route('**/__agent/sessions/s-alpha', (route) => route.fulfill({ json: session }));
    await page.addInitScript(() => {
      localStorage.setItem('open-doc:agent-session', 's-alpha');
      localStorage.setItem('open-doc:agent-dock', '1');
    });

    await openDoc(page, 'alpha');
    const dock = page.locator('[data-agent-dock]');
    await expect(dock.getByText('Tighten the alpha cover')).toBeVisible();

    await openDoc(page, 'flow-report');
    await expect(dock.getByPlaceholder(/Ask Codex/)).toBeVisible();
    await expect(dock.getByText('Tighten the alpha cover')).toHaveCount(0);

    await dock.getByRole('button', { name: 'History', exact: true }).click();
    await dock.getByRole('button', { name: /Tighten the alpha cover/ }).click();
    await expect(page).toHaveURL(/\/d\/alpha$/);
    await expect(dock.getByText('Tighten the alpha cover')).toBeVisible();
  });

  test('Draft with agent opens a blank document with the agent dock asking for a brief', async ({
    page,
    request,
  }) => {
    const status = (await (await request.get('/__agent/status')).json()) as {
      enabled: boolean;
      packageManager: string;
      providers: ProviderStatus[];
    };
    await page.route('**/__agent/status', (route) =>
      route.fulfill({
        json: {
          ...status,
          providers: status.providers.map((p) =>
            p.id === 'codex' ? { ...p, ready: true } : { ...p, cliFound: false },
          ),
        },
      }),
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Draft with agent' }).click();
    await expect(page).toHaveURL(/\/d\/untitled[^/]*$/);
    const docId = new URL(page.url()).pathname.split('/').pop() ?? '';

    try {
      const dock = page.locator('[data-agent-dock]');
      await expect(
        dock.getByRole('heading', { name: "What's this document about?" }),
      ).toBeVisible();
      await expect(dock.getByPlaceholder('A two-page project brief on…')).toBeFocused();

      await dock.getByRole('button', { name: /^GPT-5 Codex/ }).click();
      const menu = page.locator('[data-agent-model-menu]');
      // One agent, so no tabs to switch between.
      await expect(menu.getByRole('tab')).toHaveCount(0);
      await menu.getByRole('button', { name: 'GPT-5 Mini', exact: true }).click();
      await expect(menu.getByRole('button', { name: 'High', exact: true })).toHaveCount(0);
      await menu.getByRole('button', { name: 'GPT-5 Codex', exact: true }).click();
      await menu.getByRole('button', { name: 'High', exact: true }).click();
      await expect(menu.getByRole('button', { name: 'High', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.keyboard.press('Escape');
      await expect(dock.getByRole('button', { name: 'GPT-5 Codex High' })).toBeVisible();
    } finally {
      expect((await request.delete(`/__docs/${docId}`)).status()).toBe(200);
    }
  });

  test('hands the pending comments to the agent from the comments panel', async ({
    page,
    request,
  }) => {
    await mockStatus(page, (p) =>
      p.id === 'codex'
        ? { cliFound: true, ready: true, sdkVersion: '0.0.0' }
        : { cliFound: false, ready: false },
    );
    const sent: Record<string, unknown>[] = [];
    await page.route('**/__agent/sessions/*/messages', (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { ok: true } });
    });
    const original = await readDocSource('edit-target');
    try {
      const added = await request.post('/__edit/comment', {
        data: { docId: 'edit-target', line: 43, column: 4, note: 'Shorter', hint: 'h1' },
      });
      expect(added.ok(), await added.text()).toBe(true);
      await openDoc(page, 'edit-target');
      await page.getByRole('button', { name: 'Comments (1)' }).click();
      await page.getByRole('button', { name: 'Apply with Codex' }).click();
      await expect(page.locator('[data-agent-dock]')).toBeVisible();
      await expect.poll(() => sent.length).toBe(1);
      expect(String(sent[0].text)).toContain('apply-comments skill');
      expect(sent[0].context).toMatchObject({ docId: 'edit-target', pendingComments: 1 });
    } finally {
      await writeDocSource('edit-target', original);
    }
  });

  test('a turn cannot be started from another origin', async ({ request }) => {
    const session = (await (
      await request.post('/__agent/sessions', { data: { provider: 'codex' } })
    ).json()) as Session;
    const res = await request.post(`/__agent/sessions/${session.id}/messages`, {
      headers: { origin: 'https://evil.example' },
      data: { text: 'Delete everything' },
    });
    expect(res.status()).toBe(403);
    await request.delete(`/__agent/sessions/${session.id}`);
  });
});

test.describe('page preview', () => {
  test('draws one sheet alone at true size, ready for a screenshot', async ({ page }) => {
    await page.goto('/d/flow-report/preview?p=2');
    const root = page.locator('[data-od-preview-ready]');
    await expect(root).toHaveAttribute('data-od-preview-ready', 'true');
    await expect(root).toHaveAttribute('data-od-preview-page', '2');
    const shown = page.locator('[data-od-page]:visible');
    await expect(shown).toHaveCount(1);
    const box = await shown.boundingBox();
    // A4 in CSS pixels, at 1:1, from the window's corner.
    expect(box && Math.round(box.width)).toBe(794);
    expect(box && Math.round(box.x)).toBe(0);
    // No viewer chrome around it.
    await expect(page.getByRole('button', { name: 'Back to documents' })).toHaveCount(0);
  });

  test('clamps a page number past the end to the last sheet', async ({ page }) => {
    await page.goto('/d/flow-report/preview?p=999');
    const root = page.locator('[data-od-preview-ready="true"]');
    await expect(root).toBeVisible();
    const pages = await root.getAttribute('data-od-preview-pages');
    await expect(root).toHaveAttribute('data-od-preview-page', pages ?? '');
  });
});

test.describe('a page that throws', () => {
  test('stays on its own sheet, and is drawn again once the source is fixed', async ({ page }) => {
    const original = await readDocSource('alpha');
    try {
      await openDoc(page, 'alpha');
      // The state an edit leaves between using a component and importing it.
      await writeDocSource(
        'alpha',
        original.replace('<p>Middle content</p>', '<p>Middle content</p><Missing />'),
      );
      const alert = page.locator('[data-od-viewer] [data-od-page-error]');
      await expect(alert).toContainText('Missing is not defined');
      // Only that sheet: the others, the toolbar and the rail are still there.
      await expect(page.locator('[data-od-viewer]')).toContainText('Alpha page one');
      await expect(page.getByRole('button', { name: 'Agent' })).toBeVisible();

      await writeDocSource('alpha', original);
      await expect(alert).toHaveCount(0);
      await expect(page.locator('[data-od-viewer]')).toContainText('Middle content');
    } finally {
      await writeDocSource('alpha', original);
    }
  });
});

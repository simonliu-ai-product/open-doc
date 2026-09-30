import { expect, type Locator, type Page, test } from '@playwright/test';
import { openDoc, readDocSource, viewer, writeDocSource } from './helpers.ts';

async function enterEditMode(page: Page): Promise<void> {
  await openDoc(page, 'edit-target');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}

/** The text being edited — the focused one, since unsaved edits stay open on the page. */
function field(page: Page) {
  return viewer(page).locator('[data-od-editing]:focus');
}

function toolbar(page: Page) {
  return page.getByRole('toolbar', { name: 'Text formatting' });
}

/** Selects `word` inside the text being edited, as a drag across it would. */
async function selectWord(page: Page, word: string) {
  await field(page).evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(word);
      if (at < 0) continue;
      window.getSelection()?.setBaseAndExtent(node, at, node, at + word.length);
      return;
    }
    throw new Error(`no "${word}" in the field`);
  }, word);
}

/** Double-click opens the editor once the source has said which words are editable. */
async function editAt(page: Page, target: Locator, position?: { x: number; y: number }) {
  await target.dblclick(position ? { position } : undefined);
  await expect(field(page)).toHaveCount(1);
}

test.describe('editing on the page', () => {
  let original = '';

  test.beforeEach(async () => {
    original = await readDocSource('edit-target');
  });

  test.afterEach(async ({ request }) => {
    await writeDocSource('edit-target', original);
    const res = await request.get('/__comments?docId=edit-target');
    if (res.ok()) {
      const { comments = [] } = (await res.json()) as { comments?: { id: string }[] };
      for (const c of comments) {
        await request.delete(`/__comments?docId=edit-target&id=${encodeURIComponent(c.id)}`);
      }
    }
  });

  test('a heading is edited where it is printed and saved to source', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable heading'));

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Rewritten heading');
    await page.keyboard.press('Enter');

    // Kept on the page, not yet in source.
    await expect(page.getByRole('toolbar', { name: 'Unsaved edits' })).toContainText(
      '1 unsaved edit',
    );
    expect(await readDocSource('edit-target')).toBe(original);

    const saved = page.waitForResponse(
      (res) => res.url().includes('/__edit/texts') && res.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).status()).toBe(200);

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('>Rewritten heading</h1>');
    // What remains on the page is the re-render from source, not the editor.
    await expect(viewer(page).locator('[data-od-editing]')).toHaveCount(0, { timeout: 15_000 });
    await expect(viewer(page).locator('h1')).toHaveText('Rewritten heading');
  });

  test('edits to several elements land in one write', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable heading'));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('First change');
    await page.keyboard.press('Enter');

    await editAt(page, viewer(page).getByText('Editable paragraph'));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Second change');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('toolbar', { name: 'Unsaved edits' })).toContainText(
      '2 unsaved edits',
    );

    const puts: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/__edit/text') && req.method() === 'PUT') puts.push(req.url());
    });
    await page.keyboard.press('ControlOrMeta+s');

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<p>Second change</p>');
    const source = await readDocSource('edit-target');
    expect(source).toContain('>First change</h1>');
    expect(source).toContain('<p>Second paragraph stays put</p>');
    expect(puts).toHaveLength(1);
  });

  test('Escape reverts the text and leaves the source alone', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable paragraph'));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Thrown away');
    await page.keyboard.press('Escape');

    await expect(viewer(page).locator('[data-od-editing]')).toHaveCount(0);
    await expect(viewer(page).getByText('Editable paragraph')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Unsaved edits' })).toHaveCount(0);
    expect(await readDocSource('edit-target')).toBe(original);
  });

  test('Discard drops every unsaved edit', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable heading'));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Not kept');
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(viewer(page).locator('[data-od-editing]')).toHaveCount(0);
    await expect(viewer(page).locator('h1')).toHaveText('Editable heading');
    expect(await readDocSource('edit-target')).toBe(original);
  });

  test('inline markup survives an edit to the words around it', async ({ page }) => {
    await enterEditMode(page);
    const paragraph = viewer(page).locator('p', { hasText: 'Run before' });
    // Near the left edge: the word "Run", clear of the code element.
    await editAt(page, paragraph, { x: 4, y: 6 });
    await page.keyboard.type('Text');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('Text before <code>open-doc dev</code> run after');
  });

  test("a paragraph that keeps its spacing with {' '} is editable", async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).locator('p', { hasText: 'Spaced before' }), { x: 4, y: 6 });
    await selectWord(page, 'before');
    await page.keyboard.type('after all');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain(
        'Spaced after all a long enough stretch of words that the formatter has to wrap this line <code>tag</code> spaced after',
      );
  });

  test('an edit that would span two runs is refused', async ({ page }) => {
    await enterEditMode(page);
    const paragraph = viewer(page).locator('p', { hasText: 'Left side' });
    await editAt(page, paragraph, { x: 4, y: 6 });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('x');

    await expect(field(page)).toContainText('Left side');
    await expect(field(page)).toContainText('right side');
    await expect(field(page).locator('kbd')).toHaveText('Enter');
  });

  test('bold from the toolbar is written as <strong>', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable paragraph'));
    await selectWord(page, 'paragraph');
    const bold = page.getByRole('toolbar', { name: 'Text formatting' }).getByRole('button', {
      name: 'Bold',
    });
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(field(page).locator('strong')).toHaveText('paragraph');

    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<p>Editable <strong>paragraph</strong></p>');
  });

  test('⌘I italicises and undo takes it back', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable heading'));
    await selectWord(page, 'heading');
    await page.keyboard.press('ControlOrMeta+i');
    await expect(field(page).locator('em')).toHaveText('heading');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(field(page).locator('em')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('toolbar', { name: 'Unsaved edits' })).toHaveCount(0);
    expect(await readDocSource('edit-target')).toBe(original);
  });

  test('text passed in as a string cannot be made bold', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('From a prop'));
    await selectWord(page, 'prop');
    const bold = page.getByRole('toolbar', { name: 'Text formatting' }).getByRole('button', {
      name: 'Bold',
    });
    await expect(bold).toBeDisabled();
    await page.keyboard.press('ControlOrMeta+b');
    await expect(field(page).locator('strong')).toHaveCount(0);

    // The words themselves are still editable.
    await page.keyboard.type('attribute');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<Label text="From a attribute" />');
  });

  test('bold already in the source can be taken off again', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).locator('p', { hasText: 'Already' }), { x: 4, y: 6 });
    await selectWord(page, 'bold');
    const bold = toolbar(page).getByRole('button', { name: 'Bold' });
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await bold.click();
    await expect(field(page).locator('strong')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<p>\n      Already bold words\n    </p>');
  });

  test('words inside existing bold stay bold when rewritten', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).locator('p', { hasText: 'Already' }), { x: 4, y: 6 });
    await selectWord(page, 'bold');
    await page.keyboard.type('heavy');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('Already <strong>heavy</strong> words');
  });

  test('⌘E marks code, and clear formatting takes everything off', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable paragraph'));
    await selectWord(page, 'paragraph');
    await page.keyboard.press('ControlOrMeta+e');
    await expect(field(page).locator('code')).toHaveText('paragraph');
    await page.keyboard.press('ControlOrMeta+b');
    await expect(field(page).locator('strong code')).toHaveText('paragraph');

    await toolbar(page).getByRole('button', { name: 'Clear formatting' }).click();
    await expect(field(page).locator('code, strong')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+e');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<p>Editable <code>paragraph</code></p>');
  });

  test('a link is added from the toolbar and written as <a href>', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable paragraph'));
    await selectWord(page, 'paragraph');
    await toolbar(page).getByRole('button', { name: 'Link' }).click();
    const address = toolbar(page).getByRole('textbox', { name: 'Link address' });
    await expect(address).toBeFocused();

    await address.fill('javascript:alert(1)');
    await expect(toolbar(page).getByRole('button', { name: 'Apply link' })).toBeDisabled();
    await address.fill('https://example.com/guide');
    await address.press('Enter');
    await expect(field(page).locator('a')).toHaveAttribute('href', 'https://example.com/guide');
    await expect(field(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<p>Editable <a href="https://example.com/guide">paragraph</a></p>');
  });

  test('bold is not offered where the element is already bold', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable heading'));
    await selectWord(page, 'heading');
    await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toBeDisabled();
    await expect(toolbar(page).getByRole('button', { name: 'Italic' })).toBeEnabled();
  });

  test('leaving edit mode saves what is still unsaved', async ({ page }) => {
    await enterEditMode(page);
    await editAt(page, viewer(page).getByText('Editable paragraph'));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Saved on the way out');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('<p>Saved on the way out</p>');
  });

  test('edit mode survives the reload the dev server sends', async ({ page }) => {
    await enterEditMode(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('a comment is stored as a marker in the source', async ({ page }) => {
    await enterEditMode(page);
    await viewer(page).getByText('Editable paragraph').click();

    await page.getByPlaceholder('make this bold, shorten to one line…').fill('tighten this');
    await page.getByRole('button', { name: 'Mark comment' }).click();

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('@doc-comment');
  });

  test('the design panel takes the right dock while it is open', async ({ page }) => {
    await enterEditMode(page);
    await viewer(page).getByText('Editable paragraph').click();
    await expect(page.getByRole('complementary', { name: 'Element' })).toBeVisible();

    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Element' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Element' })).toBeVisible();
  });

  test('a stale edit is refused rather than overwriting the file', async ({ request }) => {
    const res = await request.put('/__edit/text', {
      data: {
        docId: 'edit-target',
        line: 42,
        column: 4,
        text: 'nope',
        expected: 'something that was never on the page',
      },
    });
    expect(res.ok()).toBe(false);
    expect(await readDocSource('edit-target')).toBe(original);
  });

  test('a batch reports a stale edit and writes the rest', async ({ request }) => {
    const lines = original.split('\n');
    const at = (text: string) => {
      const line = lines.findIndex((l) => l.includes(text));
      return { line: line + 1, column: (lines[line] ?? '').indexOf('<') };
    };
    const res = await request.put('/__edit/texts', {
      data: {
        docId: 'edit-target',
        edits: [
          { ...at('Editable heading'), text: 'nope', expected: 'never on the page' },
          { ...at('Editable paragraph'), text: 'Batched', expected: 'Editable paragraph' },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const { results } = (await res.json()) as { results: { ok: boolean; status?: number }[] };
    expect(results[0]).toMatchObject({ ok: false, status: 409 });
    expect(results[1]).toMatchObject({ ok: true });
    const source = await readDocSource('edit-target');
    expect(source).toContain('Editable heading');
    expect(source).toContain('<p>Batched</p>');
  });
});

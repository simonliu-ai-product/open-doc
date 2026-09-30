import { expect, type Page, test } from '@playwright/test';
import { openDoc, readDocSource, viewer, writeDocSource } from './helpers.ts';

function panel(page: Page) {
  return page.getByRole('complementary', { name: 'Design' });
}

function card(page: Page) {
  return page.getByRole('toolbar', { name: 'Unsaved changes' });
}

async function setMargin(page: Page, value: string) {
  const field = panel(page).getByRole('textbox', { name: 'Margin' });
  await field.fill(value);
  await field.press('Enter');
}

test.describe('design panel', () => {
  let original = '';

  test.beforeEach(async ({ page }) => {
    original = await readDocSource('edit-target');
    await openDoc(page, 'edit-target');
  });

  test.afterEach(async () => {
    await writeDocSource('edit-target', original);
  });

  test('a margin change is saved from the save card', async ({ page }) => {
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await setMargin(page, '120');
    await expect(card(page)).toContainText('1 unsaved change');

    const saved = page.waitForResponse(
      (res) => res.url().includes('/__design') && res.request().method() === 'PUT',
    );
    await card(page).getByRole('button', { name: 'Save' }).click();
    expect((await saved).status()).toBe(200);
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('margin: 120');
  });

  test('discard leaves the source untouched', async ({ page }) => {
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await setMargin(page, '132');
    await card(page).getByRole('button', { name: 'Discard' }).click();
    await expect(panel(page).getByRole('textbox', { name: 'Margin' })).toHaveValue('76');
    expect(await readDocSource('edit-target')).toBe(original);
  });

  test('a design change is undone and redone from the card and the keyboard', async ({ page }) => {
    await page.keyboard.press('d');
    await expect(panel(page)).toBeVisible();
    await setMargin(page, '100');
    // Changes to one field inside half a second are one step — a slider drag.
    // Two deliberate edits are further apart than that.
    await page.waitForTimeout(600);
    await setMargin(page, '110');
    const margin = panel(page).getByRole('textbox', { name: 'Margin' });

    await card(page).getByRole('button', { name: 'Undo' }).click();
    await expect(margin).toHaveValue('100');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(margin).toHaveValue('76');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(margin).toHaveValue('100');

    await page.keyboard.press('d');
    await expect(panel(page)).toHaveCount(0);
    // Closing the panel keeps the draft; the card still says it is unsaved.
    await expect(card(page)).toContainText('1 unsaved change');
  });

  test('a half-typed colour never reaches the draft', async ({ page }) => {
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    const accent = panel(page).getByRole('textbox', { name: 'Accent', exact: true });
    await accent.fill('#12');
    await expect(card(page)).toHaveCount(0);
    await accent.blur();
    await expect(accent).toHaveValue('#2563eb');
    await accent.fill('#ff0000');
    await expect(card(page)).toContainText('1 unsaved change');
  });

  test('page edits and the design are saved together, both kept', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await viewer(page).getByText('Editable heading').dblclick();
    await expect(viewer(page).locator('[data-od-editing]:focus')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Saved together');
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await setMargin(page, '90');
    await expect(card(page)).toContainText('2 unsaved changes');
    await card(page).getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('margin: 90');
    const source = await readDocSource('edit-target');
    expect(source).toContain('>Saved together</h1>');
  });

  test('the dev API reports the document design', async ({ request }) => {
    const res = await request.get('/__design?docId=edit-target');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { design?: { margin?: number } };
    expect(body.design?.margin).toBe(76);
  });
});

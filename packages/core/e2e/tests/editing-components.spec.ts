import { expect, type Locator, type Page, test } from '@playwright/test';
import { openDoc, readDocSource, viewer, writeDocSource } from './helpers.ts';

// Words a framework component prints — a caption, a footnote — are selected
// and edited on the page like any other text, and written back to the call site.

function field(page: Page) {
  return viewer(page).locator('[data-od-editing]:focus');
}

async function retype(page: Page, target: Locator, text: string) {
  await target.dblclick();
  await expect(field(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test.describe('editing what components print', () => {
  let original = '';

  test.beforeEach(async ({ page }) => {
    original = await readDocSource('long-form');
    await openDoc(page, 'long-form');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
  });

  test.afterEach(async () => {
    await writeDocSource('long-form', original);
  });

  test('a figure caption is written to the caption attribute', async ({ page }) => {
    await retype(
      page,
      viewer(page).locator('figcaption').getByText('A drawn box', { exact: true }),
      'A boxed drawing',
    );
    await save(page);
    await expect
      .poll(async () => await readDocSource('long-form'), { timeout: 10_000 })
      .toContain('<Figure id="drawing" caption="A boxed drawing">');
  });

  test('a table caption is written to the DataTable', async ({ page }) => {
    await retype(
      page,
      viewer(page).locator('figcaption').getByText('Fixture rows', { exact: true }),
      'Service rows',
    );
    await save(page);
    await expect
      .poll(async () => await readDocSource('long-form'), { timeout: 10_000 })
      .toContain('caption="Service rows"');
  });

  test('a note in a flow section is edited at the foot of its page', async ({ page }) => {
    await retype(
      page,
      viewer(page).locator('[data-od-footnotes]').getByText('Measured from the fixture data.'),
      'Measured from the rows file.',
    );
    await save(page);
    await expect
      .poll(async () => await readDocSource('long-form'), { timeout: 10_000 })
      .toContain('<Footnote id="source-note">Measured from the rows file.</Footnote>');
  });

  test('a note collected on a fixed page is edited where it prints', async ({ page }) => {
    await retype(
      page,
      viewer(page).locator('[data-od-footnotes]').getByText('Collected from the page'),
      'Gathered on the cover.',
    );
    await save(page);
    await expect
      .poll(async () => await readDocSource('long-form'), { timeout: 10_000 })
      .toContain('<Footnote id="cover-note">Gathered on the cover.</Footnote>');
  });

  test('a table cell selects the table and names the file behind it', async ({ page }) => {
    await viewer(page).getByRole('cell', { name: 'alpha-api' }).click();
    const panel = page.getByRole('complementary', { name: 'Element' });
    await expect(panel).toContainText('./data/rows.csv');
    expect(await readDocSource('long-form')).toBe(original);
  });
});

import { expect, test } from '@playwright/test';
import { openDoc, readDocSource, viewer, writeDocSource } from './helpers.ts';

test.describe('review comments', () => {
  let original: string;

  test.beforeEach(async () => {
    original = await readDocSource('edit-target');
  });

  test.afterEach(async () => {
    await writeDocSource('edit-target', original);
  });

  test('a comment in the source is listed, pinned to its page, and resolved', async ({
    page,
    request,
  }) => {
    const added = await request.post('/__edit/comment', {
      data: { docId: 'edit-target', line: 43, column: 4, note: 'Shorter, please', hint: 'h1' },
    });
    expect(added.ok(), await added.text()).toBe(true);

    await openDoc(page, 'edit-target');
    await page.getByRole('button', { name: 'Comments (1)' }).click();
    const panel = page.getByRole('complementary', { name: 'Comments' });
    const item = panel.getByRole('listitem');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Shorter, please');
    // The element's own words, so the note reads in context.
    await expect(item).toContainText('Editable heading');
    await expect(page.getByRole('button', { name: 'Page 1, with comments' })).toBeVisible();

    await item.getByRole('button', { name: 'Resolve' }).click();
    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .not.toContain('@doc-comment');
    await expect(panel).toContainText('No comments');
  });

  test('New comment goes to picking an element, with the note open', async ({ page }) => {
    await openDoc(page, 'edit-target');
    await page.getByRole('button', { name: 'Comments', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Comments' })
      .getByRole('button', { name: 'New comment' })
      .first()
      .click();

    await viewer(page).getByText('Editable paragraph').click();
    const note = page.getByRole('textbox', { name: 'Comment for the agent' });
    await expect(note).toBeFocused();
    await note.fill('Say what it is for');
    await page.getByRole('button', { name: 'Mark comment' }).click();

    await expect
      .poll(async () => await readDocSource('edit-target'), { timeout: 10_000 })
      .toContain('@doc-comment');
    await expect(page.getByRole('button', { name: 'Comments (1)' })).toBeVisible();
  });
});

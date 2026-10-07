import { expect, test } from '@playwright/test';
import { openDoc, viewer } from './helpers.ts';

test.describe('typesetting', () => {
  test('every sheet carries the document language, whatever the viewer speaks', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('open-doc:locale', 'zh-TW'));
    await openDoc(page, 'alpha');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    const sheet = viewer(page).locator('[data-od-page]').first();
    await expect(sheet).toHaveAttribute('lang', 'en-GB');
    // A document that names no language is English, not the interface's.
    await openDoc(page, 'flow-report');
    await expect(viewer(page).locator('[data-od-page]').first()).toHaveAttribute('lang', 'en');
  });

  test('the sheet sets CJK text with kinsoku and CJK–Latin spacing', async ({ page }) => {
    await openDoc(page, 'alpha');
    const style = await viewer(page)
      .locator('[data-od-page]')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { lineBreak: cs.lineBreak, autospace: cs.getPropertyValue('text-autospace') };
      });
    expect(style).toEqual({ lineBreak: 'strict', autospace: 'normal' });
  });
});

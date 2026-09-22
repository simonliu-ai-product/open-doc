import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openDoc } from './helpers.ts';

async function download(page: Page, format: string, range?: string) {
  const file = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Download' }).click();
  if (range) {
    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByRole('textbox', { name: 'Pages to download' }).fill(range);
  }
  await page.getByRole('menuitem', { name: format }).click();
  const done = await file;
  const chunks: Buffer[] = [];
  for await (const chunk of await done.createReadStream()) chunks.push(chunk as Buffer);
  return { name: done.suggestedFilename(), bytes: new Uint8Array(Buffer.concat(chunks)) };
}

/** The package's XML parts by path; pictures only by name. */
function docx(bytes: Uint8Array): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    parts[name] = name.startsWith('word/media/') ? '' : strFromU8(data);
  }
  return parts;
}

/** What a reader would see of a part: its text runs, joined. */
function textOf(xml = ''): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');
}

test.describe('export', () => {
  test('HTML export downloads a self-contained document', async ({ page }) => {
    await openDoc(page, 'alpha');
    const { name, bytes } = await download(page, 'HTML');
    expect(name).toBe('alpha.html');
    const html = strFromU8(bytes);

    // Every sheet is serialized, and nothing points back at the dev server.
    expect(html).toContain('Alpha page one');
    expect(html).toContain('Alpha page three');
    expect(html).not.toContain('/@vite/client');
  });

  test('a flow document exports every packed page', async ({ page }) => {
    await openDoc(page, 'flow-report');
    const html = strFromU8((await download(page, 'HTML')).bytes);

    expect(html).toContain('Flow paragraph 1.');
    expect(html).toContain('Flow paragraph 40.');
    // The running footer is resolved at export time, not left as a placeholder.
    expect(html).toMatch(/Flow Report — page \d+ of \d+/);
  });

  test('DOCX export is a Word document with real headings, footnotes, and tables', async ({
    page,
  }) => {
    await openDoc(page, 'long-form');
    const { name, bytes } = await download(page, 'DOCX');
    expect(name).toBe('long-form.docx');

    const parts = docx(bytes);
    const document = parts['word/document.xml'] ?? '';
    const body = textOf(document);
    // A heading style, so Word's navigation pane and table of contents find it.
    expect(document).toMatch(/<w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>).)*>Findings</);
    expect(document).toContain('<w:tbl>');
    // Numbers and references resolved before the text was read.
    expect(body).toContain('Table 1 — Fixture rows');
    expect(body).toMatch(/The table is Table 1(?: \(p\. \d+\))? and the drawing is Figure 1/);
    // Both notes — the cover's and the flow section's — are Word footnotes.
    expect(document.match(/<w:footnoteReference /g)).toHaveLength(2);
    const notes = textOf(parts['word/footnotes.xml']);
    expect(notes).toContain('Collected from the page, not from the flow.');
    expect(notes).toContain('Measured from the fixture data.');
    // The drawn box has no text to keep, so it travels as a picture.
    expect(Object.keys(parts).some((part) => part.startsWith('word/media/'))).toBe(true);
    // Headings keep with what follows through their style, not cancelled one by one.
    expect(document).not.toMatch(/<w:pStyle w:val="Heading\d"\/><w:keepNext w:val="0"\/>/);
    // The list of figures quotes Word's own pages once fields update, as the contents do.
    expect(document).toContain('w:instr=" PAGEREF _od_drawing \\h "');
  });

  test('a flow section reflows as one run, and its footer becomes a Word footer', async ({
    page,
  }) => {
    await openDoc(page, 'flow-report');
    const parts = docx((await download(page, 'DOCX')).bytes);
    const document = parts['word/document.xml'] ?? '';
    const body = textOf(document);

    // Every block once — not once per sheet, and no page furniture in between.
    for (const n of [1, 20, 40]) expect(body.split(`Flow paragraph ${n}.`)).toHaveLength(2);
    expect(body).not.toContain('Flow Report — page');

    const footer = Object.entries(parts).find(
      ([part, xml]) => /^word\/footer\d+\.xml$/.test(part) && textOf(xml).includes('Flow Report'),
    )?.[1];
    expect(footer).toContain('w:instr=" PAGE "');
    expect(footer).toContain('w:instr=" NUMPAGES "');

    // Cover and body are two sections on the document's own sheet.
    expect(document.match(/<w:sectPr>/g)).toHaveLength(2);
    expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
  });

  test('a document without a design exports black ink, whatever the viewer theme', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openDoc(page, 'flow-report');
    const styles = docx((await download(page, 'DOCX')).bytes)['word/styles.xml'] ?? '';
    expect(styles).toMatch(/<w:rPrDefault><w:rPr>(?:(?!<\/w:rPr>).)*<w:color w:val="000000"\/>/);
  });

  test('DOCX export honours the page range', async ({ page }) => {
    await openDoc(page, 'flow-report');
    const body = textOf(docx((await download(page, 'DOCX', '1')).bytes)['word/document.xml']);
    expect(body).toContain('A fixed cover in front of a paginated body.');
    expect(body).not.toContain('Flow paragraph');
  });
});

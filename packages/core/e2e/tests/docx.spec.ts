import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openDoc, prepareScratchProject, runCli } from './helpers.ts';

type Parts = Record<string, string>;

function partsOf(bytes: Uint8Array): Parts {
  const out: Parts = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    out[name] = name.startsWith('word/media/') ? `<${data.length} bytes>` : strFromU8(data);
  }
  return out;
}

async function download(page: Page, docId: string): Promise<Parts> {
  await openDoc(page, docId);
  const downloaded = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('menuitem', { name: /Word/ }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe(`${docId}.docx`);
  return partsOf(await fs.readFile(await file.path()));
}

test.describe('Word export', () => {
  test.describe.configure({ timeout: 90_000 });

  test('carries structure Word can flow: styles, contents, notes, lists, tables, pictures', async ({
    page,
  }) => {
    const parts = await download(page, 'docx-sample');
    const doc = parts['word/document.xml'] ?? '';

    // The package itself.
    expect(parts['[Content_Types].xml']).toContain('wordprocessingml.document.main+xml');
    expect(parts['docProps/core.xml']).toContain('<dc:title>平台可靠度季報</dc:title>');

    // The cover keeps where it placed its words — low on the sheet, not at the
    // top margin, held by a spacer's line height since Word drops space before
    // at the top of a page — and its tracked capitals.
    const coverGap = Number(
      doc.match(/<w:body><w:p><w:pPr><w:spacing [^>]*w:line="(\d+)" w:lineRule="exact"\/>/)?.[1],
    );
    expect(coverGap).toBeGreaterThan(3000);

    // The fixed sheets sit in a section of their own with an empty footer; the
    // flow carries the running one.
    const rels = parts['word/_rels/document.xml.rels'] ?? '';
    const bare = rels.match(/Id="(rId\d+)"[^>]*Target="footer2\.xml"/)?.[1];
    const full = rels.match(/Id="(rId\d+)"[^>]*Target="footer1\.xml"/)?.[1];
    const sections = [
      ...doc.matchAll(/<w:sectPr><w:footerReference w:type="default" r:id="(rId\d+)"/g),
    ];
    expect(sections.map((match) => match[1])).toEqual([bare, full]);
    expect(doc).toMatch(
      /<w:caps\/>(?:(?!<\/w:r>).)*?<w:spacing w:val="\d+"\/>(?:(?!<\/w:r>).)*?Platform engineering/,
    );

    // The cover's title, the contents heading kept out of the contents, and the field.
    expect(doc).toMatch(/<w:pStyle w:val="Title"\/>.*?平台可靠度季報/);
    expect(doc).toMatch(/<w:pStyle w:val="TOCHeading"\/>.*?目錄/);
    expect(doc).toContain(' TOC \\o "1-3" \\h \\z \\u ');

    // Headings Word's navigation pane reads.
    expect(doc).toMatch(/<w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>).)*?一、方法/);
    expect(doc).toMatch(/<w:pStyle w:val="Heading2"\/>(?:(?!<\/w:p>).)*?觀察重點/);
    // The flow starts a new sheet through the section break that ends the fixed pages.
    expect(doc).toMatch(
      /<\/w:sectPr><\/w:pPr><\/w:p><w:p><w:pPr><w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>).)*?一、方法/,
    );

    // Inline formatting read from computed style, and a real link.
    expect(doc).toMatch(/<w:b\/><w:bCs\/>(?:(?!<\/w:r>).)*?請求日誌/);
    expect(doc).toMatch(/<w:i\/><w:iCs\/>(?:(?!<\/w:r>).)*?帳單匯出/);
    expect(doc).toMatch(/w:ascii="Menlo"(?:(?!<\/w:r>).)*?ops\/reliability\.yaml/);
    expect(parts['word/_rels/document.xml.rels']).toContain(
      'Target="https://example.com/method" TargetMode="External"',
    );
    expect(doc).toMatch(/<w:hyperlink r:id="rId\d+">(?:(?!<\/w:hyperlink>).)*?方法說明/);

    // A real Word footnote, not text at the foot of a page.
    expect(doc).toContain('<w:footnoteReference w:id="1"/>');
    expect(parts['word/footnotes.xml']).toContain('日誌管線，2026-07-01 至 2026-09-30。');

    // Two lists, each with its own numbering.
    expect(doc.match(/<w:numId w:val="1"\/>/g)).toHaveLength(2);
    expect(doc.match(/<w:numId w:val="2"\/>/g)).toHaveLength(2);
    expect(parts['word/numbering.xml']).toContain(
      '<w:num w:numId="2"><w:abstractNumId w:val="1"/>',
    );

    // The table: header row repeats, labels and figures as printed, caption styled.
    expect(doc).toContain('<w:tblHeader/>');
    expect(doc).toMatch(/<w:tc>.*?服務.*?請求數.*?月費/);
    expect(doc).toContain('18,402,111');
    expect(doc).toMatch(/<w:pStyle w:val="Caption"\/>(?:(?!<\/w:p>).)*?各服務用量/);
    expect(doc).toMatch(
      /<w:bookmarkStart w:id="\d+" w:name="od_[^"]+"\/>(?:(?!<\/w:p>).)*?各服務用量/,
    );

    // The drawing as a picture, with its caption.
    expect(Object.keys(parts).some((name) => name.startsWith('word/media/image'))).toBe(true);
    expect(doc).toContain('<wp:inline');
    expect(doc).toMatch(/<w:pStyle w:val="Caption"\/>(?:(?!<\/w:p>).)*?每月費用與請求量/);

    // Code keeps its indentation.
    expect(doc).toMatch(
      /<w:pStyle w:val="Code"\/>.*?<w:t xml:space="preserve"> {2}transcode: async<\/w:t>/,
    );

    // CJK: the theme's font survives as the East Asian font.
    expect(parts['word/styles.xml']).toContain(
      '<w:rFonts w:ascii="Helvetica Neue" w:hAnsi="Helvetica Neue" w:eastAsia="Noto Sans TC"',
    );

    // A4, and the flow footer with Word's own page numbers.
    expect(doc).toContain('<w:pgSz w:w="11910" w:h="16845"/>');
    const footer = parts['word/footer1.xml'] ?? '';
    expect(footer).toContain('平台可靠度季報');
    expect(footer).toContain('<w:fldSimple w:instr=" PAGE ">');
    expect(footer).toContain('<w:fldSimple w:instr=" NUMPAGES ">');
  });

  test('a fixed-page document exports too, each sheet starting a page', async ({ page }) => {
    const parts = await download(page, 'alpha');
    const doc = parts['word/document.xml'] ?? '';
    expect(doc).toContain('Alpha page one');
    expect(doc).toContain('Alpha page three');
    expect(doc.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    expect(parts['word/footer1.xml']).toBeUndefined();
  });

  test('the CLI writes the same file headlessly', async () => {
    const dir = prepareScratchProject('cli-docx');
    const exported = await runCli(
      ['export', 'docx-sample', '--format', 'docx', '--out-dir', 'out'],
      dir,
    );
    expect(exported.code, exported.stderr).toBe(0);
    const bytes = await fs.readFile(path.join(dir, 'out', 'docx-sample.docx'));
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const parts = partsOf(bytes);
    expect(parts['word/document.xml']).toContain('一、方法');
    expect(parts['word/footnotes.xml']).toContain('日誌管線');
  });
});

import { collectCss, downloadBlob, downloadBundle, renderPagesToHtml } from './export-dom';
import { designDeclarations, htmlToSvg, inlineAssets, rasterise } from './rasterize';
import { type DocModule, resolvePageGeometry } from './sdk';
import type { ExpandedPage } from './use-doc-pages';

export type ImageFormat = 'png' | 'svg';

export type ImageExportProgress = {
  phase: 'rendering' | 'embedding' | 'drawing' | 'done';
  current: number;
  total: number;
  percent: number;
};

export async function exportDocAsImages(
  doc: DocModule,
  docId: string,
  pages: ExpandedPage[],
  format: ImageFormat,
  onProgress?: (progress: ImageExportProgress) => void,
): Promise<void> {
  if (pages.length === 0) return;

  const total = pages.length;
  const geometry = resolvePageGeometry(doc.meta);
  const report = (phase: ImageExportProgress['phase'], current: number, percent: number) =>
    onProgress?.({ phase, current, total, percent });

  report('rendering', 0, 2);
  const pagesHtml = await renderPagesToHtml(pages, doc);

  report('embedding', 0, 20);
  const { css, html } = await inlineAssets(collectCss(), pagesHtml);
  const declarations = designDeclarations(doc);

  const files: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < html.length; i++) {
    const svg = htmlToSvg(html[i] ?? '', css, geometry, declarations);
    const name = `${docId}-${String(i + 1).padStart(2, '0')}`;
    if (format === 'svg') {
      files.push({ name: `${name}.svg`, blob: new Blob([svg], { type: 'image/svg+xml' }) });
    } else {
      report('drawing', i + 1, 20 + Math.round(((i + 1) / total) * 75));
      files.push({ name: `${name}.png`, blob: await rasterise(svg, geometry) });
    }
  }

  report('done', total, 100);
  await deliver(files, docId, format);
}

async function deliver(
  files: { name: string; blob: Blob }[],
  docId: string,
  format: ImageFormat,
): Promise<void> {
  const only = files[0];
  if (files.length === 1 && only) {
    downloadBlob(only.blob, only.name);
    return;
  }
  const { zipSync } = await import('fflate');
  const tree: Record<string, Uint8Array> = {};
  for (const file of files) tree[file.name] = new Uint8Array(await file.blob.arrayBuffer());
  downloadBundle({
    filename: `${docId}-${format}.zip`,
    mimeType: 'application/zip',
    bytes: zipSync(tree as Parameters<typeof zipSync>[0]),
  });
}

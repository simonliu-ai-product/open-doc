import chalk from 'chalk';
import { closeRenderSession, type ExportFormat, exportDocument, listDocIds } from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface ExportOptions {
  format?: ExportFormat;
  outDir?: string;
  all?: boolean;
}

const FORMATS: ExportFormat[] = ['pdf', 'html', 'png'];

/**
 * The Download menu without a browser window — the same render pipeline, driven
 * from a script. This is what makes a document something CI can produce on a
 * schedule rather than something a person has to click.
 */
export async function exportDocs(docIds: string[], opts: ExportOptions = {}): Promise<void> {
  const format = opts.format ?? 'pdf';
  if (!FORMATS.includes(format)) {
    throw new Error(`Unknown format "${format}". Expected one of: ${FORMATS.join(', ')}`);
  }

  const ctx = await cliContext();
  const targets = docIds.length > 0 ? docIds : opts.all ? await listDocIds(ctx) : [];
  if (targets.length === 0) {
    throw new Error('Nothing to export. Name a document id, or pass --all.');
  }

  try {
    for (const docId of targets) {
      const result = await exportDocument(ctx, docId, {
        format,
        ...(opts.outDir !== undefined ? { outDir: opts.outDir } : {}),
      });
      const files = result.files.join(', ');
      process.stdout.write(
        `${chalk.green('✓')} ${chalk.bold(docId)} ${chalk.dim(`${result.pageCount}p`)} → ${files}\n`,
      );
    }
  } finally {
    await closeRenderSession();
  }
}

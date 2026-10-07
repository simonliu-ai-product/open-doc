import chalk from 'chalk';
import {
  closeRenderSession,
  EXPORT_FORMATS,
  type ExportFormat,
  exportDocument,
  listDocIds,
} from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface ExportOptions {
  format?: ExportFormat;
  outDir?: string;
  all?: boolean;
  /** One copy per row of the document's `records`. */
  each?: boolean;
  /** With `each`: the file name pattern — `{column}`, `{#}`. */
  name?: string;
}

const FORMATS: readonly ExportFormat[] = EXPORT_FORMATS;

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
        ...(opts.each ? { each: true } : {}),
        ...(opts.name !== undefined ? { name: opts.name } : {}),
      });
      if (result.records !== undefined) {
        process.stdout.write(
          `${chalk.green('✓')} ${chalk.bold(docId)} ${chalk.dim(`${result.records} records, ${result.pageCount}p`)} → ${result.files.length} files\n`,
        );
        for (const file of result.files) process.stdout.write(chalk.dim(`  ${file}\n`));
        continue;
      }
      const files = result.files.join(', ');
      process.stdout.write(
        `${chalk.green('✓')} ${chalk.bold(docId)} ${chalk.dim(`${result.pageCount}p`)} → ${files}\n`,
      );
    }
  } finally {
    await closeRenderSession();
  }
}

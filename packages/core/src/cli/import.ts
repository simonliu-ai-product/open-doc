import path from 'node:path';
import chalk from 'chalk';
import { importMarkdown } from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface ImportOptions {
  id?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  pageSize?: string;
  cover?: boolean;
  contents?: boolean;
}

export async function importDoc(file: string, opts: ImportOptions = {}): Promise<void> {
  const ctx = await cliContext();
  const relative = path.relative(ctx.userCwd, path.resolve(ctx.userCwd, file));

  const result = await importMarkdown(ctx, {
    file: relative,
    ...(opts.id !== undefined ? { docId: opts.id } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.subtitle !== undefined ? { subtitle: opts.subtitle } : {}),
    ...(opts.author !== undefined ? { author: opts.author } : {}),
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
    ...(opts.pageSize !== undefined ? { pageSize: opts.pageSize } : {}),
    ...(opts.cover !== undefined ? { cover: opts.cover } : {}),
    ...(opts.contents !== undefined ? { contents: opts.contents } : {}),
  });

  process.stdout.write(
    `${chalk.green('✓')} ${chalk.bold(result.title)} → ${result.entry} ${chalk.dim(`(${result.blocks} blocks)`)}\n`,
  );
  if (result.assets.length > 0) {
    process.stdout.write(chalk.dim(`  copied ${result.assets.length} asset(s)\n`));
  }
  for (const missing of result.missingAssets) {
    process.stdout.write(chalk.yellow(`  ! image not found, left as written: ${missing}\n`));
  }
}

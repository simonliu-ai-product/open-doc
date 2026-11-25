import chalk from 'chalk';
import { markTranslated, type TranslationStatus, translationStatus } from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface TranslationsOptions {
  json?: boolean;
  diff?: boolean;
  mark?: string;
  at?: string;
}

const STATE: Record<TranslationStatus['state'], string> = {
  current: chalk.green('up to date'),
  stale: chalk.yellow('behind its source'),
  unsynced: chalk.yellow('never marked — run with --mark once it matches'),
  'missing-source': chalk.red('source document not found'),
  'unknown-revision': chalk.red('translatedAt is not a known commit'),
  'no-git': chalk.dim('not a git repository — changes cannot be traced'),
};

/**
 * Lists translations (`meta.translationOf`) and whether their source changed
 * since the commit they were translated from; `--mark <id>` records that one
 * has caught up. Exits non-zero when any is behind, so it works as a CI gate.
 */
export async function translations(
  docId: string | undefined,
  opts: TranslationsOptions = {},
): Promise<void> {
  const ctx = await cliContext();
  if (opts.mark) {
    const done = await markTranslated(ctx, opts.mark, opts.at);
    if (opts.json) process.stdout.write(`${JSON.stringify(done, null, 2)}\n`);
    else
      process.stdout.write(
        `${chalk.bold(done.id)} matches ${done.of} @ ${chalk.dim(done.translatedAt.slice(0, 7))}\n`,
      );
    return;
  }

  const list = await translationStatus(ctx, { docId, diff: opts.diff });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
  } else if (list.length === 0) {
    process.stdout.write('No translations: no document declares meta.translationOf.\n');
  } else {
    for (const t of list) {
      const langs = [t.sourceLang, t.lang].filter(Boolean).join(' → ');
      process.stdout.write(
        `${chalk.bold(t.id)} ${chalk.dim(`of ${t.of}${langs ? ` (${langs})` : ''}`)} — ${STATE[t.state]}\n`,
      );
      for (const c of t.commits) process.stdout.write(`    ${chalk.dim(c.short)} ${c.subject}\n`);
      for (const f of t.changedFiles) process.stdout.write(`    ${chalk.yellow('M')} ${f}\n`);
      if (t.diff) process.stdout.write(`${t.diff}${t.diffTruncated ? '\n… (cut)\n' : ''}\n`);
    }
  }
  if (list.some((t) => t.state !== 'current' && t.state !== 'no-git')) process.exitCode = 1;
}

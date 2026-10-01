import chalk from 'chalk';
import { diffDocument, type PageChange } from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface DiffOptions {
  since?: string;
  outDir?: string;
  json?: boolean;
}

const MARK: Record<PageChange['status'], string> = {
  same: chalk.dim('·'),
  changed: chalk.yellow('~'),
  added: chalk.green('+'),
  removed: chalk.red('-'),
};

function where(change: PageChange): string {
  if (change.status === 'removed') return `p.${change.before} (removed)`;
  if (change.before !== null && change.before !== change.after) {
    return `p.${change.after} (was p.${change.before})`;
  }
  return `p.${change.after}`;
}

/**
 * Renders the document as it is and as it was at a revision, and reports what
 * changed page by page — on the terminal, and as a self-contained HTML report a
 * reviewer can open without the repository.
 */
export async function diffDoc(docId: string, opts: DiffOptions = {}): Promise<void> {
  const ctx = await cliContext();
  const result = await diffDocument(ctx, docId, {
    ...(opts.since ? { since: opts.since } : {}),
    ...(opts.outDir ? { outDir: opts.outDir } : {}),
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const moved = result.pages.filter((page) => page.status !== 'same');
  process.stdout.write(
    `${chalk.bold(docId)} ${chalk.dim(`since ${result.since} (${result.commit.slice(0, 7)})`)} — ${
      moved.length === 0
        ? chalk.green('no changes')
        : `${moved.length} of ${result.pages.length} page(s) changed`
    }\n`,
  );
  for (const change of moved) {
    process.stdout.write(`  ${MARK[change.status]} ${where(change)}\n`);
    for (const line of change.lines.slice(0, 6)) {
      const text = line.text.length > 90 ? `${line.text.slice(0, 89)}…` : line.text;
      process.stdout.write(
        `      ${line.op === 'add' ? chalk.green(`+ ${text}`) : chalk.red(`- ${text}`)}\n`,
      );
    }
    if (change.lines.length > 6) {
      process.stdout.write(chalk.dim(`      … ${change.lines.length - 6} more line(s)\n`));
    }
  }
  process.stdout.write(`${chalk.dim('report')} ${result.file}\n`);
}

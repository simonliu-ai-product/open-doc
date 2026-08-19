import chalk from 'chalk';
import { checkLayout, closeRenderSession, type LayoutFinding, listDocIds } from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface CheckOptions {
  all?: boolean;
  json?: boolean;
}

function line(finding: LayoutFinding): string {
  const where = finding.page > 0 ? `p.${finding.page}` : 'doc';
  const mark = finding.severity === 'error' ? chalk.red('✗') : chalk.yellow('!');
  const detail = [finding.element, finding.loc && chalk.dim(`@ ${finding.loc}`)]
    .filter(Boolean)
    .join('  ');
  return `  ${mark} ${chalk.dim(where.padEnd(5))} ${finding.message}${detail ? `\n      ${chalk.dim(detail)}` : ''}`;
}

/**
 * Renders every sheet at true page size and reports the layout faults an agent
 * writing React cannot see: content clipped by the page edge, an empty sheet, a
 * heading stranded at the foot of a page, type too small to print.
 *
 * Exits non-zero when anything is an error, so it works as a CI gate.
 */
export async function checkDocs(docIds: string[], opts: CheckOptions = {}): Promise<void> {
  const ctx = await cliContext();
  const targets = docIds.length > 0 ? docIds : await listDocIds(ctx);
  if (targets.length === 0) throw new Error('No documents found under docs/.');

  let errors = 0;
  const reports = [];

  try {
    for (const docId of targets) {
      const report = await checkLayout(ctx, docId);
      reports.push(report);
      errors += report.errors;

      if (opts.json) continue;

      const summary =
        report.errors === 0 && report.warnings === 0
          ? chalk.green('clean')
          : [
              report.errors > 0 ? chalk.red(`${report.errors} error(s)`) : '',
              report.warnings > 0 ? chalk.yellow(`${report.warnings} warning(s)`) : '',
            ]
              .filter(Boolean)
              .join(', ');

      process.stdout.write(
        `${chalk.bold(docId)} ${chalk.dim(`${report.pageCount} pages`)} — ${summary}\n`,
      );
      for (const finding of report.findings) process.stdout.write(`${line(finding)}\n`);
    }
  } finally {
    await closeRenderSession();
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
  if (errors > 0) process.exitCode = 1;
}

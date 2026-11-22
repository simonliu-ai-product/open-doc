import chalk from 'chalk';
import {
  closeRenderSession,
  listDocIds,
  type ProofreadFinding,
  type ProofreadReport,
  proofreadDocument,
} from '../ops/index.ts';
import { cliContext } from './context.ts';

export interface ProofreadOptions {
  json?: boolean;
}

function line(finding: ProofreadFinding): string {
  const where = `p.${finding.page}`;
  const detail = [chalk.dim(`${finding.rule}`), finding.loc && chalk.dim(`@ ${finding.loc}`)]
    .filter(Boolean)
    .join('  ');
  return `  ${chalk.yellow('!')} ${chalk.dim(where.padEnd(5))} ${finding.message}\n      ${chalk.dim(finding.snippet)}\n      ${detail}`;
}

/**
 * Reads the text every sheet prints and reports consistency slips. It is
 * advice, so it exits zero even with findings; `check` is the gate.
 */
export async function proofreadDocs(docIds: string[], opts: ProofreadOptions = {}): Promise<void> {
  const ctx = await cliContext();
  const targets = docIds.length > 0 ? docIds : await listDocIds(ctx);
  if (targets.length === 0) throw new Error('No documents found under docs/.');

  const reports: ProofreadReport[] = [];
  try {
    for (const docId of targets) {
      const report = await proofreadDocument(ctx, docId);
      reports.push(report);
      if (opts.json) continue;

      const summary =
        report.warnings === 0
          ? chalk.green('clean')
          : chalk.yellow(
              `${report.warnings} warning(s)${report.omitted > 0 ? `, ${report.omitted} more not shown` : ''}`,
            );
      process.stdout.write(
        `${chalk.bold(docId)} ${chalk.dim(`${report.pageCount} pages · ${report.lang}`)} — ${summary}\n`,
      );
      for (const finding of report.findings) process.stdout.write(`${line(finding)}\n`);
    }
  } finally {
    await closeRenderSession();
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
}

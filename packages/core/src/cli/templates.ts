import chalk from 'chalk';
import { createFromTemplate, listTemplates } from '../ops/index.ts';
import { cliContext } from './context.ts';

/**
 * Every template a document can start from, with the name `new --template`
 * takes in the first column — the list is the documentation of the names.
 */
export async function printTemplates(opts: { json?: boolean } = {}): Promise<void> {
  const ctx = await cliContext();
  const templates = await listTemplates(ctx);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(templates, null, 2)}\n`);
    return;
  }
  const width = Math.max(...templates.map((t) => t.name.length), 4);
  for (const template of templates) {
    const where = template.source === 'workspace' ? chalk.cyan(' (this workspace)') : '';
    process.stdout.write(
      `  ${chalk.bold(template.name.padEnd(width))}  ${template.title}${where}\n` +
        (template.description
          ? `  ${' '.repeat(width)}  ${chalk.dim(template.description)}\n`
          : ''),
    );
  }
  process.stdout.write(
    chalk.dim(`\nopen-doc new <id> --template <name>   ·   your own: templates/<name>/index.tsx\n`),
  );
}

export interface NewOptions {
  template?: string;
  title?: string;
}

export async function newDoc(docId: string | undefined, opts: NewOptions = {}): Promise<void> {
  const ctx = await cliContext();
  const result = await createFromTemplate(ctx, {
    template: opts.template ?? 'blank',
    ...(docId ? { docId } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
  });
  process.stdout.write(
    `${chalk.green('✓')} ${chalk.bold(result.id)} → ${result.entry} ${chalk.dim(`(from ${opts.template ?? 'blank'})`)}\n`,
  );
}

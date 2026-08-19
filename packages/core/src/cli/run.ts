import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { detectSkillsDrift, syncSkills } from './sync.ts';

async function readVersion(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/cli/bin.js → ../../package.json
  const pkgPath = path.resolve(here, '..', '..', 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}

export function parsePort(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return n;
}

interface ServerFlags {
  port?: number;
  host?: string | boolean;
  open?: boolean;
}

interface DevFlags extends ServerFlags {
  skillsCheck?: boolean;
}

interface BuildFlags {
  outDir?: string;
}

interface SyncFlags {
  dryRun?: boolean;
}

interface ExportFlags {
  format?: string;
  outDir?: string;
  all?: boolean;
}

interface CheckFlags {
  all?: boolean;
  json?: boolean;
}

interface ImportFlags {
  id?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  pageSize?: string;
  cover?: boolean;
  contents?: boolean;
}

function resolveBuiltinSkillsDir(): string {
  // dist/cli/bin.js → ../../skills (package root + /skills)
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'skills');
}

async function runSkillsDriftCheck(skillsDir: string): Promise<void> {
  if (process.env.OPEN_DOC_SKIP_SKILLS_CHECK === '1') return;

  let drift: Awaited<ReturnType<typeof detectSkillsDrift>>;
  try {
    drift = await detectSkillsDrift(skillsDir);
  } catch {
    return;
  }
  const stale = drift.filter((d) => d.status !== 'unchanged');
  if (stale.length === 0) return;

  const names = stale.map((d) => d.name).join(', ');
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!interactive) {
    process.stderr.write(
      `${chalk.yellow('!')} Skills out of date (${names}). Run \`open-doc sync:skills\` to update.\n`,
    );
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(
        `${chalk.yellow('!')} Skills out of date: ${chalk.bold(names)}. Sync now? ${chalk.dim('(Y/n) ')}`,
      )
    )
      .trim()
      .toLowerCase();
    if (answer === '' || answer === 'y' || answer === 'yes') {
      await syncSkills(skillsDir);
    } else {
      process.stdout.write(chalk.dim('Skipped. Run `open-doc sync:skills` later to update.\n'));
    }
  } finally {
    rl.close();
  }
}

export async function run(argv: string[]): Promise<void> {
  const version = await readVersion();

  const program = new Command();
  program
    .name('open-doc')
    .description('Author documents — we handle the Vite/React stack, pagination, and export.')
    .version(version, '-v, --version', 'print version')
    .helpOption('-h, --help', 'show help')
    .showHelpAfterError(chalk.dim('(run `open-doc --help` for usage)'));

  program
    .command('dev')
    .description('Start the dev server')
    .addOption(new Option('-p, --port <port>', 'port to listen on').argParser(parsePort))
    .addOption(new Option('--host [host]', 'expose on the network (optional host)'))
    .option('--open', 'open the browser on start')
    .option('--no-skills-check', 'skip the built-in skills drift check')
    .option('--mcp', 'serve an MCP endpoint at /mcp (requires @open-document/mcp)')
    .action(async (flags: DevFlags) => {
      if (flags.skillsCheck !== false) {
        await runSkillsDriftCheck(resolveBuiltinSkillsDir());
      }
      const { dev } = await import('./dev.ts');
      await dev(flags);
    });

  program
    .command('build')
    .description('Build a static site')
    .option('--out-dir <dir>', 'output directory (defaults to `dist`)')
    .action(async (flags: BuildFlags) => {
      const { build } = await import('./build.ts');
      await build(flags);
    });

  program
    .command('preview')
    .description('Preview the production build')
    .addOption(new Option('-p, --port <port>', 'port to listen on').argParser(parsePort))
    .addOption(new Option('--host [host]', 'expose on the network (optional host)'))
    .option('--open', 'open the browser on start')
    .action(async (flags: ServerFlags) => {
      const { preview } = await import('./preview.ts');
      await preview(flags);
    });

  program
    .command('export [docIds...]')
    .description('Render documents headlessly to PDF, HTML, or PNG')
    .addOption(new Option('-f, --format <format>', 'output format').choices(['pdf', 'html', 'png']))
    .option('-o, --out-dir <dir>', 'directory to write into (defaults to `out`)')
    .option('--all', 'export every document under docs/')
    .action(async (docIds: string[], flags: ExportFlags) => {
      const { exportDocs } = await import('./export.ts');
      await exportDocs(docIds, flags as Parameters<typeof exportDocs>[1]);
    });

  program
    .command('check [docIds...]')
    .description('Report layout faults — clipped content, blank sheets, stranded headings')
    .option('--json', 'print the full report as JSON')
    .action(async (docIds: string[], flags: CheckFlags) => {
      const { checkDocs } = await import('./check.ts');
      await checkDocs(docIds, flags);
    });

  program
    .command('import <file>')
    .description('Turn a Markdown file into a document under docs/')
    .option('--id <id>', 'document id (defaults to a slug of the title)')
    .option('--title <title>', 'override the title')
    .option('--subtitle <subtitle>', 'subtitle, also used as the cover eyebrow')
    .option('--author <author>', 'author line on the cover')
    .option('--theme <theme>', 'theme id to back-link from meta.theme')
    .addOption(
      new Option('--page-size <size>', 'page size').choices(['A4', 'Letter', 'A5', 'Legal']),
    )
    .option('--no-cover', 'skip the title page')
    .option('--contents', 'add a self-filling contents page')
    .action(async (file: string, flags: ImportFlags) => {
      const { importDoc } = await import('./import.ts');
      await importDoc(file, flags);
    });

  program
    .command('sync:skills')
    .description('Sync built-in skills from @open-document/core into this workspace')
    .option('--dry-run', 'show what would change without writing')
    .action(async (flags: SyncFlags) => {
      const { syncSkills } = await import('./sync.ts');
      await syncSkills(resolveBuiltinSkillsDir(), flags);
    });

  await program.parseAsync(argv, { from: 'user' });
}

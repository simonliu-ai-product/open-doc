import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { addDocFromTemplate, listDocTemplates } from './doc-templates.ts';
import { gitInitAndCommit } from './git.ts';
import type { PackageManager } from './package-manager.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(HERE, '..', 'template');
const IS_WINDOWS = process.platform === 'win32';

export interface InitOptions {
  dir: string;
  force: boolean;
  name: string | undefined;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  /** A document template to start the workspace with, beside the guides. */
  template?: string;
}

export function sanitizeDirName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '.' || trimmed === '..') return trimmed;
  const cleaned = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^\\\p{L}\p{N}_./-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-*([/\\])-*/g, '$1');
  if (cleaned === '' || /^[/\\]+$/.test(cleaned)) return 'my-docs';
  return cleaned;
}

export async function isDirNonEmpty(target: string): Promise<boolean> {
  if (!existsSync(target)) return false;
  const entries = await readdir(target);
  return entries.some((e) => !e.startsWith('.'));
}

declare const __CORE_VERSION_AT_BUILD__: string;

function coreVersionRange(): string {
  return `^${__CORE_VERSION_AT_BUILD__}`;
}

async function linkOrCopy(relSrc: string, dst: string): Promise<void> {
  await rm(dst, { recursive: true, force: true });
  if (IS_WINDOWS) {
    await cp(resolve(dirname(dst), relSrc), dst, { recursive: true });
    return;
  }
  await symlink(relSrc, dst);
}

// The template carries one copy of the skills under `.agents/skills`; Claude
// Code reads `.claude/skills`. Link the two so both agents see one source.
async function materializeTemplateLinks(target: string): Promise<void> {
  const claudeMd = join(target, 'CLAUDE.md');
  if (!existsSync(claudeMd) && existsSync(join(target, 'AGENTS.md'))) {
    await linkOrCopy('AGENTS.md', claudeMd);
  }

  const agentsSkills = join(target, '.agents', 'skills');
  if (!existsSync(agentsSkills)) return;

  const claudeSkills = join(target, '.claude', 'skills');
  await mkdir(claudeSkills, { recursive: true });

  for (const entry of await readdir(agentsSkills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    await linkOrCopy(
      join('..', '..', '.agents', 'skills', entry.name),
      join(claudeSkills, entry.name),
    );
  }
}

async function runInstall(pm: PackageManager, cwd: string): Promise<void> {
  await new Promise<void>((res, rej) => {
    const child = spawn(pm, ['install'], { cwd, stdio: 'inherit', shell: IS_WINDOWS });
    child.on('error', rej);
    child.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`${pm} install exited with code ${code}`)),
    );
  });
}

export async function init(opts: InitOptions): Promise<void> {
  const { dir, force, name, packageManager, install, git, template } = opts;

  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error(
      `Template missing at ${TEMPLATE_DIR}. If you are running from source, run \`pnpm --filter @open-document/cli build\` first.`,
    );
  }

  // Checked before anything is written, so a mistyped name leaves no
  // half-made workspace behind.
  if (template) {
    const names = (await listDocTemplates()).map((entry) => entry.name);
    if (!names.includes(template)) {
      throw new Error(`No template named "${template}". Available: ${names.join(', ')}.`);
    }
  }

  const target = resolve(process.cwd(), dir);
  await mkdir(target, { recursive: true });

  if ((await isDirNonEmpty(target)) && !force) {
    throw new Error(`Target ${target} is not empty. Pass --force to scaffold into it anyway.`);
  }

  await cp(TEMPLATE_DIR, target, { recursive: true });
  await materializeTemplateLinks(target);
  const fromTemplate = template ? await addDocFromTemplate(target, template) : null;

  const pkgPath = join(target, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as Record<string, unknown> & {
      dependencies?: Record<string, string>;
    };
    pkg.name = name ?? basename(target);
    pkg.version = '0.0.0';
    pkg.private = true;
    if (pkg.dependencies?.['@open-document/core']) {
      pkg.dependencies['@open-document/core'] = coreVersionRange();
    }
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  await writeFile(
    join(target, '.gitignore'),
    'node_modules\ndist\nout\n.open-doc-diff\n.DS_Store\n',
  );

  // pnpm blocks postinstall scripts unless a package opts in, and Vite is dead
  // in the water without esbuild's — it never unpacks its platform binary.
  // Written unconditionally: `pnpm dlx` doesn't set npm_config_user_agent, so a
  // pnpm user can easily be detected as npm here, and the file is inert under
  // every other package manager.
  await writeFile(
    join(target, 'pnpm-workspace.yaml'),
    [
      '# Vite needs esbuild to unpack its platform binary during postinstall,',
      '# which pnpm only runs for packages listed here.',
      'allowBuilds:',
      '  esbuild: true',
      '  rolldown: true',
      '',
    ].join('\n'),
  );

  const cdTarget = dir === '.' ? basename(target) : dir;
  process.stdout.write(
    `\n${chalk.green.bold('✔ Created open-doc workspace')} ${chalk.dim(`in ${target}`)}\n`,
  );
  if (fromTemplate) {
    process.stdout.write(`${chalk.green('✔')} ${fromTemplate} ${chalk.dim(`from ${template}`)}\n`);
  }

  let installed = false;
  if (install) {
    process.stdout.write(`\n${chalk.bold(`Installing dependencies with ${packageManager}…`)}\n\n`);
    try {
      await runInstall(packageManager, target);
      installed = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(
        `\n${chalk.yellow('! Dependency install failed:')} ${chalk.dim(msg)}\n` +
          chalk.dim(`  You can retry manually with \`${packageManager} install\`.\n`),
      );
    }
  }

  if (git) {
    const result = await gitInitAndCommit(target);
    if (result.status === 'committed') {
      process.stdout.write(`${chalk.green('✔')} Initialized git repository with first commit.\n`);
    } else {
      process.stdout.write(
        `${chalk.yellow('!')} Git setup skipped: ${chalk.dim(result.message ?? '')}\n`,
      );
    }
  }

  process.stdout.write(`\n${chalk.bold('Next steps:')}\n`);
  process.stdout.write(`  ${chalk.cyan(`cd ${cdTarget}`)}\n`);
  if (!installed && install) {
    process.stdout.write(`  ${chalk.cyan(`${packageManager} install`)}\n`);
  } else if (!install) {
    process.stdout.write(
      `  ${chalk.cyan(`${packageManager} install`)}    ${chalk.dim('# install was skipped')}\n`,
    );
  }
  const devCommand = packageManager === 'npm' ? 'npm run dev' : `${packageManager} dev`;
  process.stdout.write(`  ${chalk.cyan(devCommand)}\n`);
}

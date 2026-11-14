import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE_SKILLS = path.join(ROOT, 'packages', 'core', 'skills');
const PLUGIN = path.join(ROOT, 'plugins', 'open-doc');

function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full, base) : [path.relative(base, full)];
  });
}

describe('Antigravity plugin', () => {
  it('ships the canonical skills unchanged (run `node scripts/sync-plugin-skills.mjs`)', () => {
    const core = files(CORE_SKILLS).sort();
    const plugin = files(path.join(PLUGIN, 'skills')).sort();
    expect(plugin).toEqual(core);
    for (const rel of core) {
      expect(readFileSync(path.join(PLUGIN, 'skills', rel), 'utf8'), rel).toBe(
        readFileSync(path.join(CORE_SKILLS, rel), 'utf8'),
      );
    }
  });

  // Antigravity loads only the first 24,000 bytes of a SKILL.md body.
  it('keeps every skill body within what Antigravity loads', () => {
    for (const name of readdirSync(CORE_SKILLS)) {
      const source = readFileSync(path.join(CORE_SKILLS, name, 'SKILL.md'));
      const bodyStart = source.indexOf('\n---\n', 4) + 5;
      expect(source.length - bodyStart, name).toBeLessThanOrEqual(24_000);
    }
  });

  it('launches the stdio server this package publishes', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, 'packages', 'mcp', 'package.json'), 'utf8'),
    ) as { name: string; bin: Record<string, string> };
    const config = JSON.parse(readFileSync(path.join(PLUGIN, 'mcp_config.json'), 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const { args } = config.mcpServers['open-doc'];
    expect(args).toContain(`${pkg.name}@latest`);
    expect(Object.keys(pkg.bin)).toContain(args.at(-1));
  });

  // Antigravity reads plugin.json and mcp_config.json; Claude Code reads
  // .claude-plugin/plugin.json, pointed at the same MCP file.
  it('serves Claude Code from the same folder and the repo marketplace', () => {
    const claude = JSON.parse(
      readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as { name: string; version: string; mcpServers: string };
    const antigravity = JSON.parse(readFileSync(path.join(PLUGIN, 'plugin.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(claude.mcpServers).toBe('./mcp_config.json');
    expect(claude.name).toBe(antigravity.name);
    expect(claude.version).toBe(antigravity.version);

    const marketplace = JSON.parse(
      readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
    ) as { plugins: { name: string; source: string }[] };
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({ name: claude.name, source: './plugins/open-doc' }),
    );
  });
});

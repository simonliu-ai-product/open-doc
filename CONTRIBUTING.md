# Contributing to open-doc

Thanks for your interest in improving open-doc! This guide covers the workflow for contributing to the framework itself — the `@open-document/core` runtime, the `@open-document/cli` scaffolder, the `@open-document/mcp` server, and the demo app.

If you're authoring documents inside a scaffolded project, you don't need this file — drive your report through your coding agent or edit `docs/<id>/index.tsx` directly.

## Ways to contribute

- **Report a bug** via the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.yml). Include a minimal reproduction.
- **Propose a feature** via the [feature request template](./.github/ISSUE_TEMPLATE/feature_request.yml). Describe the problem before the solution.
- **Ask a question or share what you're building** in [GitHub Discussions](https://github.com/simonliu-ai-product/open-doc/discussions).
- **Send a pull request** — see below.

For non-trivial changes, please open an issue or discussion first so we can align on direction before you invest the time.

## Repo layout

pnpm + Turbo monorepo.

| Path | Package | Role |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@open-document/core` | Runtime (document browser, page viewer, outline, themes, assets panel, design panel, PDF/HTML export), Vite plugins, dev API, `open-doc` dev/build CLI, canonical skills. |
| [`packages/cli`](packages/cli) | `@open-document/cli` | `npx @open-document/cli init` scaffolder + project template. |
| [`packages/mcp`](packages/mcp) | `@open-document/mcp` | MCP server exposing the `ops` layer over Streamable HTTP. Opt-in; mounted at `/mcp` by `open-doc dev --mcp`. |
| [`apps/demo`](apps/demo) | private | Local consumer of `@open-document/core` via `workspace:*`. The dogfood target for the framework. |

## Prerequisites

- **Node.js 24** and **pnpm 11** — both pinned in [`.mise.toml`](.mise.toml). `mise install` picks them up; otherwise `corepack enable` will honour the `packageManager` field in `package.json`.
- A Unix-y shell. Windows works via WSL.

## Getting set up

```bash
git clone https://github.com/simonliu-ai-product/open-doc.git
cd open-doc
pnpm install
```

Then run the demo against the local `@open-document/core`:

```bash
pnpm dev
```

`apps/demo` is the fastest way to exercise framework changes — edit `packages/core`, the demo hot-reloads.

**After changing `packages/core/src`, run `pnpm core build` before testing the demo.** Documents import the built `dist` bundle, not the source, so runtime-facing changes don't reach a document until core is rebuilt.

## Useful scripts

```bash
pnpm dev          # turbo: runs demo against local core
pnpm build        # build all packages
pnpm typecheck    # tsc across the graph
pnpm check        # biome (format + lint + organize imports)
pnpm check:fix    # auto-fix what biome can
pnpm test         # vitest
pnpm test:e2e     # playwright — builds core, then drives the e2e fixture project
```

Filter to one package:

```bash
pnpm core <script>   # e.g. pnpm core build
pnpm cli <script>
pnpm mcp <script>
```

## Pull request workflow

1. **Fork & branch.** Branch off `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`) and open the PR into `main`. The `latest` branch holds what was last released; leave it alone. Keep branches focused — one logical change per PR.
2. **Make your change.** Match the surrounding style. Don't reformat unrelated code.
3. **Run the checks before pushing:**
   ```bash
   pnpm check       # must pass — CI enforces it
   pnpm typecheck
   pnpm test
   ```
   `pnpm check:fix` will auto-fix most formatting and lint issues.
4. **Add a changeset if you touched `packages/core`, `packages/cli`, or `packages/mcp`:**
   ```bash
   pnpm changeset
   ```
   Pick the affected package(s) and the right bump:
   - `patch` — bug fixes, internal refactors, polish.
   - `minor` — new public API, additive features.
   - `major` — breaking changes.

   `apps/demo` and root tooling do **not** need a changeset.

   Keep the description **short and direct** — one line, present-tense, what changed from a user's perspective. No paragraphs, no rationale, no "this PR…".

   > Good: `Keep a table header with its first body row when a flow section breaks across pages.`
   >
   > Bad: `This change introduces smarter pagination because the previous packer sometimes left a header stranded…`

   Don't bump versions or edit `CHANGELOG.md` by hand — `changeset version` owns that.
5. **Open the PR.** Describe the problem, the change, and how you tested it. Link related issues. For layout or export changes, attach the exported PDF (or a screenshot of the affected pages) before and after.
6. **Address review feedback** by pushing follow-up commits. We'll squash on merge.

## Style & conventions

- **Biome must pass.** Formatting, lint, and import organisation are all enforced by `pnpm check`.
- **No casual dependencies.** The `core` runtime ships to users — every dep inflates install size. Prefer a small piece of inline code over a new package.
- **Default to writing no comments.** Only add one when the *why* is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug. Don't explain *what* the code does; well-named identifiers handle that.
- **Skills under `packages/core/skills/` are canonical.** `packages/cli/template/.agents/skills` is generated from them by `scripts/sync-template-skills.mjs` at build time — never edit the template copies by hand.
- **Page geometry lives in one place.** `resolvePageGeometry(meta)` owns the CSS-pixel page size and the `@page` descriptor. Never hardcode sheet dimensions anywhere else.
- **Mutations go through `src/ops/`.** The dev routes and the MCP tools both call it, so a validation rule is written once.

## Testing

- Unit tests run via `pnpm test` (Vitest). Add tests next to the code (`*.test.ts`) when fixing a bug or adding logic that warrants it. Pure logic — the flow packer, the design serializer, path safety — is expected to be covered.
- End-to-end tests run via `pnpm test:e2e` (Playwright). They build core, boot `open-doc dev` against `packages/core/e2e/fixture`, and cover the browser, the viewer, flow pagination, the inspector, the design panel, the dev API, HTML export, the static build, and the CLI. Anything touching those paths needs its case here. Run `npx playwright install chromium` once before the first run.
- For runtime/UI changes, verify the change in `apps/demo` **and in an export** (PDF and HTML), then describe what you exercised in the PR. The viewer and the exporters render the same pages through different paths; a fix that only lands in one of them is incomplete.

## Releases

Changes collect on `main`; the pinned **Upcoming release** issue lists what is waiting and the versions it would publish, and every PR merged into `main` gets a comment saying which version it is planned for. Releases are deliberate: the release workflow keeps a "chore: release packages" PR open through [changesets](https://github.com/changesets/changesets), and when the maintainer decides the set is ready, merging it publishes `@open-document/core`, `@open-document/cli` and `@open-document/mcp` to npm from CI with trusted publishing and moves the `latest` branch, which the agent plugin installs from. Contributors don't need to publish anything — just land the changeset alongside your code. The full rules are in `.claude/skills/release-flow/SKILL.md`.

## Questions

Open a [discussion](https://github.com/simonliu-ai-product/open-doc/discussions) — happy to help.

---
name: release-flow
description: How changes reach npm in open-doc — branch rules (feat/fix/chore → nightly → main), when and how to write a changeset, what to say when merging, and how a release is decided and cut. Use when starting a change, opening or merging a pull request, writing a changeset, or when someone asks to release, publish or bump a version.
---

# Release flow

Releases are deliberate. Changes collect on `nightly`; a release happens when the maintainer decides the collected set is worth shipping — never because one pull request merged.

## Branches

| Branch | Holds | Who writes to it |
| --- | --- | --- |
| `main` | What is on npm. Every commit here is a release or a hotfix. | Only a `nightly` → `main` pull request, the release bot's "chore: release packages" pull request, or a hotfix. Never commit to it directly. |
| `nightly` | Everything merged and waiting for the next release. CI checks it; nothing publishes from it. | Pull requests from work branches. |
| `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>` | One change in progress. | You. Branch from `nightly`, open the pull request back into `nightly`. |

## Making a change

1. `git switch nightly && git pull`, then `git switch -c feat/<topic>` (or `fix/`, `chore/`, `docs/`).
2. Commit with imperative subjects of 72 characters or fewer.
3. **Add a changeset** if the change alters what a published package does or ships: `pnpm changeset`, pick the packages and the bump.
   - `patch`: a fix; nothing anyone relies on changes.
   - `minor`: a feature, or (below 1.0) anything that changes the public surface — CLI flags, MCP tools, file formats, exported APIs, the host contract.
   - `major`: only when the maintainer decides to.
   - The summary is release notes for users: one or two sentences on what changed and why it matters to them. No internal file names, no ticket chatter.
   - Docs, CI, tests and the demo app need no changeset.
4. Run the checks before opening the pull request: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` (CI also runs the Playwright e2e suite).
5. Open the pull request into **`nightly`**. The body says what changed and why, which checks ran, and whether there is a changeset (or why not).
6. Merge with **squash**, so the commit on `nightly` ends with `(#N)` — the upcoming-release notes link back to it.

## When merging: say where it ships

Every pull request merged into `nightly` gets a comment naming the version it is planned for, e.g. "Planned for the next release: `@open-document/core` 0.4.2 → **0.5.0**". `.github/workflows/upcoming.yml` posts it. If that workflow did not run (or failed), post it yourself:

```bash
node scripts/upcoming-release.mjs --comment --files .changeset/<file>.md[,…] > /tmp/c.md
gh pr comment <N> --body-file /tmp/c.md
```

The same workflow keeps the pinned **"Upcoming release"** issue current on every push to `nightly`: the versions the next release would publish and one line per change. That issue is how everyone sees what has changed lately. To read it locally: `node scripts/upcoming-release.mjs --issue`.

## Deciding to release

Ask the maintainer before starting a release; propose one when these hold:

- The changes on `nightly` make a set worth announcing (a theme, not a grab bag), as the "Upcoming release" issue shows.
- `nightly` CI is green.
- The new behaviour has been used for real — a dev server, a linked workspace, a host app — not only in tests.
- Docs, READMEs and the shipped skills describe it.
- Nothing half-finished is on `nightly`. Unfinished work stays on its branch.

A **hotfix** is the only release that skips `nightly`: a fix that cannot wait goes on `fix/<topic>` branched from `main`, into `main` with a `patch` changeset, and `main` is then merged back into `nightly`.

## Cutting a release

1. Open a pull request **`nightly` → `main`** titled `Release: <theme in a few words>`, with the "Upcoming release" issue's text as its body.
2. Merge it with a **merge commit** (not squash), so `main` and `nightly` keep one history.
3. The Release workflow opens (or updates) **"chore: release packages"**: version bumps and CHANGELOG entries written from the changesets. Read the versions and the changelog text; fix wording by pushing to that pull request's branch.
4. Merging that pull request publishes to npm from CI with **trusted publishing** (no tokens, no local `npm login`), and creates the git tags and GitHub releases.
5. The Release workflow then opens **"Back-merge main into nightly"**; merge it with a merge commit, so `nightly` has the new versions and the used-up changesets are gone.
6. Check: `npm view @open-document/core version`. Comment on the release pull request with the published versions and the release link.

Never publish from a laptop (`npm publish`, `pnpm publish`). If CI cannot publish, fix the workflow or the trusted-publisher setting on npmjs.com.

## This repository

- Changeset summaries follow CONTRIBUTING.md here: one line, present tense, what changed from a user's view — no rationale, no "this PR…".
- Published packages: `@open-document/core`, `@open-document/cli`, `@open-document/mcp`. Each has its own version; a changeset names the ones it touches. `@open-document/mcp` has a peer range on core: when a change needs a newer core, give mcp a changeset too.
- `pnpm version-packages` runs `changeset version`; `pnpm release` builds the three packages and runs `changeset publish`. CHANGELOGs live in each package and are written by changesets — never edit versions or CHANGELOGs by hand.
- The agent plugin under `plugins/open-doc/` has its own version; bump it only when the plugin itself changes.
- Release pull requests can be opened by a GitHub App (`RELEASE_APP_CLIENT_ID` / `RELEASE_APP_PRIVATE_KEY`) so CI runs on them; without it they use `GITHUB_TOKEN` and CI does not run on them.

# open-doc — Framework Repo Guide

You are working on the **open-doc framework** — the runtime, CLI, and tooling that ship to npm.

(Document-authoring guidance lives in the `create-doc` / `doc-authoring` skills under `packages/core/skills/`. Those are for editing files inside `docs/`, not for editing the framework.)

## Layout

pnpm + Turbo monorepo.

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@open-document/core` | Runtime (document browser, page viewer, outline, themes, assets panel, design panel, PDF/HTML export), Vite plugins, dev API, headless render/diagnostics, Markdown import, `open-doc` CLI, canonical skills. |
| `packages/cli` | `@open-document/cli` | `npx @open-document/cli init` scaffolder + project template. |
| `packages/mcp` | `@open-document/mcp` | MCP server exposing the `ops` layer as tools over Streamable HTTP. Opt-in; mounted at `/mcp` by `open-doc dev --mcp`. |
| `apps/demo` | private | Local consumer of `@open-document/core` via `workspace:*`. Dogfood target — `pnpm dev:demo`. |

Shared config: `biome.json`, `turbo.json`, `pnpm-workspace.yaml`, `vitest.config.ts`, `tsconfig` per package.

## Workflow

```bash
pnpm dev          # turbo: runs the demo against local core
pnpm build        # build all packages
pnpm typecheck    # tsc across the graph
pnpm check        # biome (format + lint + organize imports)
pnpm check:fix    # auto-fix what biome can
pnpm test         # vitest
pnpm test:e2e     # playwright (builds core first, boots the e2e fixture project)
```

Filter to one package: `pnpm core <script>` / `pnpm cli <script>` / `pnpm mcp <script>`.

Releases go through changesets: `pnpm changeset` on any PR touching `packages/*`, then CI opens the release PR and publishes on merge. Never bump versions or edit `CHANGELOG.md` by hand.

**After changing `packages/core/src`, rebuild it (`pnpm core build`) before testing the demo** — documents import the published `dist` bundle, not the source.

## Architecture notes

- **Two copies of core exist at runtime.** The viewer imports `src/app/**`; a document imports the built `dist` bundle via `@open-document/core`. Anything that must be *shared* between them (React context, the outline store) is stashed on `globalThis` — see `src/app/lib/page-context.tsx` and `src/app/lib/outline.ts`. A new shared singleton must follow the same pattern or it will silently split in two.
- **Documents are discovered through a virtual module.** `src/vite/open-doc-plugin.ts` globs `docs/*/index.{tsx,jsx,ts,js}` and generates `virtual:open-doc/docs`, plus a cache-bust token per doc for hot reload.
- **The outline is a DOM scan, not a parse.** `collectOutline()` walks rendered page frames for headings. The viewer scans after fonts settle; both exporters scan their own offscreen copy before serializing, then restore the previous snapshot.
- **Two kinds of page entries.** `DocModule.default` is `DocEntry[]`: a component is one fixed sheet, a `flow()` section is continuous content the framework paginates. `lib/flow.ts` holds the pure packer (`paginateBlocks`, unit-tested), `lib/flow-measure.ts` does the offscreen DOM measurement, `lib/use-doc-pages.ts` joins them into the rendered page list that the viewer, the thumbnails, and both exporters all consume. Anything that used to read `doc.default` directly must go through `useDocPages`.
- **Page geometry is one function.** `resolvePageGeometry(meta)` owns the CSS-pixel size *and* the `@page` descriptor. Never hardcode 794 × 1123 anywhere else.
- **Document operations live in `src/ops/`, not in the routes.** `routes/docs.ts` and the MCP tools both call the same functions, so a conflict check or a validation rule is written once. An `OpsError` carries the HTTP status the transport should report. Anything new that mutates a document belongs there, not inline in a route.
- **`@open-document/mcp` is imported dynamically and is not a core dependency.** `mcp-plugin.ts` resolves it through a variable specifier — core must not take a build-time dependency on a package whose peer is core — and finds its entry by walking `node_modules` up from the *user's* workspace, because under pnpm's strict layout core cannot see a sibling it does not depend on, and `require.resolve` cannot read an ESM-only exports map. A missing install warns and disables the endpoint; it is never fatal.
- **Dev-only endpoints live behind `apply: 'serve'`.** `api-plugin.ts` mounts `/__assets/*` (routes under `vite/routes/`), `design-plugin.ts` mounts `/__design`. Every mutating handler calls `validateMutationRequest` first — these write to the user's disk. Path safety for assets is centralized in `files/assets.ts`; never join a user-supplied name onto a directory by hand.
- **The inspector edits source, not the DOM.** `loc-tags-plugin.ts` stamps `data-od-loc="line:col"` onto host JSX in document sources (dev only); the overlay reads that attribute, and `/__edit/*` (routes/edit.ts) applies the change through `editing/edit-ops.ts` (single text child only — anything else is refused) or writes a `@doc-comment` marker via `editing/comments.ts`. Markers are base64url JSON so a note can hold quotes and newlines.
- **The design panel edits source, not state.** `design-plugin.ts` parses `docs/<id>/index.tsx` with Babel, replaces only the `design` object's byte range, and rewrites the file. It accepts literal objects only; anything else is reported back to the panel rather than overwritten. Round-trip tests live in `design-plugin.test.ts` — extend them when you touch the serializer.
- **The browser is a two-pane shell.** `routes/home-shell.tsx` owns the left sidebar (nav counts, folders, theme toggle) and hands folder state to the routes through the outlet context — a route never fetches the manifest itself. The document view mirrors it: `components/doc-sidebar.tsx` is the left rail (page thumbnails / outline), the pages scroll in the middle, and the design panel docks right.
- **Folders live in `docs/.folders.json`.** The manifest is the only mutable state the framework owns; dev reads it live through `/__folders`, a static build reads the snapshot baked into `virtual:open-doc/folders`. Document ids never move — filing a document only edits assignments.
- **e2e runs against a fixture project, not the demo.** `packages/core/e2e/fixture` is a real workspace package (`docs/`, `themes/`, an `open-doc.config.ts`); `e2e/scratch.mjs` copies it into `e2e/.scratch/<name>` per run so tests that write to disk never dirty the committed sources. `pnpm test:e2e` builds core first, which is where CI's build coverage comes from. Thumbnails are page frames too — anything counting sheets must scope to `[data-od-viewer]`.
- **Headless rendering drives the real viewer.** `render/session.ts` boots a Vite server (or reuses `ctx.serverOrigin`), opens `/d/<id>` in Chromium, and talks to `window.__openDoc` — the bridge `app/lib/agent-bridge.ts` installs from the document route. `export`, `check`, `check_layout`, and `render_page` therefore all go through the same measured page list and the same print pipeline the Download menu uses; nothing re-implements layout on the Node side. Playwright is resolved through a variable specifier and declared only as an optional peer, and `render/session.ts` describes its API with local structural types so the published `.d.ts` never references it.
- **A page-level fault is found in the DOM, not inferred.** `app/lib/diagnostics.ts` walks the print copy at true sheet size and compares element rects against the page box. It is pure DOM work with no framework knowledge, which is why it catches faults in hand-written and generated documents alike. Findings carry the `data-od-loc` of the offending element — the same tag the inspector uses — so a report points at a source line.
- **`measuring` is derived, never stored.** `use-doc-pages.ts` compares the plan's `sections` identity against the current ones. A `useState` flag set from the effect reads false for one commit after a document loads, and in that window an unpaginated flow section looks like a single page — which silently corrupted the outline scan and every headless read.
- **Markdown import produces ordinary authored TSX.** `import/markdown.ts` is a hand-written parser (no dependency — `core` ships to every user) and `import/to-tsx.ts` renders blocks as inline-styled JSX with real heading tags and plain JSX text. Nothing about an imported document is special-cased: the outline, the inspector's text edits, and the design panel all work on it because it is shaped like a document a person would have written.
- **Numbering is a scan, like the outline.** `app/lib/labels.ts` walks rendered page frames for `data-od-label` and numbers figures, tables, and footnote markers per kind, in document order; `app/lib/scan.ts` runs it together with `collectOutline` so the two always describe the same copy. `<Figure>`, `<Ref>`, `<ListOf>`, and the footnote marker read that store, which means they are blank on the first render pass and correct on the next — the same lifecycle `<TableOfContents>` already had. The three call sites (viewer effect, `mountPrintCopy`, `renderPagesToHtml`) go through `scanDocument`/`captureScan`/`restoreScan`; never scan one without the other.
- **Footnotes are lifted before measurement, not collected during render.** `app/lib/footnotes.ts` walks a flow block's element tree and swaps each `<Footnote>` for a marker, returning the notes; `flow-measure.ts` measures them in the component that prints them, and `paginateBlocks` charges their height (plus the area's chrome, once per page) against the page budget. That ordering is the whole point: the space notes take is space the packer must not give to body content. The cost is that a `<Footnote>` hidden inside a helper component's body is invisible to the walk. Fixed pages use the runtime `FootnoteCollector` in `DocPageProvider` instead, with an explicit `<Footnotes />`; note bodies live in a ref there, never in state, because a `ReactNode` is a new object every render and storing one would make every commit look like a change.
- **Measure from the container's own box.** `stackedHeights` in `flow-measure.ts` takes offsets from `getBoundingClientRect`, not `offsetTop`: every measurement container shares one positioned host, so `offsetTop` is host-relative while the container's height is not, and mixing them measures the last node of every container after the first as zero.
- **Data files are modules, not fetches.** `vite/data-plugin.ts` loads `.csv`/`.tsv` into an array of objects at build time (`data/delimited.ts` is the hand-written parser — no dependency; `core` ships to every user). Nothing may load document data asynchronously: the packer measures the real DOM to decide page breaks, so data that arrives a tick later arrives after the layout is decided.
- **Diagrams are compiled, not drawn in the browser.** `vite/diagram-plugin.ts` turns `import chart from './x.mmd'` into a themed SVG string at build time, through the hand-written parser, layered layout, and renderer in `src/diagram/` (no dependency — `core` ships to every user). The reason is the packer, exactly as with `.csv`: a drawing that renders a tick later renders after the page break is decided. The renderer emits `--od-*` variables rather than literal colours, which is why a diagram prints in the document's own ink; anything new it draws must do the same. Text is measured without a DOM (`measureText`), since there is no browser in the plugin.
- **Themes are documentation.** `themes-plugin.ts` reads `themes/*.md` frontmatter + body into `virtual:open-doc/themes` and pairs each with an optional `<id>.demo.tsx`. Nothing about a theme is enforced at runtime; `meta.theme` only draws the back-link.

## Hard rules

- **Biome must pass before commit.** Run `pnpm check` (or `pnpm check:fix`).
- Don't add dependencies casually. The `core` runtime ships to users; every dep inflates install size.
- **Two kinds of skills, don't mix them.** `packages/core/skills/` ships to users (authoring documents under `docs/`). `.agents/skills/` is for working on this repo — `doc-runtime-patterns` (core implementation rules), `print-layout-review` (page/print craft bar), `viewer-ui-guidelines` (viewer chrome + a11y). `.claude/skills/` symlinks the latter.
- Skills under `packages/core/skills/` are canonical. `packages/cli/template/.agents/skills` is generated from them by `scripts/sync-template-skills.mjs` at build time — never edit the template copies by hand.
- **Default to writing no comments.** Only add one when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug. Don't explain WHAT the code does, don't write section-divider banners, don't leave commented-out code.

# open-doc

[![CI](https://github.com/simonliu-ai-product/open-doc/actions/workflows/ci.yml/badge.svg)](https://github.com/simonliu-ai-product/open-doc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@open-document/core?style=flat)](https://www.npmjs.com/package/@open-document/core)
[![GitHub stars](https://img.shields.io/github/stars/simonliu-ai-product/open-doc?style=flat)](https://github.com/simonliu-ai-product/open-doc/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](https://opensource.org/licenses/MIT)

**English** · [繁體中文](README.zh-TW.md)

**The document framework built for agents.** Describe the report you need in natural language — your coding agent writes the React. open-doc handles the page geometry, the outline, the table of contents, page numbers, print layout, and export.

If [open-slide](https://github.com/1weiho/open-slide) is Google Slides for agents, open-doc is Google Docs: same idea, different medium. A deck is a 1920 × 1080 canvas; a document is a stack of **A4 sheets** that has to survive a printer.

```bash
npx @open-document/cli init my-docs
```

<img src=".github/assets/viewer.png" alt="The document viewer — page thumbnails on the left, a real A4 sheet in the middle, running footer and page numbers filled in by the framework." width="100%">

<sub>The document viewer — page thumbnails on the left, a real A4 sheet in the middle, running footer and page numbers filled in by the framework.</sub>

## Why

Reports are the output nobody wants to format. Agents write excellent prose and terrible Word documents. open-doc gives the agent a medium it's actually good at — React — and gives you a PDF that looks like a designer made it.

## Highlights

### 📄 Real page geometry

Every page component renders into a true sheet: A4 (794 × 1123 px @96dpi), Letter, A5, or Legal, portrait or landscape. What you see on screen is what the PDF contains — the `@page` size matches, so nothing is rescaled at print time.

### 🤖 Agent-native authoring

Skills ship with the scaffolder:

- **`/create-doc`** — drafts a document end to end. Establishes topic, audience, and *source material* first (it will not invent your numbers), asks four scoping questions, plans the pages, then writes them.
- **`/doc-authoring`** — the technical reference: file contract, page canvas, print type scale, the vertical budget that decides where pages break, tables, charts, assets.
- **`/current-doc`** — resolves "this page" and "this element". The dev server publishes where you are reading to `node_modules/.open-doc/current.json`, so your agent edits the sheet you are looking at instead of asking which one you mean.

### 🔌 An MCP server, so any agent framework can drive it

`open-doc dev --mcp` mounts an MCP endpoint next to the UI — 18 tools covering documents, surgical text edits, themes, assets, and folders. It is stateless Streamable HTTP, so a client just points at `http://localhost:5273/mcp` with no session handshake.

The tools and the browser share one implementation, so `write_document` / `write_text` take the content you last read and refuse a stale write with `409` rather than overwriting whoever got there first. See [packages/mcp](packages/mcp).

### 🧭 Outline, contents, and page numbers that maintain themselves

Write real `<h1>`/`<h2>` elements and you get an outline sidebar for free. Drop in `<TableOfContents />` and the contents page fills itself — with correct page numbers, in the viewer *and* in the export. `useDocPageNumber()` / `useDocPageCount()` handle running footers. Nothing to renumber by hand.

### 📐 Auto-pagination that knows what not to break

Wrap body content in `flow(<>…</>)` and the framework measures it in the real DOM, then packs it into pages: headings never end a page, captions stay with their figures, tables move whole. Fixed `DocPage` components remain available for covers and dividers, where the layout *is* the content.

```tsx
export default [Cover, Contents, flow(<>…</>, { footer: Footer })] satisfies DocEntry[];
```

### 🗂️ A workspace, not a file list

<img src=".github/assets/workspace.png" alt="Documents, themes, and assets in one workspace, with folders you can file into." width="100%">

<sub>Documents, themes, and assets in one workspace, with folders you can file into.</sub>

A left sidebar holds every view — Documents, Themes, Assets — plus folders you create, rename, re-icon, and reorder by dragging. File a document by dragging its card onto a folder, or from the card's menu, which also renames (rewrites `meta.title` in source), duplicates, and deletes. Inside a document, the left rail switches between **page thumbnails** and the **outline**, and follows you as you scroll.

### 🖱️ Edit on the page

<img src=".github/assets/inspect.png" alt="Inspect mode: click any element to rewrite its text, or leave a note for your agent. Edits are written back into the source." width="100%">

<sub>Inspect mode: click any element to rewrite its text, or leave a note for your agent. Edits are written back into the source.</sub>

**Inspect** mode highlights elements as you hover (dashed) and selects on click (solid), then lets you rewrite their text — headings, paragraphs, list items, table cells, and text passed into your own helper components. Mixed content is split into one field per text run so inline markup survives. Edits land in `docs/<id>/index.tsx` through an AST replacement, checked against what was on screen, and the page hot-reloads. Or leave a note for your agent: it is stored as a `@doc-comment` marker in the source, and `/apply-comments` walks them, makes each edit, and clears the markers.

### 🎨 Themes, assets, and a live design panel

<img src=".github/assets/design.png" alt="The design panel tweaks palette, fonts, and spacing on the real pages, then writes the result back into the document’s design const." width="100%">

<sub>The design panel tweaks palette, fonts, and spacing on the real pages, then writes the result back into the document’s design const.</sub>

- **Themes** — `themes/<id>.md` is a house style (palette, type scale, paste-ready components) plus an optional `<id>.demo.tsx` the gallery previews. `create-doc` offers them; `meta.theme` back-links the document to the theme.
- **Assets** — upload, rename, and delete files in the global `assets/` folder or any document's own, with an "unused" badge and a copy-ready import line.
- **Design panel** — live-tweak the palette, fonts, type scale, margin, and leading on the real pages, then write the result straight back into the document's `design` const via an AST edit.

### 🖨️ One Download menu: PDF and HTML

- **PDF** — the browser print pipeline at the true page size; fonts and images are awaited and contents lists filled before serializing. This is the format that reproduces the page exactly.
- **HTML** — self-contained and printable (a zip when the document has assets).

### 🚀 Deploy-friendly

`open-doc build` outputs a plain static site — deploy to Vercel, Cloudflare Pages, Netlify, or any static host.

## Get started

```bash
npx @open-document/cli init my-docs
cd my-docs
pnpm dev
```

Open http://localhost:5273. From there, drive it through your agent — or edit `docs/<id>/index.tsx` directly.

## The file contract

```tsx
// docs/q3-review/index.tsx
import type { DocMeta, DocPage } from '@open-document/core';

const Cover: DocPage = () => <div>…</div>;
const Summary: DocPage = () => <div>…</div>;

export const meta: DocMeta = {
  title: 'Q3 Review',
  pageSize: 'A4',
  createdAt: '2026-08-15T13:44:40.268Z',
};
export default [Cover, Summary] satisfies DocPage[];
```

## Repo layout

pnpm + Turbo monorepo.

| Path | Description |
| --- | --- |
| [packages/core](packages/core) | `@open-document/core` — runtime (document browser, page viewer, outline, export), Vite plugin, and the `open-doc` dev/build/preview CLI. |
| [packages/cli](packages/cli) | `@open-document/cli` — `npx @open-document/cli init` scaffolder + project template. |
| [packages/mcp](packages/mcp) | `@open-document/mcp` — MCP server over Streamable HTTP. Opt-in; `open-doc dev --mcp` mounts it at `/mcp`. |
| [apps/demo](apps/demo) | Example workspace consuming `@open-document/core` via `workspace:*`. Dogfood target. |

## Development

```bash
pnpm install
pnpm dev        # runs the demo against the local @open-document/core
pnpm build      # builds all packages
pnpm typecheck  # tsc across the graph
pnpm check      # biome (format + lint + organize imports)
pnpm test       # vitest
pnpm test:e2e   # playwright
```

## Contributing

Bug reports, feature requests, and pull requests are welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the checks CI runs, and the changeset convention. Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md); security issues go through [SECURITY.md](SECURITY.md), not the public tracker.

## Credits

The architecture — virtual-module document discovery, the scaffolder, the skills-as-documentation approach — follows [open-slide](https://github.com/1weiho/open-slide) by [@1weiho](https://github.com/1weiho).

## License

MIT

# My documents

Built with [open-doc](https://github.com/simonliu-ai-product/open-doc) — documents as React, one component per printed page.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5273. Every folder under `docs/` with an `index.tsx` shows up.

## Letting an agent drive it

```bash
pnpm add -D @open-document/mcp
open-doc dev --mcp
```

That mounts an MCP endpoint at `/mcp` on the same port, so any agent framework can list, read, and write documents while the page hot-reloads in front of you.

## Writing a document

Ask your coding agent: *"draft a Q3 report on X"*. The bundled `create-doc` skill runs the workflow — scoping questions, page plan, then the file.

Or write it yourself:

```
docs/
  my-report/
    index.tsx      # export default [Cover, Summary, …]
    assets/        # optional images
```

## Starting from Markdown

```bash
open-doc import notes.md --id my-report --contents
```

Turns a Markdown file into a real document — cover page, self-filling contents, tables, and any local images copied into the document's own `assets/`.

## Checking the layout

```bash
open-doc check              # every document; add an id to narrow it
```

Renders each sheet at true page size and reports what a reader would call a mistake: content clipped by the page edge, a blank sheet, a heading stranded at the foot of a page, type too small to print. It exits non-zero on errors, so it works in CI. Your agent should run it after writing or editing a document — it cannot see the pages otherwise.

## Exporting

The toolbar in the document view has **PDF** (prints at the true page size — pick "Save as PDF" in the print dialog) and **HTML** (a self-contained file, or a zip when the document has assets).

Without a browser:

```bash
open-doc export my-report --format pdf   # or html, or one png per page
open-doc export --all --out-dir out
```

`check` and `export` render in headless Chromium, so they need Playwright once:

```bash
pnpm add -D playwright && pnpm exec playwright install chromium
```

`pnpm build` produces a static site you can deploy anywhere.

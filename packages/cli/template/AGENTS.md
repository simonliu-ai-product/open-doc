# open-doc workspace

You author **documents** here — reports, proposals, whitepapers, memos. Each document is a folder under `docs/` with one `index.tsx` that exports an array of page components. Every page is one printed sheet (A4 by default).

## Rules

- Write only inside `docs/<id>/`. Don't touch `package.json`, `open-doc.config.ts`, or other documents.
- No new dependencies. Only `react`, `@open-document/core`, and standard web APIs are available.
- A document is one `index.tsx` plus an optional `assets/` folder. No sibling components files.

## Skills

| Skill | Use it for |
| --- | --- |
| `create-doc` | Drafting a new document end to end — scoping questions, page plan, then the file. |
| `doc-authoring` | The technical reference: file contract, page canvas, print type scale, vertical budget, tables, TOC, page numbers. Read before any edit under `docs/`. |
| `current-doc` | Resolving "this page" / "this element" — reads the cursor the dev server writes to `node_modules/.open-doc/current.json`. |

## Commands

```bash
pnpm dev       # dev server at http://localhost:5273
pnpm build     # static site into dist/
pnpm preview   # preview the build
```

In the viewer: outline sidebar, zoom, **PDF** export (true page size) and **HTML** export (self-contained).

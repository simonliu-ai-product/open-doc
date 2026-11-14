---
trigger: model_decision
description: Working in an open-doc workspace — a project with open-doc.config.ts or @open-document/core in package.json, documents under docs/<id>/index.tsx, themes under themes/.
---

# open-doc workspace

- A document is `docs/<id>/index.tsx`: a React module whose default export lists the pages. Read the `doc-authoring` skill before you write one; `create-doc` walks through a new document, `create-theme` a new house style, `apply-comments` the notes left in the viewer.
- Prefer the `open-doc` MCP tools over raw file edits: `list_documents` first, `read_text` → `write_text` for wording changes, `create_document` / `write_document` with `expected` for whole sources, `list_themes` / `read_theme` before choosing a look.
- You cannot see the pages. After every edit run `check_layout` (or `npx open-doc check <id>`) and fix what it reports; `render_page` shows one sheet when the report is not enough.
- "This page" or "this document" means what the person has open in the dev server — see the `current-doc` skill.
- Never edit `node_modules/`, and do not list it — it is large and not yours.

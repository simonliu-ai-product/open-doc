---
"@open-document/core": minor
"@open-document/cli": minor
"@open-document/mcp": minor
---

Start documents from templates. open-doc ships `report`, `proposal`, `meeting-notes`, `letter` and `blank`, and a workspace can add its own under `templates/<name>/` (an `index.tsx`, plus an optional `template.json` with a title, description, category and the placeholder title to replace).

- `open-doc templates` lists every template with the name to use; `open-doc new <id> --template <name> --title "…"` creates a document from one, retitled where the title prints and dated today.
- The document browser has a **New document** button: a gallery of the templates, each showing its name, and a title field. A document created inside a folder view is filed into that folder.
- `npx @open-document/cli templates` lists them, and `init --template <name>` starts the workspace with that document.
- MCP: `list_templates` and `create_from_template`.

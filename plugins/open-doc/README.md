# open-doc for Antigravity

[open-doc](https://github.com/simonliu-ai-product/open-doc) treats documents as React: one component per printed page, or a `flow()` section the framework paginates onto A4, B4 or A3. This plugin teaches Antigravity to write them.

## What it adds

- **Skills** — `create-doc`, `doc-authoring`, `create-theme`, `apply-comments`, `current-doc`: how a document is shaped, the print type scale and vertical budget, themes, and the viewer's comment markers.
- **MCP server** — `open-doc`, 26 tools over stdio (`@open-document/mcp`): list, read, create and edit documents; themes and assets; `check_layout`, `render_page` and `export_document` for what the pages actually look like.
- **Rule** — `open-doc`, applied when the agent is working in an open-doc workspace.

## Requirements

- Node.js 18 or later (`npx` launches the MCP server).
- An open-doc workspace open in Antigravity. Start one with:

  ```bash
  npx @open-document/cli init my-docs
  cd my-docs && pnpm dev
  ```

- For `check_layout`, `render_page` and `export_document`: `pnpm add -D playwright && pnpm exec playwright install chromium` in the workspace.

The MCP tools only act on an open-doc workspace — the folder Antigravity has open, or one of its parents. Anywhere else they refuse rather than write files.

## Install

```bash
agy plugin install https://github.com/simonliu-ai-product/open-doc
```

Or copy this folder to `.agents/plugins/open-doc/` in a workspace, or `~/.gemini/config/plugins/open-doc/` for every workspace.

## Try

- "Write a two-page project proposal using the corporate-neutral theme"
- "Check the layout of this document and fix anything that overflows"
- "Apply the comments I left on the document"

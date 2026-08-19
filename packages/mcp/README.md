# @open-document/mcp

**English** · [繁體中文](README.zh-TW.md)

An MCP server for an open-doc workspace. Any agent framework that speaks Model Context Protocol can list, read, write, and file documents — and because it runs on the dev server, the page in the browser hot-reloads as the agent works.

```bash
pnpm add -D @open-document/mcp
open-doc dev --mcp
```

```
  ➜  MCP:     http://localhost:5273/mcp
  ➜  Local:   http://localhost:5273/
```

Point a client at `http://localhost:5273/mcp`. There is no session handshake — every call is independent, which is the stateless shape the 2026-07-28 revision expects. `legacy: 'stateless'` is left on, so 2025-era clients are served from the same endpoint.

## Tools

| Tool | What it does |
| --- | --- |
| `list_documents` | Every document with id, title, theme, folder. Start here. |
| `read_document` | Full TSX source of one document. |
| `create_document` | Write a new `docs/<id>/index.tsx`. Refuses a taken id. |
| `write_document` | Replace the source. Pass `expected` for a conflict check. |
| `rename_document` | Rewrite `meta.title`. The id never changes. |
| `duplicate_document` | Copy to a fresh id, into the same folder. |
| `delete_document` | Remove the folder from disk. |
| `read_text` | The editable text runs at a `line:column`. |
| `write_text` | Replace one text run, leaving surrounding markup alone. |
| `add_comment` | Anchor a `@doc-comment` note for a later pass. |
| `list_themes` / `read_theme` | The house styles, and the full theme document. |
| `list_assets` / `upload_asset` / `find_asset_usages` / `delete_asset` | Images per document or `global`. |
| `list_folders` / `create_folder` / `file_document` | The folder manifest. |
| `check_layout` | Render the sheets and report layout faults, with source locations. |
| `render_page` | PNG of one sheet at true page size. |
| `export_document` | Write pdf / html / png to disk, headlessly. |
| `import_markdown` | Turn Markdown into a document under `docs/`. |

The last four render the document in a headless browser and need `playwright` in the workspace (`pnpm add -D playwright && pnpm exec playwright install chromium`). They reuse the running dev server, so repeat calls are cheap.

## Writing a document

A document is a React module, not a form. The flow that works:

1. `list_themes`, then `read_theme` for the one you want — the palette, type scale, and paste-ready components are all in the body.
2. `create_document` with a complete TSX source that declares `export const design`, the pages, and `export const meta` with `theme: '<id>'`.
3. Look at it in the browser; the dev server already reloaded.

For edits, prefer `read_text` → `write_text` over rewriting the file: it touches one text run and leaves the markup untouched.

4. **`check_layout`.** You cannot see the pages you wrote. It reports content clipped by the page edge, blank sheets, headings stranded at the foot of a page, and type too small to print — each with the `line:column` to fix. `render_page` gives you a picture of one sheet when the report is not enough.

Starting from Markdown the user already has? `import_markdown` writes the whole document — `flow()` body, cover, contents, images — and you refine from there.

## Concurrent edits

`write_document` and `write_text` both accept `expected` — the content you last read. If disk no longer matches, the call is refused with `409` instead of overwriting whatever the other agent (or the person in the browser) just did. Read, then write with `expected`; on a 409, re-read and reconcile.

## Security

The tools write to the user's disk, so the endpoint defends itself:

- **Host and Origin are validated** against loopback. A page on another origin cannot drive the tools, which closes the DNS-rebinding path onto a local endpoint. Both rejections are `403`.
- Extra hostnames go through `allowedHosts`, and only make sense when the endpoint is deliberately exposed.
- Nothing here authenticates a caller. Anything beyond loopback needs a reverse proxy that does.

## Embedding

`open-doc dev --mcp` covers the usual case. To mount it yourself:

```ts
import { createOpenDocMcpMiddleware } from '@open-document/mcp';

app.use('/mcp', createOpenDocMcpMiddleware({ userCwd: process.cwd() }));
```

`createOpenDocMcpHandler` returns the web-standard `{ fetch }` form for runtimes that want a `Request` in and a `Response` out.

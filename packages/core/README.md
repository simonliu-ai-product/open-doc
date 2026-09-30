# @open-document/core

**English** · [繁體中文](README.zh-TW.md)

Runtime and CLI for [open-doc](https://github.com/simonliu-ai-product/open-doc) — write documents in `docs/`, we handle the pages, the outline, and the export.

```bash
npx @open-document/cli init my-docs
```

## What's in here

- **Runtime** — document browser, paged viewer with outline sidebar and zoom, PDF export (true `@page` size), self-contained HTML export.
- **Vite plugin** — discovers `docs/*/index.tsx`, serves them through a virtual module, hot-reloads edits.
- **CLI** — `open-doc dev | build | preview | sync:skills`. `dev --mcp` also mounts [`@open-document/mcp`](../mcp) at `/mcp`.
- **Ops layer** — `@open-document/core/ops`: document, theme, asset, and folder operations independent of transport. The dev API and the MCP server both call these, so validation and conflict checks exist once.
- **Skills** — `create-doc` and `doc-authoring`, synced into your workspace so your coding agent knows the rules.

## Public API

```tsx
import {
  type DesignSystem,
  type DocMeta,
  type DocPage,
  ImagePlaceholder,
  PAGE_SIZE_NAMES,
  PAGE_SIZES,
  TableOfContents,
  resolvePageGeometry,
  useDocOutline,
  useDocPageCount,
  useDocPageNumber,
} from '@open-document/core';
```

## Config

`open-doc.config.ts` at the workspace root:

```ts
import type { OpenDocConfig } from '@open-document/core';

export default {
  docsDir: 'docs',
  assetsDir: 'assets',
  port: 5273,
} satisfies OpenDocConfig;
```

MIT

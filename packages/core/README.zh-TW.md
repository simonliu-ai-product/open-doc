# @open-document/core

[English](README.md) · **繁體中文**

[open-doc](https://github.com/simonliu-ai-product/open-doc) 的 runtime 與 CLI——文件寫在 `docs/` 裡，頁面、大綱與匯出交給我們處理。

```bash
npx @open-document/cli init my-docs
```

## 內容物

- **Runtime** — 文件瀏覽器、帶大綱側欄與縮放的分頁檢視器、PDF 匯出（真實的 `@page` 尺寸）、自足的 HTML 匯出。
- **Vite plugin** — 探索 `docs/*/index.tsx`，透過 virtual module 提供，並對編輯做熱更新。
- **CLI** — `open-doc dev | build | preview | sync:skills`。`dev --mcp` 另會把 [`@open-document/mcp`](../mcp) 掛在 `/mcp`。
- **Ops 層** — `@open-document/core/ops`：與傳輸無關的文件、theme、asset 與資料夾操作。Dev API 與 MCP server 都呼叫這一層，因此驗證與衝突檢查只存在一份。
- **Skills** — `create-doc` 與 `doc-authoring`，會同步進你的工作區，讓 coding agent 知道規則。

## 公開 API

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

## 設定

工作區根目錄的 `open-doc.config.ts`：

```ts
import type { OpenDocConfig } from '@open-document/core';

export default {
  docsDir: 'docs',
  assetsDir: 'assets',
  port: 5273,
} satisfies OpenDocConfig;
```

MIT

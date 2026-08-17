# open-doc

[![CI](https://github.com/simonliu-ai-product/open-doc/actions/workflows/ci.yml/badge.svg)](https://github.com/simonliu-ai-product/open-doc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@open-document/core?style=flat)](https://www.npmjs.com/package/@open-document/core)
[![GitHub stars](https://img.shields.io/github/stars/simonliu-ai-product/open-doc?style=flat)](https://github.com/simonliu-ai-product/open-doc/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](https://opensource.org/licenses/MIT)

[English](README.md) · **繁體中文**

**為 agent 打造的文件框架。** 用自然語言描述你要的報告，你的 coding agent 負責寫 React，open-doc 負責頁面尺寸、大綱、目錄、頁碼、列印版面與匯出。

如果說 [open-slide](https://github.com/1weiho/open-slide) 是給 agent 用的 Google Slides，那 open-doc 就是 Google Docs：概念相同，媒介不同。簡報是 1920 × 1080 的畫布；文件是一疊必須經得起印表機考驗的 **A4 紙**。

```bash
npx @open-document/cli init my-docs
```

<img src=".github/assets/viewer.png" alt="文件檢視器——左側頁面縮圖，中間是一張真正的 A4 紙，頁尾與頁碼由框架自動填入。" width="100%">

<sub>文件檢視器——左側頁面縮圖，中間是一張真正的 A4 紙，頁尾與頁碼由框架自動填入。</sub>

## 為什麼要做這個

報告是沒人想排版的產出。Agent 很會寫文字，但產出的 Word 檔慘不忍睹。open-doc 給 agent 一個它真正擅長的媒介——React——然後給你一份看起來像設計師做的 PDF。

## 特色

### 📄 真實的頁面尺寸

每個頁面元件都渲染成一張真正的紙：A4（794 × 1123 px @96dpi）、Letter、A5 或 Legal，直式或橫式。螢幕上看到的就是 PDF 裡的樣子——`@page` 尺寸一致，列印時不會被重新縮放。

### 🤖 為 agent 設計的撰寫流程

Scaffolder 內建這些 skill：

- **`/create-doc`** — 從頭到尾起草一份文件。先確立主題、讀者與**素材來源**（它不會杜撰你的數字），問四個界定範圍的問題，規劃頁面，然後寫出來。
- **`/doc-authoring`** — 技術參考：檔案契約、頁面畫布、列印字級、決定分頁位置的垂直預算、表格、圖表、素材。
- **`/current-doc`** — 解析「這一頁」「這個元素」。Dev server 會把你正在讀的位置寫進 `node_modules/.open-doc/current.json`，agent 就會改你正在看的那張紙，而不是反問你指的是哪一頁。

### 🔌 MCP server，任何 agent framework 都能接

`open-doc dev --mcp` 會在 UI 旁邊掛上 MCP 端點——18 個工具，涵蓋文件、精準的文字編輯、themes、assets 與資料夾。它是無狀態的 Streamable HTTP，client 直接指向 `http://localhost:5273/mcp` 即可，不需要 session handshake。

這些工具和瀏覽器共用同一份實作，所以 `write_document` / `write_text` 會接收你上次讀到的內容，遇到已被改動的檔案時回 `409` 拒絕寫入，而不是覆蓋掉先到的人。詳見 [packages/mcp](packages/mcp)。

### 🧭 會自己維護的大綱、目錄與頁碼

寫真正的 `<h1>` / `<h2>` 元素，就自動獲得大綱側欄。放進 `<TableOfContents />`，目錄頁會自己填滿——頁碼正確，檢視器與匯出檔**都是**。`useDocPageNumber()` / `useDocPageCount()` 處理頁尾。沒有任何東西需要手動重編號。

### 📐 知道什麼不能拆的自動分頁

把內文包進 `flow(<>…</>)`，框架會在真實 DOM 裡量測，再打包成頁面：標題絕不會落在頁尾、圖說跟著它的圖、表格整塊移動。封面與分隔頁這類「版面即內容」的場合，仍可使用固定的 `DocPage` 元件。

```tsx
export default [Cover, Contents, flow(<>…</>, { footer: Footer })] satisfies DocEntry[];
```

### 🗂️ 是工作區，不是檔案清單

<img src=".github/assets/workspace.png" alt="Documents、Themes、Assets 集中在同一個工作區，並可歸入自建的資料夾。" width="100%">

<sub>Documents、Themes、Assets 集中在同一個工作區，並可歸入自建的資料夾。</sub>

左側欄收納所有檢視——Documents、Themes、Assets——以及你自己建立的資料夾，可改名、換圖示、拖曳排序。把文件卡片拖到資料夾即可歸檔，或透過卡片選單，該選單同時提供改名（改寫原始碼中的 `meta.title`）、複製與刪除。進入文件後，左欄可在**頁面縮圖**與**大綱**之間切換，並隨著你捲動而跟隨。

### 🖱️ 直接在頁面上編輯

<img src=".github/assets/inspect.png" alt="Inspect 模式：點任一元素即可改寫文字，或留一則給 agent 的註記。編輯會寫回原始碼。" width="100%">

<sub>Inspect 模式：點任一元素即可改寫文字，或留一則給 agent 的註記。編輯會寫回原始碼。</sub>

**Inspect** 模式會在滑鼠移過時標示元素（虛線框）、點擊時選取（實線框），接著就能改寫其中的文字——標題、段落、清單項目、表格儲存格，以及傳進你自訂輔助元件的文字。混合內容會依每個文字段落拆成獨立欄位，因此行內標記得以保留。編輯會透過 AST 取代寫回 `docs/<id>/index.tsx`，並比對畫面上原本的內容，然後頁面熱更新。也可以留一則給 agent 的註記：它會以 `@doc-comment` 標記存在原始碼中，`/apply-comments` 會逐一走過、完成修改並清除標記。

### 🎨 Themes、assets 與即時設計面板

<img src=".github/assets/design.png" alt="設計面板可在真實頁面上調整色盤、字型與間距，再把結果寫回文件的 design 常數。" width="100%">

<sub>設計面板可在真實頁面上調整色盤、字型與間距，再把結果寫回文件的 design 常數。</sub>

- **Themes** — `themes/<id>.md` 是一套家族風格（色盤、字級、可直接貼用的元件），外加一個選用的 `<id>.demo.tsx` 供藝廊預覽。`create-doc` 會提供選擇；`meta.theme` 會把文件反向連結到該 theme。
- **Assets** — 在全域 `assets/` 資料夾或任一文件自己的資料夾中上傳、改名、刪除檔案，並附有「未使用」標記與可直接複製的 import 語句。
- **設計面板** — 在真實頁面上即時調整色盤、字型、字級、邊界與行距，再透過 AST 編輯將結果直接寫回文件的 `design` 常數。

### 🖨️ 一個下載選單：PDF 與 HTML

- **PDF** — 以真實頁面尺寸走瀏覽器列印管線；序列化前會等待字型與圖片載入、並填好目錄。這是能完全重現頁面的格式。
- **HTML** — 自足且可列印（文件含 assets 時會打包成 zip）。

### 🚀 容易部署

`open-doc build` 產出純靜態網站——可部署到 Vercel、Cloudflare Pages、Netlify 或任何靜態主機。

## 開始使用

```bash
npx @open-document/cli init my-docs
cd my-docs
pnpm dev
```

開啟 http://localhost:5273。接著就透過你的 agent 操作它——或直接編輯 `docs/<id>/index.tsx`。

## 檔案契約

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

## 專案結構

pnpm + Turbo monorepo。

| 路徑 | 說明 |
| --- | --- |
| [packages/core](packages/core) | `@open-document/core` — runtime（文件瀏覽器、頁面檢視器、大綱、匯出）、Vite plugin，以及 `open-doc` dev/build/preview CLI。 |
| [packages/cli](packages/cli) | `@open-document/cli` — `npx @open-document/cli init` scaffolder 與專案範本。 |
| [packages/mcp](packages/mcp) | `@open-document/mcp` — 走 Streamable HTTP 的 MCP server。選用；`open-doc dev --mcp` 會把它掛在 `/mcp`。 |
| [apps/demo](apps/demo) | 透過 `workspace:*` 使用 `@open-document/core` 的範例工作區。Dogfood 目標。 |

## 開發

```bash
pnpm install
pnpm dev        # 以本地的 @open-document/core 執行 demo
pnpm build      # 建置所有套件
pnpm typecheck  # 跨整個相依圖執行 tsc
pnpm check      # biome（格式化 + lint + 整理 import）
pnpm test       # vitest
pnpm test:e2e   # playwright
```

## 參與貢獻

歡迎回報問題、提出功能建議與送出 PR——請先看 [CONTRIBUTING.md](CONTRIBUTING.md)，裡面有環境設定、CI 會跑的檢查，以及 changeset 的撰寫慣例。所有參與都適用 [行為準則](CODE_OF_CONDUCT.md)；安全性問題請走 [SECURITY.md](SECURITY.md) 的私下回報管道，不要開公開 issue。

## 致謝

整體架構——virtual module 的文件探索、scaffolder、以 skill 作為文件的做法——沿襲自 [@1weiho](https://github.com/1weiho) 的 [open-slide](https://github.com/1weiho/open-slide)。

## 授權

MIT

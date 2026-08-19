# @open-document/mcp

[English](README.md) · **繁體中文**

open-doc 工作區的 MCP server。任何支援 Model Context Protocol 的 agent framework 都能列出、讀取、寫入與歸檔文件——而且因為它跑在 dev server 上，agent 動作的同時，瀏覽器裡的頁面會即時熱更新。

```bash
pnpm add -D @open-document/mcp
open-doc dev --mcp
```

```
  ➜  MCP:     http://localhost:5273/mcp
  ➜  Local:   http://localhost:5273/
```

把 client 指向 `http://localhost:5273/mcp` 即可。沒有 session handshake——每次呼叫都是獨立的，這正是 2026-07-28 revision 所預期的無狀態形態。`legacy: 'stateless'` 保持開啟，因此 2025 世代的 client 也由同一個端點服務。

## 工具

| 工具 | 用途 |
| --- | --- |
| `list_documents` | 列出所有文件的 id、標題、theme、資料夾。從這裡開始。 |
| `read_document` | 單一文件的完整 TSX 原始碼。 |
| `create_document` | 寫入新的 `docs/<id>/index.tsx`。id 已存在則拒絕。 |
| `write_document` | 覆寫原始碼。帶 `expected` 可啟用衝突檢查。 |
| `rename_document` | 改寫 `meta.title`。文件 id 永遠不變。 |
| `duplicate_document` | 複製成新的 id，並落在與原件相同的資料夾。 |
| `delete_document` | 從磁碟移除該文件資料夾。 |
| `read_text` | 取得某個 `line:column` 上可編輯的文字段落。 |
| `write_text` | 只取代一個文字段落，不動周圍的標記。 |
| `add_comment` | 在原始碼中錨定一則 `@doc-comment` 註記，供後續處理。 |
| `list_themes` / `read_theme` | 可用的家族風格，以及完整的 theme 文件。 |
| `list_assets` / `upload_asset` / `find_asset_usages` / `delete_asset` | 各文件或 `global` 範圍的圖片。 |
| `list_folders` / `create_folder` / `file_document` | 資料夾清單與歸檔。 |
| `check_layout` | 算出每一頁並回報版面問題，附上原始碼位置。 |
| `render_page` | 以真實頁面尺寸截下某一頁的 PNG。 |
| `export_document` | 無頭寫出 pdf / html / png。 |
| `import_markdown` | 把 Markdown 變成 `docs/` 下的一份文件。 |

最後四個會在無頭瀏覽器裡算出文件，需要工作區內有 `playwright`（`pnpm add -D playwright && pnpm exec playwright install chromium`）。它們會沿用正在跑的 dev server，所以連續呼叫很便宜。

## 撰寫一份文件

文件是 React 模組，不是表單。實際可行的流程是：

1. `list_themes`，然後對想要的那個執行 `read_theme`——色盤、字級與可直接貼用的元件全都在內文裡。
2. `create_document`，給出完整的 TSX 原始碼，內含 `export const design`、各頁面，以及帶 `theme: '<id>'` 的 `export const meta`。
3. 到瀏覽器看結果；dev server 已經重新載入了。

要修改時，優先用 `read_text` → `write_text` 而不是整份重寫：它只碰一個文字段落，周圍的標記原封不動。

4. **`check_layout`。** 你看不到自己寫出來的頁面。它會回報被頁緣裁掉的內容、空白頁、落在頁尾的孤立標題、小到印不出來的字級——每一項都附上要修的 `line:column`。報告不夠時，用 `render_page` 直接看那一頁。

使用者手上已經有 Markdown？`import_markdown` 會把整份文件寫好——`flow()` 內文、封面、目錄、圖片——你從那裡開始細修。

## 同時編輯

`write_document` 與 `write_text` 都接受 `expected`——也就是你上次讀到的內容。若磁碟上的內容已經不同，該次呼叫會以 `409` 被拒絕，而不是覆蓋掉另一個 agent（或瀏覽器前那個人）剛完成的修改。先讀再帶 `expected` 寫；遇到 409 就重讀並調和差異。

## 安全性

這些工具會寫入使用者的磁碟，所以端點會自我防衛：

- **Host 與 Origin 都會對照 loopback 驗證。** 其他來源的網頁無法驅動這些工具，這條路正是 DNS rebinding 打進本機端點的途徑。兩種拒絕都回 `403`。
- 額外的主機名稱透過 `allowedHosts` 加入，只有在刻意對外暴露端點時才有意義。
- **這裡不做任何呼叫端身分驗證。** 要超出 loopback 使用，必須自行前置一層負責驗證的反向代理。

## 嵌入使用

一般情況用 `open-doc dev --mcp` 就夠了。要自行掛載：

```ts
import { createOpenDocMcpMiddleware } from '@open-document/mcp';

app.use('/mcp', createOpenDocMcpMiddleware({ userCwd: process.cwd() }));
```

若執行環境偏好 `Request` 進、`Response` 出，`createOpenDocMcpHandler` 會回傳 web 標準的 `{ fetch }` 形式。

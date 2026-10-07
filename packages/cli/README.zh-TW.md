# @open-document/cli

[English](README.md) · **繁體中文**

建立 [open-doc](https://github.com/simonliu-ai-product/open-doc) 工作區——文件即 React，一個元件對應一張印出來的頁面。

```bash
npx @open-document/cli init my-docs
cd my-docs
pnpm dev
```

產生的工作區已預先配置好 `create-doc` 與 `doc-authoring` 兩個 agent skill（放在 `.agents/skills`，並連結進 `.claude/skills`）、一份範例文件，以及 `open-doc` 的 dev/build/preview 指令。

它也會寫入一份 `pnpm-workspace.yaml`，允許 esbuild 執行 postinstall。pnpm 預設封鎖 build script，而少了這一個 Vite 就無法啟動；這個檔案在 npm、yarn 與 bun 之下是惰性的，不會有影響。

## 參數

```
open-doc init [dir]
  -f, --force        覆寫非空的目標目錄
  -n, --name <name>  套件名稱（預設取資料夾名稱）
  --use-pnpm         （或 --use-npm / --use-yarn / --use-bun）
  --no-install       略過安裝相依套件
  --no-git           略過 git init 與初始 commit
  -t, --template <name>  從範本建立一份起始文件

open-doc templates   列出 --template 可用的範本名稱
```

MIT

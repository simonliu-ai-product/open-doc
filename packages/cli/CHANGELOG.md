# @open-document/cli

## 0.2.0

### Minor Changes

- [#68](https://github.com/simonliu-ai-product/open-doc/pull/68) [`19634aa`](https://github.com/simonliu-ai-product/open-doc/commit/19634aaa32f311319f6f5663a5993f67bd5aecfd) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Start documents from templates. open-doc ships `report`, `proposal`, `meeting-notes`, `letter` and `blank`, and a workspace can add its own under `templates/<name>/` (an `index.tsx`, plus an optional `template.json` with a title, description, category and the placeholder title to replace).
  
  - `open-doc templates` lists every template with the name to use; `open-doc new <id> --template <name> --title "…"` creates a document from one, retitled where the title prints and dated today.
  - The document browser has a **New document** button: a gallery of the templates, each showing its name, and a title field. A document created inside a folder view is filed into that folder.
  - `npx @open-document/cli templates` lists them, and `init --template <name>` starts the workspace with that document.
  - MCP: `list_templates` and `create_from_template`.

## 0.1.3

### Patch Changes

- [#61](https://github.com/simonliu-ai-product/open-doc/pull/61) [`28b56fb`](https://github.com/simonliu-ai-product/open-doc/commit/28b56fbd4120790d6b15bfada9761baa0761409b) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - A pass over the browser and viewer chrome:
  
  - **⌘K command palette**, everywhere. Find any document by its title, a
    folder, a theme, or a page of the browser, and switch between light and
    dark. Inside a document it also lists the document's sections with their
    pages, jumps to page N when you type a number, and runs the viewer's
    actions: download in any format, the three layouts, fullscreen, edit mode
    and the design panel. A Search field at the top of the sidebar opens it
    too.
  - **Document list.** It can be sorted (Newest, Oldest, A–Z, Z–A; the choice
    is remembered) and filtered by title.
  - **Page headers** show an icon, the title and a count. The explanatory text
    meant for developers is gone, and empty states speak to people using
    open-doc rather than to the framework.
  - **Cards** grow with the window, so pages and themes preview at a readable
    size.
  - **Content panels.** Both the browser and the viewer sit on an inset,
    rounded panel. The theme toggle moves to the sidebar footer.
  - **Page rail.** It numbers its thumbnails (01, 02 …) and marks the current
    page.
  - **Copy link** button in the viewer header.
  
  Document titles are now read at build time alongside `createdAt`
  (`docTitles` in `virtual:open-doc/docs`), so search and sorting don't load
  every document. The user guides list ⌘K among the shortcuts.

- [#57](https://github.com/simonliu-ai-product/open-doc/pull/57) [`33b5688`](https://github.com/simonliu-ai-product/open-doc/commit/33b5688136d31545cf953a5b8d9e7737392556e2) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - `open-doc diff <id> --since <rev>` shows what changed in a document since a
  git revision (default `HEAD`), page by page. MCP exposes the same thing as the
  `diff_document` tool.
  
  - **Rendering.** It renders the current version and the version at the
    revision through the same print pipeline as `export`. The old version is
    checked out temporarily inside the workspace, so both versions use the same
    installed packages.
  - **Page pairing.** Pages are paired by content, so a page inserted in the
    middle shows as one new page rather than as every later page having changed.
    Each page is reported as same, changed, added or removed, with the lines of
    text added and removed.
  - **Report.** It writes `out/<id>-diff.html`, a self-contained report: before
    and after side by side, changed regions outlined, the text changes beneath.
    You can send it to a reviewer who has neither the repository nor open-doc.
  - **Scaffolded projects** now ignore `out/` and `.open-doc-diff/`.

- [#59](https://github.com/simonliu-ai-product/open-doc/pull/59) [`235c055`](https://github.com/simonliu-ai-product/open-doc/commit/235c0554668a41a69487d3efb89a767b731df4a1) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - A clearer Download menu:
  
  - **Page choice.** All, This page and Range sit in one row of equal segments,
    so a label no longer wraps onto two lines.
  - **Range.** Choosing Range puts the cursor in the range field. The menu reads
    back what it will download as you type (`Pages 1–3, 6 · 4 pages`), or says
    that the pages don't exist and how many the document has.
  - **Formats.** They are grouped by what the file is for (Print & share, Edit,
    Images), with the extension each one produces.

- [#62](https://github.com/simonliu-ai-product/open-doc/pull/62) [`1cf458d`](https://github.com/simonliu-ai-product/open-doc/commit/1cf458d80d13aeb090bdb5983b1f0fb7bef28fda) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The viewer speaks English and 繁體中文.
  
  - **Coverage.** The whole interface is translated: the document browser, the
    toolbar, the Download menu, the command palette, the design panel, the
    editor and document search.
  - **Switching.** Use the language button at the foot of the sidebar (or in
    the header on a phone), or "Language" in ⌘K. The choice is remembered, and
    a first visit follows the browser's language.
  - **What stays as written.** Switching language never touches the document:
    what prints on the page is the document's own, and figure and table names
    still come from `meta.labels`.
  
  The user guides mention the switch.

- [#63](https://github.com/simonliu-ai-product/open-doc/pull/63) [`2727875`](https://github.com/simonliu-ai-product/open-doc/commit/27278756c9ad5959dc392813d9aa943957d5290d) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The viewer also speaks 简体中文, 日本語 and 한국어, alongside English and
  繁體中文. Pick one from the language button or ⌘K. A first visit follows the
  browser's language: Chinese goes to Traditional for Taiwan, Hong Kong and Macau
  and to Simplified otherwise. The user guides list the five languages.

- [#58](https://github.com/simonliu-ai-product/open-doc/pull/58) [`a95ec73`](https://github.com/simonliu-ai-product/open-doc/commit/a95ec7355aeefcf8916b7774436e5cf6f6ab8b9f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - New workspaces ship a complete user guide in two editions:
  `getting-started` in English and `getting-started-zh` in Traditional Chinese.
  Each covers the viewer, editing on the page, the design panel, writing
  documents, data, charts and diagrams, exporting, the command line, and working
  with agents. Each also uses those features in its own pages, so you can try
  them as you read.

## 0.1.2

### Patch Changes

- [#19](https://github.com/simonliu-ai-product/open-doc/pull/19) [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Give agents eyes, a headless renderer, and a Markdown front door.
  
  - **`open-doc check`** renders every sheet at true page size and reports the layout faults an agent writing React cannot see — content clipped by the page edge, blank sheets, headings stranded at the foot of a page, type too small to print, images that never loaded — each with the `line:column` in the source. Exits non-zero, so it works as a CI gate. Same report as the new `check_layout` MCP tool; `render_page` returns a PNG of one sheet.
  - **`open-doc export [ids…] --format pdf|html|png`** produces the Download menu's output from a script. It drives the real viewer in headless Chromium, so nothing about layout is re-implemented on the Node side. Playwright is an optional peer, not a dependency.
  - **`open-doc import <file.md>`** turns Markdown into a real document — `flow()` body, cover, self-filling contents, GFM tables, local images copied into the document's `assets/`. The output is ordinary authored TSX, so the outline, the inspector, and the design panel all work on it. Also available as the `import_markdown` tool.
  - **Fixed:** the flow packer's `measuring` flag read false for one commit after a document loaded, so anything reading the page list in that window — the outline scan, thumbnails, the page counter — saw an unpaginated flow section as a single page.

## 0.1.1

### Patch Changes

- [#15](https://github.com/simonliu-ai-product/open-doc/pull/15) [`f215074`](https://github.com/simonliu-ai-product/open-doc/commit/f215074413b2f101451cd0a84229567c7050080a) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Scaffold new workspaces against `@open-document/core` 0.2.0. The version range is stamped in at build time, so the previous release pinned new projects to `^0.1.0` — which under semver's 0.x rule excludes 0.2.0, leaving them without the `current-doc` cursor.

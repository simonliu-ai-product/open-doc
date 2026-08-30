# @open-document/core

## 0.4.0

### Minor Changes

- [#28](https://github.com/simonliu-ai-product/open-doc/pull/28) [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Restrict page sizes to A4, B4 and A3, portrait or landscape — and fix the landscape `@page` descriptor
  
  A document could previously be laid out on A4, Letter, A5 or Legal. The set is
  now A4, JIS B4 (257 × 364mm) and A3 — six sheets counting orientation, all
  metric, all sold by the same print shop.
  
  `PAGE_SIZE_NAMES` is exported as the single source of truth and `PageSizeName`
  is derived from it, so the CLI's `--page-size`, the MCP `import_markdown`
  schema, and `ops/import.ts` all read one list instead of restating it.
  `open-doc import` also gained `--orientation`, and `import_markdown` an
  `orientation` argument; both reject a size or orientation off the list, as does
  a `pageSize:` in imported Markdown frontmatter.
  
  Landscape documents printed at the wrong sheet size. `resolvePageGeometry()`
  emitted `@page { size: 210mm 297mm landscape }`, but the `landscape` keyword is
  only valid beside a page-size *name* — Chromium dropped the whole descriptor and
  printed at whatever the dialog defaulted to, while the content was laid out
  1123 × 794. The descriptor now carries the swapped millimetres (`297mm 210mm`),
  which Chromium accepts.
  
  `PAGE_SIZES` entries therefore expose `mm: [width, height]` (portrait) in place
  of the old pre-rendered `css` string; `resolvePageGeometry().css` is unchanged
  as the way to get an `@page` descriptor.
  
  `resolvePageGeometry()` still falls back to portrait A4 for an unrecognised
  value, so a document that already says `pageSize: 'Letter'` renders as A4
  rather than breaking — but the type no longer accepts it.

- [#28](https://github.com/simonliu-ai-product/open-doc/pull/28) [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Add `home` to the config: the viewer's back arrow points at that URL instead of the app's own document browser. A viewer mounted under a larger site can now return to that site rather than to its own index.

### Patch Changes

- [#28](https://github.com/simonliu-ai-product/open-doc/pull/28) [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Fix the core version reported by the dev API, the MCP server, and `cliContext` — it resolved `package.json` at a fixed depth, which the bundler's chunk placement made wrong, so it silently fell back to `0.0.0`.

- [#28](https://github.com/simonliu-ai-product/open-doc/pull/28) [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Hide the document header's back arrow when there is nowhere for it to go — no
  `home` configured and `showDocBrowser: false`, where `/` renders "not found".

- [#28](https://github.com/simonliu-ai-product/open-doc/pull/28) [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Centre the document title in the viewer header and drop the subtitle line
  
  The header laid the title out in a `flex-1` block right after the back link, so
  it sat at the centre of the *leftover* space — visibly left of the bar's centre,
  because the control cluster on the right is many times wider than the back link.
  The header is now a three-column grid with equal `1fr` rails, which puts the
  title at the true centre whenever the controls fit their share, and slides it
  rather than colliding when they don't.
  
  `meta.subtitle` no longer renders in the header. It was a second line of small
  grey text competing with the page it describes; the document browser still shows
  it, and it still belongs on a cover page.

- [#28](https://github.com/simonliu-ai-product/open-doc/pull/28) [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Show the theme toggle in the document viewer when the document browser is not built. The browser's sidebar was the only place it lived, so a viewer mounted on its own left a reader with no way to switch between light and dark.

## 0.3.0

### Minor Changes

- [#19](https://github.com/simonliu-ai-product/open-doc/pull/19) [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Add `<Diagram>`: import a `.mmd` file and get an architecture or flow drawing compiled to SVG at build time, in the document's own theme, numbered as a figure when given a caption.

- [#19](https://github.com/simonliu-ai-product/open-doc/pull/19) [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Give agents eyes, a headless renderer, and a Markdown front door.
  
  - **`open-doc check`** renders every sheet at true page size and reports the layout faults an agent writing React cannot see — content clipped by the page edge, blank sheets, headings stranded at the foot of a page, type too small to print, images that never loaded — each with the `line:column` in the source. Exits non-zero, so it works as a CI gate. Same report as the new `check_layout` MCP tool; `render_page` returns a PNG of one sheet.
  - **`open-doc export [ids…] --format pdf|html|png`** produces the Download menu's output from a script. It drives the real viewer in headless Chromium, so nothing about layout is re-implemented on the Node side. Playwright is an optional peer, not a dependency.
  - **`open-doc import <file.md>`** turns Markdown into a real document — `flow()` body, cover, self-filling contents, GFM tables, local images copied into the document's `assets/`. The output is ordinary authored TSX, so the outline, the inspector, and the design panel all work on it. Also available as the `import_markdown` tool.
  - **Fixed:** the flow packer's `measuring` flag read false for one commit after a document loaded, so anything reading the page list in that window — the outline scan, thumbnails, the page counter — saw an unpaginated flow section as a single page.

- [#19](https://github.com/simonliu-ai-product/open-doc/pull/19) [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The furniture a long document needs, and tables that come from data files.
  
  - **`<Footnote>`** — numbered by position across the whole document, printed at the foot of whatever page its marker landed on. Inside a `flow()` section the notes are lifted out of the blocks *before* measurement and their height is charged to the page budget, so the packer breaks pages knowing what the foot of each one already owes. Fixed pages place them with an explicit `<Footnotes />`.
  - **`<Figure caption id>`** (`kind="table"` for tables) — numbered from a scan of the rendered pages, caption and content in one unbreakable block, with `<ListOfFigures />` / `<ListOfTables />` to build the lists.
  - **`<Ref to="id" />`** — renders `Figure 3`, and appends the page only when the target is on another sheet. A reference to an id nothing declares renders visibly and is reported by `open-doc check` as a new `unresolved-ref` error.
  - **`meta.labels`** — what numbered things are called (`圖`, `表`, `（第 {page} 頁）`). The numbering itself is structural.
  - **`<DataTable>` + `.csv`/`.tsv` imports** — data files resolve to arrays of objects at build time (quoted fields, embedded newlines, CRLF), and the table infers alignment and grouping from the column's contents. Data is never fetched at render time: the packer measures the real DOM, so anything arriving a tick later arrives after the layout is decided.
  - **Fixed:** `stackedHeights` measured the last node of every measurement container after the first as zero, because it mixed `offsetTop` (host-relative) with the container's own height. It now takes both from the same box, which corrects footnote reservation and the last block of every flow section after the first.

### Patch Changes

- [#19](https://github.com/simonliu-ai-product/open-doc/pull/19) [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Resolve `@open-document/mcp` from the workspace running the dev server, so `--mcp` mounts under pnpm's strict node_modules layout instead of silently disabling itself.

## 0.2.0

### Minor Changes

- [#12](https://github.com/simonliu-ai-product/open-doc/pull/12) [`40e8f98`](https://github.com/simonliu-ai-product/open-doc/commit/40e8f9810b3d8f51264b72974af10e8a3d137cab) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Publish the reader's position to `node_modules/.open-doc/current.json` while `open-doc dev` runs, and ship a `current-doc` skill so an agent can resolve "this page" and "this element" without asking. The cursor carries the document id, the rendered page number, the source path, and whatever the inspector has selected; a selection clears when you move to another sheet.

### Patch Changes

- [#13](https://github.com/simonliu-ai-product/open-doc/pull/13) [`fa2f15f`](https://github.com/simonliu-ai-product/open-doc/commit/fa2f15f7ae284b3020be0fb90979ac28288ffeec) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Move to vite 8, `@vitejs/plugin-react` 6, and `@babel/parser` 8. Build output keeps its `.js` / `.d.ts` names — tsdown 0.22 would otherwise rename everything to `.mjs` / `.d.mts` and break the exports map.

- [#10](https://github.com/simonliu-ai-product/open-doc/pull/10) [`d70eafe`](https://github.com/simonliu-ai-product/open-doc/commit/d70eafe811dd8334334c403672c69e38b055a5ad) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Mark the viewer's scrolling pane with `data-od-viewer` so page frames in the main pane can be told apart from the thumbnail rail.

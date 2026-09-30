# @open-document/core

## 0.8.0

### Minor Changes

- [#41](https://github.com/simonliu-ai-product/open-doc/pull/41) [`0e8f077`](https://github.com/simonliu-ai-product/open-doc/commit/0e8f077bd6a30f342d5df97eb1a1311f73a317aa) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Read several pages at once: a Continuous / Two-up / Grid control beside the
  zoom buttons.
  
  - **Two-up** faces pages the way a bound document is read — page 1 alone on the
    right, then 2–3, 4–5 — so you can see whether a figure still sits with its
    caption and whether facing pages balance.
  - **Grid** is a contact sheet: sheets in columns that line up, as many across
    as fit, for scanning a chapter at once.
  - Zoom and mode compose: fit width fits the spread in two-up and a row of three
    in grid, and the auto zoom keeps the unit readable.
  - Everything that worked in one column still does. The page counter follows
    the row in view (and reports the page you jumped to), page jump, the outline,
    find, the thumbnails and editing on the page all behave as before, and
    switching modes keeps you on the page you were reading.
  - The mode is remembered per document.

## 0.7.0

### Minor Changes

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The design panel works the way open-slide 2.0's does.
  
  - **Undo and redo.** Every design change is a step in the document view's
    history — a slider drag is one step, not fifty — alongside each finished edit
    made on the page. ⌘Z and ⇧⌘Z outside a field, or the buttons on the card.
  - **One save card.** Page edits and the design draft are counted, saved and
    discarded together from one card at the foot of the view; ⌘S saves both. The
    panel's own Save and Discard buttons are gone. The two are written one after
    the other, never at once, since both rewrite the same file.
  - **One dock.** The design panel and the element panel share the right-hand
    dock and its chrome; design wins while open. `D` toggles it.
  - **Fields.** A colour only reaches the draft as a complete `#rrggbb`, and a
    half-typed one reverts when you leave the field. Every slider has a number
    beside it that can be typed or stepped with the arrow keys. A font list shows
    "Custom" only when the source holds a stack no preset matches, and gains
    Inter. The header marks an unsaved draft, and a document that has no `design`
    yet.
  - The panel opens once its draft is ready rather than on a spinner, and its
    content fades in instead of the dock resizing the pages frame by frame.

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Captions, table headings and footnotes can be selected and edited on the page.
  
  `Figure`, `DataTable` and `Footnote` now point what they print back at their
  call site in dev, so clicking a table, a figure or a note selects it. A caption
  is written to the `caption` attribute, a table heading to its column's `label`,
  and a footnote printed at the foot of the page to the text inside its
  `<Footnote>`. Rows that come from an imported `.csv` are not editable here: the
  table is selected and the panel names the file to edit, with a comment box for
  the agent.
  
  `read_text` and `write_text` take a `prop` path (`caption`, `columns.2.label`)
  for words a component prints from an attribute.
  
  Edit mode also survives the reload the dev server sends when a document is
  added or removed.

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Formatting already in a document can be edited on the page, and the toolbar
  gains code, links, and clear formatting.
  
  Text written beside bare `<strong>`, `<em>`, `<code>` or `<a href>` is now one
  run: a paragraph like `Use real <code>h1</code> elements` is edited as the
  sentence it is, bold can be taken off after it was saved, and the words inside
  it can be retyped. A tag with any other attribute — a `style`, a `className` —
  is still left as written. A changed run is rewritten on one line, so a
  formatter's `{' '}` line breaks are folded into plain spaces; it renders the
  same.
  
  - Code: ⌘E. Link: ⌘K, or the toolbar, with the address typed in place; a caret
    inside a link edits it, and an empty address removes it. Only web, mail,
    phone and in-document addresses are accepted — the server checks too, since
    links survive into exported HTML. Clear formatting: ⌘\.
  - Bold is disabled, and says why, where the element is already bold by its
    own style.
  - The toolbar shows only when there is something to act on, reads clearly in
    both themes, and a selection on the page takes the inspector's blue rather
    than the dark theme's highlight.
  
  `write_text` (and `PUT /__edit/text`) refuse plain text over a run that carries
  formatting rather than drop it; pass `segments`, which `read_text` now returns.

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Text is edited on the page, where it is printed.
  
  The viewer has a Preview / Edit switch in place of the Inspect button. In edit
  mode a click selects an element and a double-click (or Enter) opens its text
  right on the sheet; Enter keeps the change, Escape reverts it. Changes stay on
  the page, marked as unsaved, until Save (⌘S) — or leaving edit mode — writes
  them all to source in one request and one hot reload. Discard puts back what
  was there. Inline markup between runs of text stays as written, and an edit
  that would reach across it is refused.
  
  `PUT /__edit/texts` applies several run replacements at once. Every edit is
  located against the source the reader saw, so a heading that grew does not
  shift the paragraph below it; a stale edit is reported and the rest still land.
  
  The design panel and the element panel share the right-hand dock; design wins
  while it is open.

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Bold and italic while editing on the page.
  
  A small toolbar floats over the text being edited, with Bold (⌘B) and Italic
  (⌘I). Select words and toggle; the emphasis shows on the page at once, stays
  unsaved with the rest of the edit, and is written to source as `<strong>` and
  `<em>` on Save. Undo and Escape take it back like any other change.
  
  Only text written in the document itself can take emphasis. Text passed in as a
  string — a prop, an entry in an array — has nowhere in source to hold a tag, so
  the buttons are disabled there and say why; the words themselves stay editable.
  Size, colour and alignment are not offered: they belong to the document's
  design system.

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Shift+Enter breaks the line while editing on the page, written to source as
  `<br />`. A `<br />` already in a paragraph no longer splits it into separate
  runs: the paragraph is edited as one, and its breaks are kept. Enter still
  keeps the change; text passed in as a string cannot hold a break, so
  Shift+Enter does nothing there.

### Patch Changes

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Nothing is written into a document that has a syntax error. Reading still
  tolerates a document mid-edit, but the design panel, on-page text edits,
  comment markers and renames all splice by position in the parsed source, and a
  tree Babel recovered from an error could put the splice in the wrong place —
  they now refuse and say why.
  
  The design panel's `DesignSystem` import is added correctly in every shape of
  import: after the last name rather than before the brace (so `{ a, }` no longer
  becomes `{ a, , type DesignSystem }`), without a second `type` inside
  `import type { … }`, and as its own statement beside a namespace or
  default-only import, which used to be left without it.

## 0.6.0

### Minor Changes

- [#32](https://github.com/simonliu-ai-product/open-doc/pull/32) [`906390b`](https://github.com/simonliu-ai-product/open-doc/commit/906390bf466f723721debf659374691222a97a45) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The inspector edits text wherever it actually lives.
  
  A document written through helpers used to report `text is produced by code` for
  most of itself: the words behind `{agency}`, `{line}` or `{children}` are not in
  the element that renders them. Each child of the selected element now resolves
  on its own — to a call site's attribute, to one entry of an array the call site
  passed, to whatever sits between its tags, or to a template literal. Runs that
  cannot be told apart by what is on screen are still refused, so a save never
  rewrites a sibling.
  
  Resolving the element as a whole was also why `{label}：{value}` offered nothing
  but the colon: the literal was found, so the props were never looked for.
  
  A contents row selects the heading it was generated from, and scrolls to it —
  the list stays a view of the headings rather than something to type into.
  
  The text panel is one field instead of one per run. A sentence interrupted by
  five `<code>` spans is still a sentence; it now reads like one, with the markup
  between the words as inert chips.

## 0.5.0

### Minor Changes

- [#30](https://github.com/simonliu-ai-product/open-doc/pull/30) [`a08c7f9`](https://github.com/simonliu-ai-product/open-doc/commit/a08c7f9b23a5ef730e113e4be94c12fd629b017e) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Viewer: find in document, page jump, distinct zoom icons, and PNG/SVG export with a page range.
  
  - The toolbar had two identical square icons — fit-page and fullscreen. Fit-page is
    now an up-down arrow, pairing with the left-right arrow that fits the width, and a
    per-cent button resets the zoom to 100%.
  - The page counter is an input: type a number to jump there.
  - A find control beside it searches the rendered document. Matches are painted with
    the CSS Custom Highlight API rather than wrapped in markup, so nothing React owns
    is edited; a browser without the API still navigates between hits.
  - Download offers PNG and SVG alongside PDF and HTML, and asks which pages first —
    all, the current one, or a range like `1-3, 5`. One page downloads as one file;
    several arrive as a zip.

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

# @open-document/core

## 0.12.0

### Minor Changes

- [#66](https://github.com/simonliu-ai-product/open-doc/pull/66) [`8a51291`](https://github.com/simonliu-ai-product/open-doc/commit/8a51291b525c7abda3d2646f9220d155e87461a7) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Add a Changes panel to the viewer (`C`, or the Changes button in the header). It lists what changed in the document's folder since the last commit, or an earlier commit you pick: each change in the document's own source is marked on the page where it prints (added, rewritten, or removed), changed pages get a dot in the page rail, and each change can be reverted in source on its own. The header shows how many changes there are, and the list follows the file as an agent writes it.

- [#69](https://github.com/simonliu-ai-product/open-doc/pull/69) [`35d4fad`](https://github.com/simonliu-ai-product/open-doc/commit/35d4fad0bb8d2310cc743bbab87e346b45c97568) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Set Chinese, Japanese and Korean properly. A document declares its language with `meta.lang` (`'zh-Hant-TW'`, `'ja'`…), and every sheet — in the viewer, the thumbnails, the flow measurement and the PDF, HTML, PNG and Word exports — carries it, so glyphs and line-breaking follow the document rather than the reader's interface language (which used to leak into the page). The sheet's base style adds strict kinsoku and an eighth-em gap where CJK meets Latin letters or digits, and phrase-aware breaks in Japanese headings. HTML exports declare the document's language instead of always `en`, and Word files set the East Asian language. Markdown import takes `--lang` (and `lang` in front matter or over MCP), and detects Traditional or Simplified Chinese, Japanese and Korean when it is not given.

- [#70](https://github.com/simonliu-ai-product/open-doc/pull/70) [`1c4b665`](https://github.com/simonliu-ai-product/open-doc/commit/1c4b665963a79d058ff7b1f2988d8499be7117f6) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Print one document per row of data. A document that does `export const records = rows` (an imported `.csv`) is laid out once per row: pages read the row with `useRecord()` or print a value with `<Field name="…" />`, the viewer gets a record picker (and `?record=` to open on a row), and `open-doc export <id> --each` writes one file per row, named by `meta.recordName` (`'certificate-{name}'`, `{#}` for the row number) or `--name`. MCP's `export_document` takes `each` and `name`. A `certificate` template shows the whole thing.
  
  Also fixes a flow-layout bug: a block that rendered nothing was measured as a page break glued to the next block, so a conditional block could push everything after it onto a new page.
  
  Also fixes a race in flow measurement: the offscreen render was left to React's schedule, and on a slow machine it could still be empty when it was measured, so a flow section packed as no pages. The measuring render now commits synchronously and is checked for every block before it is read. And when the viewer is sent to a document the dev server's watcher has not noticed yet, it rescans the docs folder instead of reporting it missing.

- [#68](https://github.com/simonliu-ai-product/open-doc/pull/68) [`19634aa`](https://github.com/simonliu-ai-product/open-doc/commit/19634aaa32f311319f6f5663a5993f67bd5aecfd) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Start documents from templates. open-doc ships `report`, `proposal`, `meeting-notes`, `letter` and `blank`, and a workspace can add its own under `templates/<name>/` (an `index.tsx`, plus an optional `template.json` with a title, description, category and the placeholder title to replace).
  
  - `open-doc templates` lists every template with the name to use; `open-doc new <id> --template <name> --title "…"` creates a document from one, retitled where the title prints and dated today.
  - The document browser has a **New document** button: a gallery of the templates, each showing its name, and a title field. A document created inside a folder view is filed into that folder.
  - `npx @open-document/cli templates` lists them, and `init --template <name>` starts the workspace with that document.
  - MCP: `list_templates` and `create_from_template`.

- [#67](https://github.com/simonliu-ai-product/open-doc/pull/67) [`6dca67e`](https://github.com/simonliu-ai-product/open-doc/commit/6dca67e853dfc5b2ee38dc43d00c608fc06ddc24) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Add a Comments panel to the viewer (`M`, or the Comments button in the header). Review notes left on the document are listed in order with the words of the element each is about, pinned on the page with a number, and marked in the page rail; clicking one goes to it, Resolve takes its marker out of the source, and New comment goes straight to picking an element with the note open. "Copy request for the agent" copies `/apply-comments docs/<id>`, and the agent's edits then show under Changes, which no longer counts the comment markers themselves.

### Patch Changes

- [#72](https://github.com/simonliu-ai-product/open-doc/pull/72) [`dc4cb10`](https://github.com/simonliu-ai-product/open-doc/commit/dc4cb10c1a3aaab5c0aebd33dec5e6fccd57edf1) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Selecting a value a document prints from its `records` (`<Field>`) now shows where it comes from — the data file, the row shown, and each column with its value for that row — instead of "element has no text of its own", so it is clear the cell is what to edit. The status line no longer offers double-click editing on an element that cannot be edited.

- [#71](https://github.com/simonliu-ai-product/open-doc/pull/71) [`df270dc`](https://github.com/simonliu-ai-product/open-doc/commit/df270dcb160fcc4b54cd439dcafde67d8f6060ff) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Document and theme cards preview in one box size, so titles line up along a row: each sheet is scaled to fit a portrait-A4 frame whole and centred, and a landscape page is letterboxed on the canvas colour instead of making a shorter card. New comment now shows that it is waiting for an element — the Comments panel stays open with the button pressed, the pointer is a crosshair over the page, and Esc or pressing it again cancels — instead of closing the panel with no sign of what to do next.

## 0.11.0

### Minor Changes

- [#64](https://github.com/simonliu-ai-product/open-doc/pull/64) [`a25f0b5`](https://github.com/simonliu-ai-product/open-doc/commit/a25f0b501796819eeb0df09f88cab556a528c07c) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Add a Format section to the element panel: font, size, weight, emphasis, alignment, line height, letter spacing, text and fill colour for the selected element. Each value offers the document's design tokens first and is written into the element's `style` in source, saved together with on-page text edits.

## 0.10.0

### Minor Changes

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

- [#55](https://github.com/simonliu-ai-product/open-doc/pull/55) [`bb8e505`](https://github.com/simonliu-ai-product/open-doc/commit/bb8e50591d1b7d65eefc4e15d711a5a1d75391db) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - `<Chart>` draws bar, line and pie charts from data. You no longer need to build
  them by hand from `div`s:
  
  ```tsx
  import costs from './data/costs.csv';
  
  <Chart data={costs} x="month" y={['cost', 'budget']} format="integer"
         caption="每月費用與預算" />
  <Chart type="line" data={costs} x="month" y="uptime" format="percent" values />
  <Chart type="pie" data={services} x="service" y="cost" values />
  ```
  
  - **Bars**: grouped or `stacked`, and they stand on zero, negative values
    included.
  - **Lines**: one per series.
  - **Pies**: a legend that gives each slice's share.
  - **Axes**: ticks fall on round numbers. Crowded category labels thin out
    instead of colliding. `format` takes the same values as `<DataTable>`.
  - **Colours**: the document's accent, then tints of it and of the text colour,
    so a chart changes with the design.
  - **Layout**: drawn synchronously into a fixed box, so it paginates like any
    other block.
  - **Figures**: with a caption it is numbered and appears in
    `<ListOfFigures />`.
  - **Word**: the export places it as a picture.

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

- [#47](https://github.com/simonliu-ai-product/open-doc/pull/47) [`112c286`](https://github.com/simonliu-ai-product/open-doc/commit/112c286823ee9b4b2594ef82c0cb1cd0a2a8948e) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - `flow()` takes a running `header` alongside `footer`:
  
  ```tsx
  flow(<>…</>, { header: Header, footer: Footer })
  ```
  
  It prints on every page the section expands into, with `useDocPageNumber()` and
  `useDocPageCount()` working inside it. Position it absolutely in the top margin
  band, like a footer in the bottom one; neither takes space from the blocks.
  
  The Word export carries it as a real Word header, page numbers as `PAGE` /
  `NUMPAGES` fields. Fixed pages sit in sections with no header or footer.

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

- [#47](https://github.com/simonliu-ai-product/open-doc/pull/47) [`112c286`](https://github.com/simonliu-ai-product/open-doc/commit/112c286823ee9b4b2594ef82c0cb1cd0a2a8948e) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The page has a base stylesheet of its own. The viewer's CSS reset used to
  reach the sheet too, so a heading, a link or a quote written without inline
  styles printed as plain body text. Now bare elements start from the
  document's design:
  
  - Headings are bold, sized from `--od-size-h1`/`h2`/`h3`, and set in the
    heading font.
  - Paragraphs, lists, quotes and tables get a bottom margin.
  - Links take the accent colour and an underline.
  - `code` and `pre` use the document's mono font instead of the viewer's.
  - A quote has a rule on its leading edge.
  - The sheet's default text is the design's body font, size and leading.
  
  Inline styles and a document's own stylesheet still win. A document that
  styled everything inline looks the same as before. One that relied on bare
  elements now looks like a document, and may paginate differently.

- [#54](https://github.com/simonliu-ai-product/open-doc/pull/54) [`9b946d0`](https://github.com/simonliu-ai-product/open-doc/commit/9b946d071b9ceb35362a23428222a9356041b4bd) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - PDFs written by `open-doc export` (and MCP's `export_document`) carry the
  document outline as bookmarks, so a long report opens with a navigable sidebar
  in Acrobat or Preview. They are also tagged for screen readers.
  
  The bookmarks are exactly the outline the viewer's sidebar and
  `<TableOfContents />` show: a heading marked `data-od-outline="skip"` (the
  cover title, "Contents") is left out, and `data-od-heading` sets a bookmark's
  text. The Download menu prints through the browser's dialog, which doesn't
  write bookmarks.

### Patch Changes

- [#60](https://github.com/simonliu-ai-product/open-doc/pull/60) [`b91e939`](https://github.com/simonliu-ai-product/open-doc/commit/b91e939390b9082f1fcd72abd13d8377cd7911cb) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - The document browser's pages now line up. Documents, folders, Themes and
  Assets share one page frame, one header (title, description, actions), one
  empty state, and one card width and grid, so moving between them no longer
  shifts every edge.
  
  - **Document cards** wrap long titles onto a second line instead of cutting
    them off. Their second line reads as the sheet and the date, e.g.
    `A4 · Oct 1, 2026`, where it used to say `3 + flow`.
  - **Asset cards** use the same layout as documents:
    - The name has its own line.
    - The size and an *unused* note sit beneath it.
    - Copy import is a button, and Rename and Delete are in the ⋯ menu.
  - **Asset previews** are drawn on white paper in both themes, so a dark logo
    is visible.
  - **Assets page**:
    - The Upload button sits in the header.
    - Files can be dropped anywhere on the page.
    - The scope switcher is a segmented control. Its first option is called
      *Project*, as in the viewer's assets panel.

- [#58](https://github.com/simonliu-ai-product/open-doc/pull/58) [`a95ec73`](https://github.com/simonliu-ai-product/open-doc/commit/a95ec7355aeefcf8916b7774436e5cf6f6ab8b9f) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Diagrams now fit their box. A `<Diagram>` given a `width`, or placed in a column
  narrower than its natural size, used to shrink only its container while the
  drawing ran past it. It now scales down, keeping its aspect ratio. Box corners
  also take `--od-radius` as intended; the radius had been set as an attribute,
  which does not accept a CSS variable.

- [#59](https://github.com/simonliu-ai-product/open-doc/pull/59) [`235c055`](https://github.com/simonliu-ai-product/open-doc/commit/235c0554668a41a69487d3efb89a767b731df4a1) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - A clearer Download menu:
  
  - **Page choice.** All, This page and Range sit in one row of equal segments,
    so a label no longer wraps onto two lines.
  - **Range.** Choosing Range puts the cursor in the range field. The menu reads
    back what it will download as you type (`Pages 1–3, 6 · 4 pages`), or says
    that the pages don't exist and how many the document has.
  - **Formats.** They are grouped by what the file is for (Print & share, Edit,
    Images), with the extension each one produces.

- [#56](https://github.com/simonliu-ai-product/open-doc/pull/56) [`b2b2096`](https://github.com/simonliu-ai-product/open-doc/commit/b2b2096ff6954bb1299be46e4167bd697048a2b5) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - A tidier viewer toolbar:
  
  - **Grouped by job.** The way back and the title sit on the left. How you are
    looking (page, zoom, layout, fullscreen) is in the centre. What you do to the
    document (search, preview/edit, design, download) is on the right.
  - **The page number is a visible field.** Type a page and press Enter to go
    there.
  - **The zoom is a field too.** Type `150` and press Enter for 150%. Values
    outside 25–200% are clamped. Beside it, a menu holds Fit width, Fit page,
    Actual size and common sizes, replacing three icon buttons. One of those
    (`%`) did what clicking the percentage already did.

## 0.9.1

### Patch Changes

- [#45](https://github.com/simonliu-ai-product/open-doc/pull/45) [`e8b352d`](https://github.com/simonliu-ai-product/open-doc/commit/e8b352d5c9fd2f4fc51645d8ee1603ea4a629f43) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Fixes on the printed page:
  
  - A plain `<ul>` or `<ol>` in a document prints as a list again — bullets,
    numbers and indent. The viewer's CSS reset had stripped them on the sheet as
    well as in the chrome. The measuring pass gets the same styles, so pages break
    where the list actually ends, and a list the document styles itself keeps its
    own style.
  - Inline SVG gradients, clip paths and diagram arrowheads show in PDF export.
    Each copy of a page had pointed its `url(#…)` references at the first element
    with that id, which is the thumbnail's, and printing hides the thumbnails.
  - Diagrams: `A[(database)]` draws a cylinder instead of a box with brackets in
    its label. A link back to an earlier step goes round the side instead of
    through the steps in between. A document without a `design` no longer gets
    solid black shapes.

## 0.9.0

### Minor Changes

- [#43](https://github.com/simonliu-ai-product/open-doc/pull/43) [`c598b3b`](https://github.com/simonliu-ai-product/open-doc/commit/c598b3bc0cc76f5fc0e53b03d65ec09a3fd73b73) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Export to Word (`.docx`), for review that runs in Word — track changes, Word
  comments, pasting a section into someone else's template.
  
  ```bash
  open-doc export my-report --format docx
  ```
  
  and **Word (DOCX)** in the viewer's Download menu, with the same page range
  prompt as the other formats. MCP's `export_document` takes `docx` too.
  
  The output is structure that Word lays out itself, not a picture of the pages —
  Word repaginates the moment anyone edits:
  
  - Page size, orientation and margins from the document; each fixed page starts
    a new Word page, and a `flow()` section's pages continue one another. A fixed
    page keeps where it placed its words — a cover's title low on the sheet, a
    closing line centred — and sits in a section without the flow's footer.
  - Headings become Word's Heading styles, so the navigation pane works; the
    cover's title becomes Title, and a heading kept out of the outline ("Contents")
    becomes TOC Heading.
  - `<TableOfContents />` becomes a TOC field Word updates when the file opens;
    `<ListOfFigures />` and `<ListOfTables />` point at bookmarked captions with
    `PAGEREF` fields, dot leaders and all.
  - Bold, italic, underline, strikethrough, colour, size, code and links are read
    from the rendered page's own styles; line breaks, lists (each ordered list
    counting on its own) and code blocks with their indentation survive. A code
    block's panel and a quote's rule come across as a shaded, bordered box, and
    code is kept out of the spelling check.
  - Tables keep their column widths, cell borders and a header row that repeats
    across pages; captions use the Caption style.
  - `<Footnote>` becomes a real Word footnote.
  - A `flow()` footer becomes the Word footer, with `PAGE` and `NUMPAGES` fields
    where the page numbers were.
  - Fonts come from the design: the first real family in each stack, and a CJK
    family anywhere in it as the East Asian font (`w:eastAsia`), so Word does not
    substitute one and change the line breaks. A font table names a stand-in of
    the same kind for each, so code stays monospaced where the web font is not
    installed.
  - Images are embedded; anything drawn rather than written — a chart made of
    boxes, a compiled diagram — is placed as a picture.
  
  Not carried over: decoration drawn with no text (a coloured band), running
  lines drawn inside fixed pages, rounded corners, and page-for-page breaks.
  
  Also fixes PNG and SVG downloads from the viewer laying a page out against no
  height: anything placed against the foot of the sheet — a footer, a cover's
  title, a centred closing page — moved up to the top.

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

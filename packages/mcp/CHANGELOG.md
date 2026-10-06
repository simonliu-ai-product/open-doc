# @open-document/mcp

## 0.6.1

### Patch Changes

- Updated dependencies [[`a25f0b5`](https://github.com/simonliu-ai-product/open-doc/commit/a25f0b501796819eeb0df09f88cab556a528c07c)]:
  - @open-document/core@0.11.0

## 0.6.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`28b56fb`](https://github.com/simonliu-ai-product/open-doc/commit/28b56fbd4120790d6b15bfada9761baa0761409b), [`b91e939`](https://github.com/simonliu-ai-product/open-doc/commit/b91e939390b9082f1fcd72abd13d8377cd7911cb), [`bb8e505`](https://github.com/simonliu-ai-product/open-doc/commit/bb8e50591d1b7d65eefc4e15d711a5a1d75391db), [`a95ec73`](https://github.com/simonliu-ai-product/open-doc/commit/a95ec7355aeefcf8916b7774436e5cf6f6ab8b9f), [`33b5688`](https://github.com/simonliu-ai-product/open-doc/commit/33b5688136d31545cf953a5b8d9e7737392556e2), [`235c055`](https://github.com/simonliu-ai-product/open-doc/commit/235c0554668a41a69487d3efb89a767b731df4a1), [`112c286`](https://github.com/simonliu-ai-product/open-doc/commit/112c286823ee9b4b2594ef82c0cb1cd0a2a8948e), [`1cf458d`](https://github.com/simonliu-ai-product/open-doc/commit/1cf458d80d13aeb090bdb5983b1f0fb7bef28fda), [`2727875`](https://github.com/simonliu-ai-product/open-doc/commit/27278756c9ad5959dc392813d9aa943957d5290d), [`112c286`](https://github.com/simonliu-ai-product/open-doc/commit/112c286823ee9b4b2594ef82c0cb1cd0a2a8948e), [`9b946d0`](https://github.com/simonliu-ai-product/open-doc/commit/9b946d071b9ceb35362a23428222a9356041b4bd), [`b2b2096`](https://github.com/simonliu-ai-product/open-doc/commit/b2b2096ff6954bb1299be46e4167bd697048a2b5)]:
  - @open-document/core@0.10.0

## 0.5.0

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

### Patch Changes

- Updated dependencies [[`c598b3b`](https://github.com/simonliu-ai-product/open-doc/commit/c598b3bc0cc76f5fc0e53b03d65ec09a3fd73b73)]:
  - @open-document/core@0.9.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`0e8f077`](https://github.com/simonliu-ai-product/open-doc/commit/0e8f077bd6a30f342d5df97eb1a1311f73a317aa)]:
  - @open-document/core@0.8.0

## 0.4.0

### Minor Changes

- [#39](https://github.com/simonliu-ai-product/open-doc/pull/39) [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - `read_text` and `write_text` understand formatted text and component props.
  
  - `read_text` returns `segments` for a run that carries bold, italic, code,
    links or line breaks; `write_text` takes `segments` to write it back with its
    formatting. Plain text over a formatted run is refused rather than stripping
    the formatting.
  - Both take a `prop` path — `caption`, `columns.2.label` — for words a
    component prints from an attribute, as the rendered element's
    `data-od-prop` names it.

### Patch Changes

- Updated dependencies [[`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3), [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3), [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3), [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3), [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3), [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3), [`1996ca7`](https://github.com/simonliu-ai-product/open-doc/commit/1996ca7bf212b58b1e736e83f6eb4a7026983ff3)]:
  - @open-document/core@0.7.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`906390b`](https://github.com/simonliu-ai-product/open-doc/commit/906390bf466f723721debf659374691222a97a45)]:
  - @open-document/core@0.6.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`a08c7f9`](https://github.com/simonliu-ai-product/open-doc/commit/a08c7f9b23a5ef730e113e4be94c12fd629b017e)]:
  - @open-document/core@0.5.0

## 0.3.0

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

### Patch Changes

- Updated dependencies [[`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f), [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f), [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f), [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f), [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f), [`f9d35f2`](https://github.com/simonliu-ai-product/open-doc/commit/f9d35f288a589eb51cf7a465d97d38df939b0c4f)]:
  - @open-document/core@0.4.0

## 0.2.0

### Minor Changes

- [#19](https://github.com/simonliu-ai-product/open-doc/pull/19) [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Give agents eyes, a headless renderer, and a Markdown front door.
  
  - **`open-doc check`** renders every sheet at true page size and reports the layout faults an agent writing React cannot see — content clipped by the page edge, blank sheets, headings stranded at the foot of a page, type too small to print, images that never loaded — each with the `line:column` in the source. Exits non-zero, so it works as a CI gate. Same report as the new `check_layout` MCP tool; `render_page` returns a PNG of one sheet.
  - **`open-doc export [ids…] --format pdf|html|png`** produces the Download menu's output from a script. It drives the real viewer in headless Chromium, so nothing about layout is re-implemented on the Node side. Playwright is an optional peer, not a dependency.
  - **`open-doc import <file.md>`** turns Markdown into a real document — `flow()` body, cover, self-filling contents, GFM tables, local images copied into the document's `assets/`. The output is ordinary authored TSX, so the outline, the inspector, and the design panel all work on it. Also available as the `import_markdown` tool.
  - **Fixed:** the flow packer's `measuring` flag read false for one commit after a document loaded, so anything reading the page list in that window — the outline scan, thumbnails, the page counter — saw an unpaginated flow section as a single page.

### Patch Changes

- Updated dependencies [[`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9), [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9), [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9), [`7040726`](https://github.com/simonliu-ai-product/open-doc/commit/7040726f2ecf431a6e4750f216ce4903f3c9ccc9)]:
  - @open-document/core@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`fa2f15f`](https://github.com/simonliu-ai-product/open-doc/commit/fa2f15f7ae284b3020be0fb90979ac28288ffeec), [`d70eafe`](https://github.com/simonliu-ai-product/open-doc/commit/d70eafe811dd8334334c403672c69e38b055a5ad), [`40e8f98`](https://github.com/simonliu-ai-product/open-doc/commit/40e8f9810b3d8f51264b72974af10e8a3d137cab)]:
  - @open-document/core@0.2.0

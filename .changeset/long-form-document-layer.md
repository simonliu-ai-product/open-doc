---
"@open-document/core": minor
---

The furniture a long document needs, and tables that come from data files.

- **`<Footnote>`** — numbered by position across the whole document, printed at the foot of whatever page its marker landed on. Inside a `flow()` section the notes are lifted out of the blocks *before* measurement and their height is charged to the page budget, so the packer breaks pages knowing what the foot of each one already owes. Fixed pages place them with an explicit `<Footnotes />`.
- **`<Figure caption id>`** (`kind="table"` for tables) — numbered from a scan of the rendered pages, caption and content in one unbreakable block, with `<ListOfFigures />` / `<ListOfTables />` to build the lists.
- **`<Ref to="id" />`** — renders `Figure 3`, and appends the page only when the target is on another sheet. A reference to an id nothing declares renders visibly and is reported by `open-doc check` as a new `unresolved-ref` error.
- **`meta.labels`** — what numbered things are called (`圖`, `表`, `（第 {page} 頁）`). The numbering itself is structural.
- **`<DataTable>` + `.csv`/`.tsv` imports** — data files resolve to arrays of objects at build time (quoted fields, embedded newlines, CRLF), and the table infers alignment and grouping from the column's contents. Data is never fetched at render time: the packer measures the real DOM, so anything arriving a tick later arrives after the layout is decided.
- **Fixed:** `stackedHeights` measured the last node of every measurement container after the first as zero, because it mixed `offsetTop` (host-relative) with the container's own height. It now takes both from the same box, which corrects footnote reservation and the last block of every flow section after the first.

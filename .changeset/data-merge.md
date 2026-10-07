---
"@open-document/core": minor
"@open-document/mcp": minor
---

Print one document per row of data. A document that does `export const records = rows` (an imported `.csv`) is laid out once per row: pages read the row with `useRecord()` or print a value with `<Field name="…" />`, the viewer gets a record picker (and `?record=` to open on a row), and `open-doc export <id> --each` writes one file per row, named by `meta.recordName` (`'certificate-{name}'`, `{#}` for the row number) or `--name`. MCP's `export_document` takes `each` and `name`. A `certificate` template shows the whole thing.

Also fixes a flow-layout bug: a block that rendered nothing was measured as a page break glued to the next block, so a conditional block could push everything after it onto a new page.

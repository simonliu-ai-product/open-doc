---
"@open-document/core": minor
"@open-document/mcp": minor
---

Print one document per row of data. A document that does `export const records = rows` (an imported `.csv`) is laid out once per row: pages read the row with `useRecord()` or print a value with `<Field name="…" />`, the viewer gets a record picker (and `?record=` to open on a row), and `open-doc export <id> --each` writes one file per row, named by `meta.recordName` (`'certificate-{name}'`, `{#}` for the row number) or `--name`. MCP's `export_document` takes `each` and `name`. A `certificate` template shows the whole thing.

Also fixes a flow-layout bug: a block that rendered nothing was measured as a page break glued to the next block, so a conditional block could push everything after it onto a new page.

Also fixes a race in flow measurement: the offscreen render was left to React's schedule, and on a slow machine it could still be empty when it was measured, so a flow section packed as no pages. The measuring render now commits synchronously and is checked for every block before it is read. And when the viewer is sent to a document the dev server's watcher has not noticed yet, it rescans the docs folder instead of reporting it missing.

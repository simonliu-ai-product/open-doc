---
'@open-document/core': minor
---

PDFs written by `open-doc export` (and MCP's `export_document`) carry the
document outline as bookmarks, so a long report opens with a navigable sidebar
in Acrobat or Preview. They are also tagged for screen readers.

The bookmarks are exactly the outline the viewer's sidebar and
`<TableOfContents />` show: a heading marked `data-od-outline="skip"` (the
cover title, "Contents") is left out, and `data-od-heading` sets a bookmark's
text. The Download menu prints through the browser's dialog, which doesn't
write bookmarks.

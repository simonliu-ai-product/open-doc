---
"@open-document/core": minor
"@open-document/mcp": minor
---

Work on part of a long document without reading it whole: `outline_document` (line count, top-level blocks with their line ranges, h1–h3 with their lines), `read_document` with `fromLine`/`toLine`, `search_document` (every line containing some text) and `edit_document` (exact find-and-replace, within `fromLine`/`toLine` when the same text appears elsewhere, `all` for every occurrence; text copied with its JSON escapes still matches). Whatever an agent reads is sent again on each later model call, so this cuts its token use on long documents. `read_document` without a range still returns the whole file.

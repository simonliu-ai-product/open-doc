---
'@open-document/core': minor
'@open-document/mcp': minor
---

Restrict page sizes to A4, B4 and A3, portrait or landscape — and fix the landscape `@page` descriptor

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

---
'@open-document/core': patch
---

Nothing is written into a document that has a syntax error. Reading still
tolerates a document mid-edit, but the design panel, on-page text edits,
comment markers and renames all splice by position in the parsed source, and a
tree Babel recovered from an error could put the splice in the wrong place —
they now refuse and say why.

The design panel's `DesignSystem` import is added correctly in every shape of
import: after the last name rather than before the brace (so `{ a, }` no longer
becomes `{ a, , type DesignSystem }`), without a second `type` inside
`import type { … }`, and as its own statement beside a namespace or
default-only import, which used to be left without it.

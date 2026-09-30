---
'@open-document/core': minor
---

Bold and italic while editing on the page.

A small toolbar floats over the text being edited, with Bold (⌘B) and Italic
(⌘I). Select words and toggle; the emphasis shows on the page at once, stays
unsaved with the rest of the edit, and is written to source as `<strong>` and
`<em>` on Save. Undo and Escape take it back like any other change.

Only text written in the document itself can take emphasis. Text passed in as a
string — a prop, an entry in an array — has nowhere in source to hold a tag, so
the buttons are disabled there and say why; the words themselves stay editable.
Size, colour and alignment are not offered: they belong to the document's
design system.

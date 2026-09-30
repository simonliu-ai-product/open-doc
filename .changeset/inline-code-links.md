---
'@open-document/core': minor
---

Formatting already in a document can be edited on the page, and the toolbar
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

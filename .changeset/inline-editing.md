---
'@open-document/core': minor
---

Text is edited on the page, where it is printed.

The viewer has a Preview / Edit switch in place of the Inspect button. In edit
mode a click selects an element and a double-click (or Enter) opens its text
right on the sheet; Enter keeps the change, Escape reverts it. Changes stay on
the page, marked as unsaved, until Save (⌘S) — or leaving edit mode — writes
them all to source in one request and one hot reload. Discard puts back what
was there. Inline markup between runs of text stays as written, and an edit
that would reach across it is refused.

`PUT /__edit/texts` applies several run replacements at once. Every edit is
located against the source the reader saw, so a heading that grew does not
shift the paragraph below it; a stale edit is reported and the rest still land.

The design panel and the element panel share the right-hand dock; design wins
while it is open.

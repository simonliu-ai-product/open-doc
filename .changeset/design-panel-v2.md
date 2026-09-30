---
'@open-document/core': minor
---

The design panel works the way open-slide 2.0's does.

- **Undo and redo.** Every design change is a step in the document view's
  history — a slider drag is one step, not fifty — alongside each finished edit
  made on the page. ⌘Z and ⇧⌘Z outside a field, or the buttons on the card.
- **One save card.** Page edits and the design draft are counted, saved and
  discarded together from one card at the foot of the view; ⌘S saves both. The
  panel's own Save and Discard buttons are gone. The two are written one after
  the other, never at once, since both rewrite the same file.
- **One dock.** The design panel and the element panel share the right-hand
  dock and its chrome; design wins while open. `D` toggles it.
- **Fields.** A colour only reaches the draft as a complete `#rrggbb`, and a
  half-typed one reverts when you leave the field. Every slider has a number
  beside it that can be typed or stepped with the arrow keys. A font list shows
  "Custom" only when the source holds a stack no preset matches, and gains
  Inter. The header marks an unsaved draft, and a document that has no `design`
  yet.
- The panel opens once its draft is ready rather than on a spinner, and its
  content fades in instead of the dock resizing the pages frame by frame.

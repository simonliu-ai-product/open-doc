---
'@open-document/core': patch
---

Fixes on the printed page:

- A plain `<ul>` or `<ol>` in a document prints as a list again — bullets,
  numbers and indent. The viewer's CSS reset had stripped them on the sheet as
  well as in the chrome. The measuring pass gets the same styles, so pages break
  where the list actually ends, and a list the document styles itself keeps its
  own style.
- Inline SVG gradients, clip paths and diagram arrowheads show in PDF export.
  Each copy of a page had pointed its `url(#…)` references at the first element
  with that id, which is the thumbnail's, and printing hides the thumbnails.
- Diagrams: `A[(database)]` draws a cylinder instead of a box with brackets in
  its label. A link back to an earlier step goes round the side instead of
  through the steps in between. A document without a `design` no longer gets
  solid black shapes.

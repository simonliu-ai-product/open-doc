---
'@open-document/core': minor
---

Viewer: find in document, page jump, distinct zoom icons, and PNG/SVG export with a page range.

- The toolbar had two identical square icons — fit-page and fullscreen. Fit-page is
  now an up-down arrow, pairing with the left-right arrow that fits the width, and a
  per-cent button resets the zoom to 100%.
- The page counter is an input: type a number to jump there.
- A find control beside it searches the rendered document. Matches are painted with
  the CSS Custom Highlight API rather than wrapped in markup, so nothing React owns
  is edited; a browser without the API still navigates between hits.
- Download offers PNG and SVG alongside PDF and HTML, and asks which pages first —
  all, the current one, or a range like `1-3, 5`. One page downloads as one file;
  several arrive as a zip.

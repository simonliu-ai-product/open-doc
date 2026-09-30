---
'@open-document/core': minor
---

The page has a base stylesheet of its own. The viewer's CSS reset used to
reach the sheet too, so a heading, a link or a quote written without inline
styles printed as plain body text. Now bare elements start from the
document's design:

- Headings are bold, sized from `--od-size-h1`/`h2`/`h3`, and set in the
  heading font.
- Paragraphs, lists, quotes and tables get a bottom margin.
- Links take the accent colour and an underline.
- `code` and `pre` use the document's mono font instead of the viewer's.
- A quote has a rule on its leading edge.
- The sheet's default text is the design's body font, size and leading.

Inline styles and a document's own stylesheet still win. A document that
styled everything inline looks the same as before. One that relied on bare
elements now looks like a document, and may paginate differently.

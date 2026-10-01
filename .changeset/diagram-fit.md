---
'@open-document/core': patch
---

Diagrams now fit their box. A `<Diagram>` given a `width`, or placed in a column
narrower than its natural size, used to shrink only its container while the
drawing ran past it. It now scales down, keeping its aspect ratio. Box corners
also take `--od-radius` as intended; the radius had been set as an attribute,
which does not accept a CSS variable.

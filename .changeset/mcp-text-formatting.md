---
'@open-document/mcp': minor
---

`read_text` and `write_text` understand formatted text and component props.

- `read_text` returns `segments` for a run that carries bold, italic, code,
  links or line breaks; `write_text` takes `segments` to write it back with its
  formatting. Plain text over a formatted run is refused rather than stripping
  the formatting.
- Both take a `prop` path — `caption`, `columns.2.label` — for words a
  component prints from an attribute, as the rendered element's
  `data-od-prop` names it.

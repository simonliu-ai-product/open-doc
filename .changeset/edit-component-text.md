---
'@open-document/core': minor
---

Captions, table headings and footnotes can be selected and edited on the page.

`Figure`, `DataTable` and `Footnote` now point what they print back at their
call site in dev, so clicking a table, a figure or a note selects it. A caption
is written to the `caption` attribute, a table heading to its column's `label`,
and a footnote printed at the foot of the page to the text inside its
`<Footnote>`. Rows that come from an imported `.csv` are not editable here: the
table is selected and the panel names the file to edit, with a comment box for
the agent.

`read_text` and `write_text` take a `prop` path (`caption`, `columns.2.label`)
for words a component prints from an attribute.

Edit mode also survives the reload the dev server sends when a document is
added or removed.

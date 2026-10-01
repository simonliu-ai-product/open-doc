---
'@open-document/core': minor
'@open-document/mcp': minor
'@open-document/cli': patch
---

`open-doc diff <id> --since <rev>` shows what changed in a document since a
git revision (default `HEAD`), page by page. MCP exposes the same thing as the
`diff_document` tool.

- **Rendering.** It renders the current version and the version at the
  revision through the same print pipeline as `export`. The old version is
  checked out temporarily inside the workspace, so both versions use the same
  installed packages.
- **Page pairing.** Pages are paired by content, so a page inserted in the
  middle shows as one new page rather than as every later page having changed.
  Each page is reported as same, changed, added or removed, with the lines of
  text added and removed.
- **Report.** It writes `out/<id>-diff.html`, a self-contained report: before
  and after side by side, changed regions outlined, the text changes beneath.
  You can send it to a reviewer who has neither the repository nor open-doc.
- **Scaffolded projects** now ignore `out/` and `.open-doc-diff/`.

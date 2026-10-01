---
'@open-document/core': patch
'@open-document/cli': patch
---

A clearer Download menu:

- **Page choice.** All, This page and Range sit in one row of equal segments,
  so a label no longer wraps onto two lines.
- **Range.** Choosing Range puts the cursor in the range field. The menu reads
  back what it will download as you type (`Pages 1–3, 6 · 4 pages`), or says
  that the pages don't exist and how many the document has.
- **Formats.** They are grouped by what the file is for (Print & share, Edit,
  Images), with the extension each one produces.

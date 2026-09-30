---
'@open-document/core': minor
---

Shift+Enter breaks the line while editing on the page, written to source as
`<br />`. A `<br />` already in a paragraph no longer splits it into separate
runs: the paragraph is edited as one, and its breaks are kept. Enter still
keeps the change; text passed in as a string cannot hold a break, so
Shift+Enter does nothing there.

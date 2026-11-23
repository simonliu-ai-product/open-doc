---
"@open-document/core": minor
---

`flow()` takes its page padding side by side: `flow(blocks, { padding: { top: 96, right: 72, bottom: 96, left: 72 } })`. Pagination counts the top and bottom you set, so a page with deeper top and bottom margins than side ones holds as much text as it would in Word. A single number still pads all four sides alike.

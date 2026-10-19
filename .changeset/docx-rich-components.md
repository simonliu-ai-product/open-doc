---
'@open-document/core': patch
---

Word export keeps the newer components' layout:

- **Code blocks:** each line stays a line, highlighted lines keep their tint, and the title bar and frame come through.
- **Callouts and code-block tints:** their background colours come through. `color-mix()` and translucent colours are flattened onto white, since Word has no alpha.
- **Side by side:** callouts set next to each other stay in one row.
- **Columns:** a `flow()` section set in columns is a section of the same columns in Word, with breaks where the printed columns began.
- **Watermark:** `meta.watermark` is stamped behind the text on every page.
- **Sparklines:** they are drawn inline instead of left out.
- **Bibliography:** entries are not numbered a second time, and the `[n]` label hangs beside the text.

The offscreen pages are also positioned like real sheets, and the export waits for references to resolve before reading them.

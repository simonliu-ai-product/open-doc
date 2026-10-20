---
'@open-document/core': patch
---

The Word export now looks closer to the web page:

- **Monospace and system fonts:** Apple's system faces (SF Mono, SF Pro) are skipped, and the next family in the stack is used instead (Menlo for code). Pages and Word cannot pick SF Mono or SF Pro by name and fell back to Courier.
- **Table cells:** a cell's background colour now comes through. A data bar (`linear-gradient`) becomes a tint whose depth follows the value, since neither Word nor Pages can fill part of a cell.
- **Fixed-page foot:** a line laid out against a fixed page's foot (a cover's byline) becomes that page's own footer, so it stays at the bottom, and its top rule is kept.
- **Inline pills:** a pill or badge keeps its background.

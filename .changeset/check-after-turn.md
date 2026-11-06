---
'@open-document/core': patch
---

When the agent cannot run `open-doc check` itself — Codex, whose sandbox cannot start a browser — the dev server runs it once a turn that edited the document ends, and shows the result in the agent panel: a line when the document is clean, a card listing what it found otherwise, with "Ask the agent to fix" to hand those findings back.

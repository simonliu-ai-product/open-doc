---
'@open-document/core': patch
---

Keep Vite's dependency cache in the workspace (`node_modules/.vite/open-doc`) instead of inside the core package, so a sandboxed agent that may only write to the workspace can still run the dev server and `open-doc check`. Codex is told its sandbox cannot start a browser, so it no longer tries `open-doc check` or the page preview and reports a permission error.

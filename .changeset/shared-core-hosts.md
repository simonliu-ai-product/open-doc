---
"@open-document/core": minor
---

A workspace no longer needs its own install to be served: documents always import the running core and its react, so a host app can serve many workspaces from one shared core. `OPEN_DOC_CACHE_DIR` moves Vite's cache out of the workspace.

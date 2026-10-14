---
'@open-document/core': patch
'@open-document/mcp': patch
---

Add per-file async write queue (`withFileLock`) and SHA-256 optimistic concurrency control (`hashSource` / `expectedHash`) across document, text, comment, design, and folder operations to prevent concurrent write clobbering on local and GCS FUSE storage.

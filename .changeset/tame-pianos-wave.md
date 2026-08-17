---
"@open-document/cli": patch
---

Scaffold new workspaces against `@open-document/core` 0.2.0. The version range is stamped in at build time, so the previous release pinned new projects to `^0.1.0` — which under semver's 0.x rule excludes 0.2.0, leaving them without the `current-doc` cursor.

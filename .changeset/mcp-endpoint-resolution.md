---
"@open-document/core": patch
---

Resolve `@open-document/mcp` from the workspace running the dev server, so `--mcp` mounts under pnpm's strict node_modules layout instead of silently disabling itself.

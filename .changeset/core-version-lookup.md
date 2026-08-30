---
"@open-document/core": patch
---

Fix the core version reported by the dev API, the MCP server, and `cliContext` — it resolved `package.json` at a fixed depth, which the bundler's chunk placement made wrong, so it silently fell back to `0.0.0`.

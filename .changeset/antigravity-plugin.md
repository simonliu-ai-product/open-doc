---
"@open-document/mcp": minor
"@open-document/core": patch
---

Add an `open-doc-mcp` bin that serves the same tools over stdio, for clients that launch their own MCP servers — the Antigravity plugin in `plugins/open-doc` among them. It works on the workspace given by `--cwd`, else the client's roots, else the launch directory or one of its parents, and every tool refuses until it finds one. The `doc-authoring` skill moves its runtime feature list and its diagram guide into `references/runtime.md` and `references/diagrams.md`, so the skill body fits what Antigravity loads.

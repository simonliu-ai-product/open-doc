---
"@open-document/core": minor
"@open-document/mcp": minor
"@open-document/cli": patch
---

Add v2 document layout, charts, diagrams, rich primitives, layout diagnostics, and Google Cloud Run + GCS deployment (`open-doc deploy gcp`):

- **Layout & Pagination Engine**: Multi-column `flow(children, { columns, columnGap })` with full-width column-spanning headings (`data-od-column-span="all"`), and automatic row-level multi-page splitting for `<DataTable splittable />` with repeated `<thead>` and continuation captions.
- **Charts & Diagrams**: Mermaid `subgraph ... end` clusters and `sequenceDiagram` support (`participant`, message arrows, `Note`); `<Chart type="area" | "horizontal-bar" />`; inline `<Sparkline />`; and `<DataTable>` `summaryRow` (`'sum' | 'avg'` or per-column record), `dataBar`, `'currency'`, and `'delta'` formatters.
- **Rich Document Primitives**: `<Cite>` and `<Bibliography>` for automatic academic/report citation numbering, `<CodeBlock>` with zero-dependency syntax highlighting (`lineNumbers`, `highlightLines`, figure captioning), `<Callout>`, and `meta.watermark` across viewer and exports.
- **Layout Diagnostics**: Detect duplicate element IDs (`duplicate-id`) and skipped heading levels (`heading-skip`) in `open-doc check` and MCP `check_layout`.
- **Cloud Deployment (`open-doc deploy gcp`)**: Deploy and manage live open-doc workspaces on Google Cloud Run backed by Google Cloud Storage FUSE (`up`, `check`, `status`, `pull`, `push`, `stop`, `start`, `down`), with Bearer token authentication for remote MCP editing (`/mcp`) and instant WebSocket HMR.

---
"@open-document/core": minor
"@open-document/mcp": minor
---

Help for the chores nobody wants to do by hand. `open-doc check --max-pages N` (and `check_layout` with `maxPages`) fails a document that runs over a page limit and says how many pages must go and how many each top-level section takes. Translations are tracked: a document with `meta.translationOf` names its source, `meta.translatedAt` the source commit it matches, and `open-doc translations` (MCP `translation_status`, `mark_translated`) lists the ones that fell behind with the source's commits, changed files and diff. New skills walk an agent through each job: `fit-pages`, `refresh-report` (new period's data, with a list of every number that changed), `proofread`, `sync-translation` and `import-document` (Word, PDF or Markdown in).

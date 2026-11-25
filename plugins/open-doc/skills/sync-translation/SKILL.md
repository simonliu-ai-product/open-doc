---
name: sync-translation
description: Use this skill to create or update a translated copy of an open-doc document — "translate this report into English", "the Chinese version changed, update the English one", "sync the translations", "which translations are out of date", "/sync-translation". A translation is its own document with `meta.translationOf` naming the source and `meta.translatedAt` naming the source commit it matches; `open-doc translations` shows which ones fell behind and exactly what changed, so only those passages are retranslated. Do NOT use for writing a document in one language from scratch — that is `create-doc`.
---

# Keep translations in step with their source

## How a translation is linked

A translation is an ordinary document under `docs/`, usually `<source-id>-<lang>` (`annual-report-en`), whose meta says what it translates:

```tsx
export const meta = {
  title: 'Annual Report 2026',
  lang: 'en',
  translationOf: 'annual-report',   // the source document's id
  translatedAt: '3f9c2e1…',         // the source commit it matches — written by --mark
};
```

Changes are traced through git, so the workspace must be a git repository and the source committed.

## See where things stand

```bash
open-doc translations            # every translation and its state
open-doc translations <id> --diff # what changed in the source since <id> was synced
```

(MCP: `translation_status`, with `docId` and `diff: true`.) States: `current`, `stale` (lists the source's commits and changed files since), `unsynced` (never marked), `missing-source`, `unknown-revision`. The command exits non-zero when any translation is behind, so it can gate CI.

## A new translation

1. Commit the source if it has uncommitted changes (ask first if it is not your change).
2. Duplicate it (`duplicate_document`, or copy the folder) to `<id>-<lang>`; set `title`, `lang` (a BCP 47 tag — it changes line breaking and glyphs), `translationOf`, and `meta.labels` for the target language (`圖`/`表` ↔ `Figure`/`Table`).
3. Translate **text only**: headings, prose, captions, table headers, alt text. Keep structure, components, ids (`<Figure id>`, `<Ref to>`), styles, data files and numbers exactly as they are. Shared data files stay shared — import them from the source's folder rather than copying, so a data refresh reaches both.
4. Mark it: `open-doc translations --mark <id>-<lang>` (MCP: `mark_translated`).

## Catching up a stale translation

1. `open-doc translations <id> --diff`. Read the diff of the source's `index.tsx`: each hunk is a passage that changed.
2. Find the matching passage in the translation — same component, same position, same ids — and retranslate **only that passage**. Leave the rest of the translation alone: it may have been reviewed and polished by a person.
3. Structural changes (a section added, a figure moved, a table column added) are made the same way in the translation. Data file changes need nothing unless the translation copied the file.
4. Check the layout of the translation — languages differ in length, and English text is often 20–40% longer than Chinese, so pages can overflow or run over a page limit:

   ```bash
   open-doc check <id>
   ```

   If the translation must match the source's page count, use the `fit-pages` skill.
5. Mark it current: `open-doc translations --mark <id>`. It records the source's last commit; it refuses while the source has uncommitted changes.

## Hand off

Per translation: which source changes you carried over (one line each), anything you could not translate confidently (names, terms with no settled translation — list them for a person), and that `open-doc check` is clean. Term choices should follow what the translation already uses; when the document has a glossary, use it.

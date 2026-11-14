---
name: current-doc
description: Resolve which document, page, and (optionally) selected element the user is currently viewing in the open-doc dev server. Consult this whenever the user references "this page", "this document", "this element", "the page I'm on", "the report I'm looking at", or any deictic reference to document content without naming it. Re-read `node_modules/.open-doc/current.json` at the start of every such turn — the user navigates between turns, so a value you read earlier in the conversation is almost certainly stale.
---

# Where is the user right now?

When the user says "fix this page", "tighten this heading", or "the report I'm looking at", they almost never name the document id, page number, or element — they mean wherever they are in the dev viewer. Before asking "which document?" or "which element?", check the file the dev server writes on every navigation and inspector pick.

## Re-read on every deictic turn — never reuse a prior read

`current.json` is a live cursor, not a fact about the conversation. The user moves between documents, pages, and elements freely between your turns — including while you were doing other work. **Read the file fresh at the start of every new turn that uses a deictic reference**, even if:

- you already read it earlier in this same conversation,
- you just finished editing the document it pointed to,
- the user's new message sounds like a continuation ("now make it bigger", "also fix this one", "keep going").

A "continue editing" follow-up is exactly the case where the user has likely just scrolled to a different page or picked a different element. Trusting your last read here will silently edit the wrong sheet. Re-read, compare `docId` / `pageIndex` / `selection` against what you used last time, and act on the new values.

## How to read it

```
node_modules/.open-doc/current.json
```

Path is relative to the project root (the user's `cwd`, the directory that contains `docs/` and `package.json`). Use the `Read` tool. The file is JSON.

## What you get

```json
{
  "docId": "q3-review",
  "pageIndex": 2,
  "pageNumber": 3,
  "totalPages": 8,
  "docTitle": "Q3 Review",
  "pagePath": "docs/q3-review/index.tsx",
  "selection": {
    "line": 42,
    "column": 6,
    "tagName": "h2",
    "text": "Availability"
  },
  "updatedAt": "2026-08-17T14:32:11.123Z"
}
```

- `docId` — folder name under `docs/`. Use as-is for any `/__docs/<id>/...` API or as the URL segment (`/d/<docId>`).
- `pageIndex` — 0-based **rendered** page index.
- `pageNumber` — 1-based, for talking to the user ("page 3 of 8").
- `totalPages` — how many sheets the document currently renders to.
- `pagePath` — relative path to the document source. Hand straight to `Read` / `Edit`.
- `selection` — `null` if nothing is selected. Otherwise, the JSX element the user picked in the inspector overlay:
  - `line` (1-indexed) and `column` (0-indexed) point to the JSX opening tag inside `pagePath`. This is the canonical handle — match against the source line, not the rendered DOM.
  - `tagName` is the rendered DOM tag, lowercased (`"h1"`, `"p"`, `"td"`).
  - `text` is a trimmed snippet (≤120 chars) of the element's `textContent`, useful to confirm you are looking at the right node.
  - Selection auto-clears whenever the user moves to a different document or page.
- `updatedAt` — ISO timestamp of the last navigation or selection change. Use it to detect staleness.

## Rendered pages are not entries in the default export

This is the one thing that differs from a slide deck, and getting it wrong means editing the wrong thing.

`export default [Cover, Contents, flow(<>…</>)]` has three *entries*, but may render to twelve *sheets* — the framework measures a `flow()` section and packs it across as many pages as it needs. So:

- **`pageIndex` indexes rendered sheets, not the array.** Do not use it to subscript the default export.
- To find what to edit, prefer `selection` (it points at real source coordinates), then the page's visible text, then the surrounding heading.
- If the user is on a flow page and there is no selection, identify the content by what they can see — read the source and match the prose — rather than counting array entries.
- A fixed `DocPage` component *is* one sheet, so for documents made only of fixed pages the index does line up. Confirm with `pagePath` before relying on that.

## When to use this

- The user references the current document/page deictically: "this", "here", "the page I'm on", "what I'm looking at".
- The user references a specific element: "this heading", "this table", "tighten this", "make this smaller". If `selection` is non-null, that's the element they mean.
- Before asking "which document?" or "which page?" as a clarifying question — check this file first.
- Before guessing from `git log`, recently-edited files, or the newest folder under `docs/`.

## When NOT to use this

- The user names a document explicitly ("edit `q3-review`") — use that name directly.
- The `apply-comments` workflow already finds its own targets via `@doc-comment` markers; it does not need this skill.
- For listing or discovering documents — read `docs/` directly.

## Staleness — verify before acting

`updatedAt` is the last time the user navigated. Treat it like a cache:

- **Fresh (under ~5 minutes old)**: trust it. Open `pagePath`, do the work.
- **Older than ~5 minutes**: confirm with the user before editing. The dev server may not be running; the user may have switched contexts.
- **Hours/days old**: ignore it. Ask which document they mean.

A *newer* `updatedAt` than the one you saw last turn is the normal signal that the user has moved — switch to the new `docId` / `pageIndex` / `selection` without asking.

## When the file is missing

- The dev server has not been opened on a document yet, or has never run. A static build never writes it.
- Don't create the file or guess. Ask which document they mean, or suggest they open it in the dev server first.

## Example — page-level reference

User: "tighten the spacing on this page"

1. Read `node_modules/.open-doc/current.json`.
2. Check `updatedAt` is recent.
3. Read `pagePath` (e.g. `docs/q3-review/index.tsx`).
4. Work out what is on `pageNumber` — by the selection, or by matching visible content, remembering that a flow section spans many sheets.
5. Consult the `doc-authoring` skill for the spacing and vertical-budget rules, then edit in place.

If `current.json` is missing or stale, ask: "Which document and page should I tighten? The dev server hasn't published a current page recently."

## Example — element-level reference

User: "make this bigger"

1. Read `node_modules/.open-doc/current.json`.
2. If `selection` is non-null, that is the element. Read `pagePath`, jump to `selection.line`, and find the JSX opening tag near that line/column. Confirm against `selection.text` and `tagName`.
3. Consult `doc-authoring` for the print type scale before editing — a size that looks fine on screen can print below the legibility floor.
4. Edit the JSX node in place.

If `selection` is null, fall back to the page-level flow above — and consider asking "which element?", since the user used a deictic but hasn't picked one in the inspector.

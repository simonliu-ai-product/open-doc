---
name: apply-comments
description: Use this skill when the user asks to apply, process, or clear the comments they left in the open-doc inspector — phrases like "apply the comments", "apply my edits", "I left notes on the document", "process the markers", "/apply-comments". It finds every `@doc-comment` marker under `docs/`, makes the edit each one asks for, then removes the marker. Do NOT use for authoring new documents — that is `create-doc`.
---

# Apply inspector comments

In the viewer the user leaves notes from the **Comments** panel (`M`) or the element panel in edit mode, and the panel's **Copy request for the agent** button hands you `/apply-comments docs/<id>` — when a path is given, work on that document only. Each note is written into the document source as a marker:

```tsx
<p style={p}>
  {/* @doc-comment id="c-4591fd61" ts="2026-08-15T15:40:52.644Z" text="<base64url>" */}
  從 FastMCP 開發、容器化…
</p>
```

The marker is always the **first child of the element the note is about** — that is your anchor. `text` is base64url-encoded JSON: `{"note": "...", "hint": "p"}`.

## Step 1 — Find the pending comments

If the request named a document (`docs/<id>`), look only there.

```bash
grep -rn "@doc-comment" docs/
```

If the dev server is running you can read them decoded instead, which is easier:

```bash
curl -s "http://localhost:5273/__comments?docId=<id>"
```

That returns `{ comments: [{ id, line, ts, note, hint }] }`. If neither turns anything up, tell the user there are no pending comments and stop.

## Step 2 — Read each one in context

For every marker, read the surrounding element — not just the marked line. A note like *"make this shorter"* is meaningless without the paragraph it sits in. Open the file with `Read` around the marker's line (±40 lines is usually enough) so you can see the element, its styles, and its neighbours.

Group comments by document, and handle them **oldest `ts` first** — later notes may refine earlier ones.

## Step 3 — Make the edit

Apply what the note asks for, following the **`doc-authoring`** skill: it owns the type scale, the flow/vertical-budget rules, and the design tokens. In particular:

- Edit the element the marker is anchored to. Never reformat the whole file.
- A note about wording changes the text; a note about weight, color, or size changes the inline style — prefer `var(--od-*)` tokens over new hard-coded values.
- If the change makes a fixed page overflow, split the page or move the content into the `flow()` section (`references/pagination.md`).
- If a note is ambiguous ("fix this"), do the smallest reasonable interpretation and say what you assumed at hand-off. Don't guess at a large rewrite.
- If a note asks for something the framework can't do (per-page orientation, a splitting table), say so in the hand-off and leave the marker in place.

## Step 4 — Remove the marker

Delete the marker line for every comment you actually applied. Leave markers you deliberately skipped, and say which ones and why.

```bash
# with the dev server running
curl -s -X DELETE "http://localhost:5273/__comments?docId=<id>&id=<comment-id>"
```

Or delete the `{/* @doc-comment … */}` line directly with `Edit`. Removing it by hand is fine — the marker is a plain JSX comment.

## Step 5 — Verify

- No `@doc-comment` marker remains for an applied note: `grep -rn "@doc-comment" docs/`.
- The document still compiles: it hot-reloads in the browser; check the terminal for a Vite error.
- Run the "Self-review before finishing" checklist in `doc-authoring` for any page you touched.

## Step 6 — Hand off

Tell the user, in one short list:

- What you changed, one line per comment.
- Anything you skipped and why.
- Any assumption you made on an ambiguous note.

Do not restate the whole document.

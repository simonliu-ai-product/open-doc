---
'@open-document/core': minor
'@open-document/cli': patch
---

**An agent panel in the document view, the same one open-slide has.** Press A
(or the Agent button) to drive Codex from beside the pages; it reuses the
`codex` CLI you already signed in to and installs its SDK into the workspace
on first use.

- **Draft with agent:** a new button on the home page opens a blank document
  and asks for a brief; the agent drafts it section by section while the view
  follows each new page, then names the folder after it.
- **Asks:** the agent can end a turn with questions, shown as a form; your
  answers start the next turn. It works inside Codex's workspace sandbox.
- **Model and reasoning:** pick the model and effort in the panel header.
- **Presence:** a ring and a status pill on the pages while it works.
- **History:** every conversation is kept, grouped by this document and the
  others; messages can be copied, and a sent one edited to rewind from there.
- **Comments:** the Comments panel gains "Apply with Codex".
- **Turning it off:** set `agent: { enabled: false }` in the config.

**`/d/<id>/preview?p=N`** draws one sheet alone at true size, with no viewer
around it, for an agent to screenshot. It waits for
`[data-od-preview-ready="true"]`, and the skills say how to use it.

**A page whose code throws no longer blanks the viewer.** The error is shown on
that sheet only, and the page is drawn again as soon as the source is saved —
before, a save between using a component and importing it (an agent edits in
steps) unmounted the whole app. `open-doc check` reports it as `render-error`.

The getting-started guides describe the panel.

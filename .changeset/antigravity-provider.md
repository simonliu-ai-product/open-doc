---
"@open-document/core": minor
---

Add Antigravity (preview) to the agent panel: Google's managed agent `antigravity-preview-09-2026`, run through the Gemini API with your own `GEMINI_API_KEY` (from the environment, `.env.local` or `.env`) — never your Antigravity or Google sign-in. With a key present, a new chat offers an "Enable" card; accepting the preview terms there sets up local mode on its own: open-doc downloads Google's `gemini-api` CLI (checksum-pinned) into `node_modules/.open-doc` and runs it with shell commands disabled and file tools confined to the project, so the agent edits your document in place and every change appears as it lands. Where local mode is not available yet (Windows), each turn runs in a Google cloud sandbox instead and its edits are copied back when it ends, never over a file you changed meanwhile. Models include Gemini 4 Hydrogen (the default), Carbon and Argon, with an estimated cost after each turn.

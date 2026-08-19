---
name: create-doc
description: Use this skill when the user wants to create, draft, author, or generate a new document, report, whitepaper, proposal, memo, or spec in this open-doc repo. Triggers on phrases like "write a report about X", "draft a proposal", "make a whitepaper", "create a document", "write up the Q3 results", or when the user asks to add content under `docs/`. Do NOT use for editing the framework itself — only for authoring content inside `docs/<id>/`.
---

# Create a document in open-doc

This skill owns the **workflow** for drafting a new document. The technical reference — file contract, page canvas, print type scale, vertical budget, tables, TOC — lives in the **`doc-authoring`** skill. Read it before writing code; don't duplicate its rules here.

You only write files under `docs/<id>/`. Never modify `package.json`, `open-doc.config.ts`, or existing documents.

**If the user already has the content written as Markdown, don't retype it into JSX.** `open-doc import <file.md> --id <id>` produces a real document — `flow()` body, cover, contents, local images copied into the document's assets — which you then refine. Steps 0–2 still apply for the parts the import cannot know (theme, page size, visual direction).

## Step 0 — Pick a theme

List files under `themes/`. If any theme markdown exists (anything other than `README.md`), call `AskUserQuestion` with each theme id as an option plus a final **"no theme — design from scratch"** option. (`AskUserQuestion` holds at most 4 options — with 4+ themes, offer the 3 most relevant plus "no theme"; the auto-added "Other" lets the user name an omitted one.)

- If the user picks a theme: read `themes/<id>.md` end-to-end. Its palette, typography, page setup, and paste-ready components are now authoritative — copy them into the document, and set `meta.theme: '<id>'` in `index.tsx`. Skip the **visual direction** question in Step 2 (the theme already commits to one) and restate the theme name so the user can correct course. Page size comes from the theme's frontmatter unless the user overrides it.
- If the user picks "no theme", or `themes/` has no theme files: continue unchanged.

## Step 1 — Gather the substance first

A document is judged on content, not layout. Before anything else, establish:

- **Topic and purpose** — what decision or action should this document produce?
- **Audience** — executives (lead with the recommendation), engineers (lead with the mechanism), clients (lead with the outcome and the price).
- **Source material** — does the user have data, a draft, notes, a repo, an existing doc? Ask for it. **Never fabricate figures, quotes, citations, or customer names.**

If the request is thin ("write me a report"), make a **separate** `AskUserQuestion` call for topic, audience, and source material before the style questions below. If the topic is already clear, restate your reading of it in the next call so the user can correct course.

## Step 2 — Clarify the shape (MUST ask before writing code)

Ask these in a single `AskUserQuestion` call (multi-question form). Skip a question only when the user's message already answers it unambiguously — and restate the assumption if you skip.

1. **Document type** — propose 3 concrete types that fit *this* topic, each with what it implies structurally. Not bare labels:
   - *"our Q3 infrastructure numbers"* → **internal review** (summary, metrics, incidents, actions) · **exec brief** (2 pages, recommendation-first) · **post-incident deep dive** (timeline, root cause, remediation)
   - *"our new product for enterprise buyers"* → **whitepaper** (problem, approach, evidence, references) · **sales proposal** (scope, deliverables, timeline, price) · **one-pager** (positioning + proof + CTA)
   Mark the best fit "(Recommended)".
2. **Length** — offer brackets: 2–4 pages (brief), 5–10 (standard report), 11–25 (deep dive). The auto-added "Other" covers custom counts.
3. **Page size** — A4 (default, metric/international) · Letter (US) · A4 landscape (data-heavy, wide tables). Skip if the user already said.
4. **Visual direction** — 3 options tailored to the audience, each naming a palette + typographic cue: e.g. **corporate neutral** (near-white, single blue accent, sans throughout) · **editorial serif** (serif headings, generous leading, hairline rules) · **technical mono-accent** (mono labels, dense tables, monochrome + one signal color).

Ask about brand colors, a logo, or required sections only if still unclear afterwards.

## Step 3 — Pick a doc id

**kebab-case**, short, descriptive: `q3-infra-review`, `acme-proposal-2026`, `auth-migration-rfc`. Check `docs/` for collisions.

## Step 4 — Outline before code

Write the page plan first — one line per page, with its role. Typical structures:

| Type | Page plan |
| --- | --- |
| Report | Cover · Contents · Executive summary · Method · Findings (n pages) · Risks · Recommendations · Appendix |
| Whitepaper | Cover · Abstract · Problem · Approach · Evidence · Comparison · Conclusion · References |
| Proposal | Cover · Summary · Scope · Deliverables · Timeline · Pricing · Terms · Next steps |
| RFC / spec | Summary · Motivation · Design · Alternatives · Migration · Open questions |
| Memo | Header block · Context · Recommendation · Rationale · Next steps |

Rules for the plan:

- **Page 1 is the cover**; if the doc is over ~6 pages, **page 2 is `<TableOfContents />`**. Both are fixed pages; everything after them belongs in one `flow()` section so the framework paginates the body.
- The executive summary must stand alone — a reader who reads only that page should know the conclusion and the ask.
- One section per page unless a section is genuinely two paragraphs long.
- Plan the body as a **sequence of sections**, not as a page count — `flow()` decides how many pages that becomes. Only estimate the vertical budget for the fixed pages (cover, contents, dividers); see `doc-authoring` → `references/pagination.md`.

Show the user the page plan and the estimated page count before writing the file if the document is over ~8 pages — restructuring a 20-page doc after the fact is expensive.

## Step 5 — Commit to a visual direction

Declare a top-level `export const design: DesignSystem` and consume `var(--od-*)` everywhere. Print constraints (white background, ≥13px body, one accent) are in `references/design-system.md` — read it before choosing the palette. If a theme was picked in Step 0, copy its `design` const verbatim instead of inventing one.

Keep the const a plain object literal: the dev UI's **Design panel** parses and rewrites it, and a spread or a value read from another constant makes the document untweakable (see "Writing for the Design panel" in `doc-authoring`).

Define the shared page shell, heading styles, and the running footer **once** as local constants/components at the top of `index.tsx`, then reuse them on every page. Copy-pasted page styling is how documents drift.

## Step 6 — Write `docs/<id>/index.tsx`

Read **`doc-authoring`** first — file contract, canvas, type scale, headings/outline, TOC, page numbers, and a starter template are all there.

While writing:

- Real `<h1>/<h2>/<h3>` for every section title, so the outline and TOC populate.
- `<TableOfContents />` for the contents page. Never hand-write one.
- `useDocPageNumber()` / `useDocPageCount()` for the footer. Never hardcode.
- Put body content in one `flow(<>…</>, { footer: Footer })` section; mark captions `data-od-keep-with-previous`. Only run budget math for fixed pages.
- Where the user must supply data, leave `<ImagePlaceholder hint="…">` or an explicit `TODO:` in the copy — never invent numbers.

## Step 7 — Self-review

**Run `open-doc check <id>` first.** You cannot see the sheets you produced; it renders them at true page size and reports clipped content, blank pages, stranded headings, and unreadable type, each with a source location. Fix every error before moving on. (Driving the MCP server instead? `check_layout`, and `render_page` when you need to look at a sheet.)

Then run the checklist in `doc-authoring` ("Self-review before finishing"), and re-read the prose once as a reader: does the summary state the conclusion? Does every claim have a source?

## Step 8 — Hand off

Tell the user:

- The doc id and file path.
- That the dev server hot-reloads — open `http://localhost:5273/d/<id>` (or refresh the home page).
- **Every placeholder and `TODO:` you left**, and what data each one needs.
- That "Export PDF" in the toolbar prints at the true page size, and "HTML" downloads a self-contained copy — or `open-doc export <id>` for the same files without a browser.
- That the **Design** button live-tweaks the palette and type scale and writes the result back to the source, and that images they want to drop in go through the **Assets** page.

Don't run the dev server yourself unless asked.

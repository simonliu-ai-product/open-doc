---
name: create-theme
description: Use this skill when the user wants to create, draft, author, or extract a document theme in this open-doc repo — a reusable house style for reports, proposals, or memos. Triggers on phrases like "create a theme", "make a company template", "extract a theme from <doc>", "match our brand guidelines". Produces two paired files under `themes/` — `<id>.md` (palette, typography, page setup, paste-ready Title/Footer/Table components) and `<id>.demo.tsx` (a runnable two-page demo the Themes gallery previews). Do NOT use for editing real documents — only for authoring the theme bundle.
---

# Create a document theme

A **theme bundle** under `themes/` is two paired files describing a reusable house style:

1. `themes/<id>.md` — agent-facing documentation: palette, typography, page setup, paste-ready components. This is what `create-doc` reads when the author picks the theme.
2. `themes/<id>.demo.tsx` — a runnable two-page mini-document (a normal document module: `export default DocPage[]`) that shows the theme in use. The Themes gallery renders it as the live preview.

Both files share the same stem so the runtime pairs them automatically.

A theme is **distinct from a document's `design` const**:

| | What it is | Who reads it |
| --- | --- | --- |
| `themes/<id>.md` | Authoring-time direction, copied into a real document | `create-doc`, you |
| `themes/<id>.demo.tsx` | A preview, not a real document (never appears in the documents list) | The Themes gallery |
| `export const design` in `docs/<id>/index.tsx` | Runtime tokens the Design panel can live-tweak and write back | The runtime |

You only write `themes/<id>.md` and `themes/<id>.demo.tsx`. Never modify real documents or config. Read the **`doc-authoring`** skill first — the page canvas, print type scale, and vertical budget it defines are what your overrides are stated against.

## Step 1 — Identify the input source

A theme can come from any combination of:

- **Brand material** — a style guide PDF, brand colors, a letterhead, existing reports (paths or URLs).
- **Free-text description** — prose describing palette, fonts, and feel.
- **An existing document** — `docs/<id>/index.tsx` whose look should be lifted into a reusable theme.

If the user's message already names the inputs, proceed. Otherwise call `AskUserQuestion` (multi-select) and ask follow-ups (paths, doc id, prose) only as needed.

## Step 2 — Gather raw inputs

- **Images / PDFs**: read each path with `Read` (it accepts images and PDFs). Note hex colors, heading/body faces and weights, margin rhythm, rule weights, table styling, and any recurring chrome (letterhead, footer rule, page-number position).
- **Text**: extract explicit tokens (hex codes, font names, "20mm margins") and implicit tone ("conservative", "editorial", "technical"). Resolve vague language into concrete numbers before writing.
- **Existing document**: read `docs/<id>/index.tsx` and pull the `design` const, the shared `page`/`h1`/`h2` style objects, the running `Footer`, table cell components, and the callout style.

When inputs disagree (brand deck says navy, the sample report is black), ask which wins.

## Step 3 — Pick a theme id

**kebab-case**, short, descriptive: `acme-corporate`, `editorial-serif`, `technical-brief`, `board-memo`. Check `themes/` for collisions.

## Step 4 — Write `themes/<id>.md`

Keep this exact section order; adapt the bodies.

````markdown
---
name: <Human title, e.g. "Acme Corporate">
description: <one-line elevator pitch>
pageSize: <A4 | B4 | A3>
mode: <light | dark — light for anything that prints>
---

# <Theme name>

## When to use

<Two sentences: which document types this fits, and which it doesn't.>

## Palette

| Role   | Value     | Notes                                   |
| ------ | --------- | --------------------------------------- |
| bg     | `#ffffff` | sheet background — keep near-white       |
| text   | `#16181d` | body copy                                |
| muted  | `#6b7280` | captions, footers, secondary cells       |
| accent | `#1d4ed8` | section numbers, rules, chart series     |
| rule   | `#e5e7eb` | table borders, hairlines, dot leaders    |

Extra colors outside the `DesignSystem` shape (status green/amber/red, chart series) go in a
"Supporting colors" list below the table.

## Typography

- Heading font: `<stack>` — weight <n>.
- Body font: `<stack>` — weight 400.
- Mono font: `<stack>` — tables of code/IDs only.
- Webfont import (omit for system stacks): `<stylesheet URL>` — load per `references/design-system.md` in `doc-authoring`.
- Type scale (px at 96dpi): title <n> · h1 <n> · h2 <n> · h3 <n> · body <n> · caption <n>.

## Page setup

- Page size: A4 portrait (794 × 1123 px).
- Margin: <n> px on all sides (<n> mm).
- Leading: <n>.
- Running footer: <what it shows, where it sits>.
- Cover: <centered / bottom-aligned, what it carries>.

## Design const

Paste-ready — this is what a document using the theme declares:

```tsx
export const design: DesignSystem = {
  palette: { bg: '…', text: '…', muted: '…', accent: '…', rule: '…' },
  fonts: { heading: '…', body: '…', mono: '…' },
  typeScale: { title: 44, h1: 28, h2: 20, h3: 16, body: 14, caption: 10 },
  margin: 76,
  leading: 1.55,
  radius: 6,
};
```

## Fixed components

Paste-ready. Copy verbatim into a document using this theme.

### Page shell + headings

```tsx
const page = { /* … */ } as const;
const h1 = { /* … */ } as const;
const h2 = { /* … */ } as const;
```

### Running footer

Read the page number from `useDocPageNumber()` / `useDocPageCount()` — never hardcode it.

```tsx
const Footer = () => { /* … */ };
```

### Table

```tsx
const Th = ({ children }: { children: React.ReactNode }) => /* … */;
const Td = ({ children }: { children: React.ReactNode }) => /* … */;
```

Include a callout and a stat component when the theme calls for them.

## Rules

- <3–6 bullets a document must follow to stay on-theme: what never appears, how sections are numbered, whether the cover carries a logo, table style, figure captions.>
````

## Step 5 — Write `themes/<id>.demo.tsx`

A normal document module — **two pages**: a cover and one content page that exercises the theme's headings, body copy, a table, and the running footer.

```tsx
import { type DesignSystem, type DocPage, useDocPageCount, useDocPageNumber } from '@open-document/core';

export const design: DesignSystem = { /* the same const as in the .md */ };

const Cover: DocPage = () => ( /* … */ );
const Content: DocPage = () => ( /* … */ );

export default [Cover, Content] satisfies DocPage[];
```

Rules for the demo:

- **No `meta` export** — the demo is not a real document and must not carry `createdAt` or a title that implies it is.
- Two pages, no more. The gallery renders the first; the theme detail page renders both.
- Use placeholder copy that shows the type scale honestly (a real heading, a real paragraph, a real 4-row table) — not lorem ipsum blocks that hide how the theme handles wrapping.
- Respect the vertical budget from `doc-authoring` → `references/pagination.md`. A demo that overflows teaches the wrong lesson.
- Keep it self-contained: no asset imports, no webfont the `.md` didn't declare.

## Step 6 — Self-review

- [ ] Both files exist and share the same stem.
- [ ] Frontmatter has `name`, `description`, `pageSize`, `mode`.
- [ ] The `design` const in the `.md` and in the demo are identical.
- [ ] The palette background is white or near-white (see `references/design-system.md` — dark documents print badly).
- [ ] Body type ≥ 13px; caption ≥ 9px.
- [ ] The footer pulls page numbers from the hooks.
- [ ] Every "paste-ready" component actually compiles as written — no `…` left in the code blocks.
- [ ] The demo fits its pages.
- [ ] Nothing outside `themes/` was written.

## Step 7 — Hand off

Tell the user:

- The theme id and both file paths.
- That it shows up under **Themes** in the dev UI (`http://localhost:5273/themes/<id>`).
- That new documents can adopt it by setting `meta.theme: '<id>'`, which adds the back-link chip — and that `create-doc` will now offer it as a choice.

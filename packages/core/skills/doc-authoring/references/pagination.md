# Pagination — flow sections and the vertical budget

A document's default export is a list of **entries**. There are two kinds, and they mix freely:

| Entry | What it is | Who decides the page break |
| --- | --- | --- |
| `DocPage` (a component) | Exactly one sheet | You |
| `flow(<>…</>)` | Continuous content | The framework, by measuring |

**Default to `flow()` for body content.** Use fixed pages for the cover, a contents page, a section divider — anything whose layout is the point. Hand-splitting prose into fixed pages is how you end up with eleven pages that are each 60% full.

## Flow sections

```tsx
import { flow, type DocEntry } from '@open-document/core';

const Body = flow(
  <>
    <h1 style={h1}>1. 概觀</h1>
    <p style={p}>…</p>
    <Table>…</Table>
    <p style={caption} data-od-keep-with-previous>表 1 — …</p>
    <h2 style={h2}>1.1 細節</h2>
    <p style={p}>…</p>
  </>,
  { footer: Footer },
);

export default [Cover, Contents, Body] satisfies DocEntry[];
```

- **Each direct child of the fragment is one block.** Blocks are atomic: a block never splits across a page, so a table either fits whole or moves to the next page.
- The framework owns the page shell for flow pages — margin, background, and base typography come from the `design` const. Your blocks keep their own styles. `flow(node, { padding })` overrides the margin for that section.
- `footer` is a component rendered on **every** page the section expands into. `useDocPageNumber()` works inside it, so a running footer needs no extra wiring.
- Blocks are measured in the real DOM at the real page width after fonts settle, then packed greedily. Change a paragraph and the pagination re-runs on hot reload.

### Keep rules

| Rule | How | Default |
| --- | --- | --- |
| Heading never last on a page | `data-od-keep-with-next` | **on** for `h1`–`h4` |
| Caption stays with its figure | `data-od-keep-with-previous` on the caption | off |
| Force a new page here | `data-od-break-before` | off |

Set `data-od-keep-with-next="false"` on a heading if you deliberately want it to end a page.

### What flow does not do

- **It never splits a block.** A 40-row table taller than one page stays whole and overflows — split it yourself into two tables with a repeated header.
- **It does not balance pages.** Content fills top-down; the last page can be short.
- **It does not reorder anything.** Blocks keep the order you wrote them in.

## Fixed pages and the vertical budget

Everything below applies to `DocPage` components — the pages you lay out yourself.

```
usable_height = page_height − 2 × margin
```

| Page | Margin | Usable height |
| --- | --- | --- |
| A4 portrait (1123px) | 76 | **971px** |
| A4 portrait | 96 | 931px |
| A4 landscape (794px) | 76 | 642px |
| B4 portrait (1376px) | 76 | 1224px |
| A3 portrait (1587px) | 76 | 1435px |

A running footer sits inside the margin band, so it costs nothing from the budget — but leave **24px of clearance** above it, i.e. treat the budget as ~947px on A4 when a footer is present.

### Estimating how many lines a paragraph takes

```
chars_per_line ≈ text_block_width / (font_size × 0.5)
lines          = ceil(characters / chars_per_line)
height         = lines × font_size × line_height
```

The `0.5` is the average glyph-width ratio for a humanist sans at body sizes. Use `0.52` for serif faces, `0.6` for monospace, and **`1.0` for CJK** (one character per em).

On A4 with 76px margins (text block 642px) at 14px body:

- Latin: `642 / (14 × 0.5)` ≈ **92 characters per line**
- CJK: `642 / 14` ≈ **45 characters per line**

A 400-character English paragraph → `ceil(400/92)` = 5 lines → `5 × 14 × 1.55` = **109px**.

### Worked example — A4 content page, 76px margins, footer present (budget 947px)

| Element | Height |
| --- | --- |
| H1 28px × 1.2 | 34px |
| Gap | 20px |
| Intro paragraph, 380 chars → 5 lines × 14 × 1.55 | 109px |
| Gap | 14px |
| H2 20px × 1.25 | 25px |
| Gap | 12px |
| Body paragraph, 620 chars → 7 lines | 152px |
| Gap | 14px |
| Table: header 28px + 6 rows × 26px | 184px |
| Gap | 14px |
| Caption 10px × 1.4 | 14px |
| Gap | 24px |
| Body paragraph, 520 chars → 6 lines | 130px |
| **Total** | **746px ✅ fits in 947** |

### Where to split a fixed page

1. **At a section boundary.** A new H1 starts a new page.
2. **Before a subsection heading.** Never leave an H2 as the last element on a page.
3. **Between a table/figure and its surrounding prose.** Keep a caption with its table.
4. **Mid-prose, at a paragraph boundary.** Never split a paragraph across two page components.

Rules: give every page the same top edge; if a page is more than ~85% full, move its last block; if you find yourself shrinking type or margins to fit, add a page instead. **Or convert the section to `flow()` and stop doing this arithmetic.**

## Landscape pages

`meta.orientation` applies to the **whole document** — there is no per-page orientation. If one wide table needs landscape, either rotate it inside a portrait page (`transform: rotate(-90deg)` on a sized wrapper) or make the whole document landscape. Mixing is not supported.

---
name: fit-pages
description: Use this skill when a document must fit a page limit — "keep the proposal to 10 pages", "this has to be two pages", "cut it down to fit", "it runs one page over", "/fit-pages". It measures where the length is with `open-doc check --max-pages`, cuts by priority (slack and repetition first, substance last), re-checks after every pass, and reports exactly what was removed. Do NOT use for making a document longer, or for layout faults unrelated to length — that is `doc-authoring`.
---

# Fit a document to a page limit

People hate this job because every cut moves a page break somewhere else. You can see the whole document and re-measure in seconds, so do it in small, measured passes.

## Step 1 — Measure

```bash
open-doc check <id> --max-pages <N>
```

(MCP: `check_layout` with `maxPages`.) Over the limit, the report has a `page-budget` error and a **Where the pages go** list: every top-level section with the pages it fills (fractions count — `0.46` is under half a sheet), plus `toCut`, roughly how many pages of body must go once the last sheet's slack is counted, and `lastPageFill`. With `--json`, read `budget.sections` and `budget.toCut`.

Under the limit already? Say so and stop. Never pad a document to reach a limit.

## Step 2 — Agree what may not change

Before cutting, settle with the user (or from the brief) what is fixed: required sections of a call for proposals, legal wording, numbers, quotes, figures someone asked for. If you were not told, assume **facts, numbers, names, dates and headings required by the brief are fixed**; prose is not.

## Step 3 — Cut in this order, cheapest first

Stop as soon as the check passes.

1. **Layout slack** (no words lost): a nearly empty last sheet (`lastPageFill` under ~0.25) often goes by tightening a figure's height, dropping a stray `pageBreak`, or letting a short fixed page join the `flow()` section. Keep type at or above the `doc-authoring` minimums and margins as designed — shrinking the type scale to win a page is not a fix unless the user asks for it.
2. **Repetition**: a summary that restates the introduction, a conclusion that repeats every section, the same point in a table and in prose — keep one.
3. **Wordiness**: shorten long sentences, merge paragraphs that make one point, turn a run of parallel sentences into a list or a table (often shorter).
4. **Low-value detail** in the longest sections first (the budget list tells you which): background the reader already knows, second and third examples, hedges.
5. **Move, don't delete**: detail a reviewer may still want can go to an appendix only if appendices don't count toward the limit — ask.
6. **Substance** — whole paragraphs, findings, figures: only with the user's agreement. Propose the specific cuts and the pages each would save.

Work section by section, largest first, aiming each pass at roughly the section's share of `toCut`. Edit with the usual tools (`read_text`/`write_text`, or the source), never by rewriting the whole file.

## Step 4 — Re-check after every pass

Run the same `open-doc check <id> --max-pages <N>` after each section you cut. Page breaks move non-linearly: a two-line cut can free a page, a big one can free nothing if a figure was what pushed the break. Also fix any new layout fault the check reports (an orphan heading where a section now ends, an overflow).

## Step 5 — Hand off

Report:

- before → after page count, and the limit;
- what you cut, per section, in one line each (e.g. "Method: merged the two tool paragraphs, dropped the second example — 0.4 p");
- anything you left that a person must decide (the Step 3.6 list), with the pages each would save;
- that `open-doc check` is clean.

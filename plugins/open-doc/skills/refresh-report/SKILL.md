---
name: refresh-report
description: Use this skill when a recurring document needs this period's numbers — "update the monthly report with October's data", "refresh the Q3 figures", "here is the new CSV, update the report", "roll the report forward", "/refresh-report". It swaps the data files, updates every table and chart that reads them, rewrites the prose that states or describes numbers (totals, growth rates, rankings, "up 12%"), leaves everything else alone, and hands back a list of every number that changed. Do NOT use for writing a new report — that is `create-doc`.
---

# Refresh a recurring report

A recurring report is mostly the same document with new numbers. The risk is not the tables — they read their data files — but the sentences: "revenue rose 12% to $4.2M", "the North region led again". Miss one and the report contradicts itself.

## Step 1 — Find the period's moving parts

1. Open `docs/<id>/index.tsx` and list every data import (`import sales from './data/sales.csv'`) and what reads it (`<DataTable rows>`, `<Chart rows>`, `<Sparkline>`, computed values).
2. Find every **number in prose and in hand-written tables** — anything not computed from a data file: amounts, percentages, counts, ranks, dates, the period name ("October", "Q3 2026", "this quarter"). Search the source (`search_document` over MCP, or grep for digits, `%`, currency signs and month names) and read each hit in context.
3. Ask for — or locate — the new data. **Never invent or estimate a number.** If a number in the prose cannot be derived from the new data you have, list it as unresolved instead of guessing.

## Step 2 — Replace the data

- Replace each data file with the new period's file, keeping the **same columns and header names**. If the columns changed, adapt the `columns` / `x` / `y` props that read them rather than renaming in the data.
- If the report keeps history (last period alongside this one), append the new rows instead of replacing — check how the old version did it.

## Step 3 — Update the prose, sentence by sentence

For each number found in Step 1.2:

- **Recompute it from the new data** (sum, average, growth vs. the previous period, share, rank). Show your arithmetic to yourself; round the way the document already rounds.
- **Update the words around it**: "rose" vs "fell", "highest" vs "second-highest", "again", "for the third month running", adjectives like "sharp" or "slight". A number that changed sign changes the sentence.
- Update the period name, report date, `meta.subtitle` and anything like "data as of".
- Leave sentences without numbers or period words untouched — this is a refresh, not a rewrite. If an analytical paragraph no longer holds (it explained a trend that reversed), flag it rather than rewriting the analysis yourself, unless the user asked you to.

Prefer making a repeated number computed once in the source (`const total = sum(sales, 'amount')`) and printed from there, so next period's refresh is smaller — but only where the document is already written that way or the user agrees.

## Step 4 — Check

```bash
open-doc check <id>
```

New data changes lengths: a table that grew splits differently, a longer name widens a column. Fix what the check reports. Then read the rendered pages (`render_page`, or the preview) for the sections you touched.

## Step 5 — Hand off a change list

The user will be asked "where did this number come from?" — give them the answer. One line per changed number:

| Where | Before | After | From |
| --- | --- | --- | --- |
| p.2 summary | 12% growth | 8% growth | sales.csv: Oct vs Sep total |

Then list: data files replaced, sentences whose meaning changed (not just the number), numbers you could not derive (left as they were, marked), and that the check is clean.

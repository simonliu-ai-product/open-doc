---
name: proofread
description: Use this skill to proofread an open-doc document for consistency — "proofread this", "check the wording is consistent", "fix punctuation and spacing", "are the terms consistent", "check for simplified characters", "/proofread". It runs `open-doc proofread` for the mechanical faults (full/half-width characters, punctuation width next to CJK, Simplified characters in a Traditional document and vice versa, doubled words, inconsistent capitalisation of terms), then reads for what only judgement finds (the same thing called two names, inconsistent number and date styles), and fixes after the user agrees. Do NOT use for layout faults — that is `open-doc check`.
---

# Proofread a document

## Step 1 — Mechanical pass

```bash
open-doc proofread <id>
```

(MCP: `proofread_document`.) Each finding has a page, a rule, the text it found and a `loc` (line:column) in the source. Rules:

| Rule | Finds |
| --- | --- |
| `fullwidth-alnum` | Full-width letters and digits (`２０２６`, `ＡＩ`) |
| `punctuation-width` | Half-width `, ; : ? ! ( )` against Chinese or Japanese text, full-width punctuation in Latin text |
| `script-mix` | Simplified-only characters in a Traditional Chinese document, and the reverse |
| `repeated-word` | Accidental doubles (`the the`, `的的`) |
| `term-casing` | One term spelled with different capitals (`GitHub` / `Github`) |

They are warnings, not errors: a quotation, a product name or a code sample may be right as written. Decide each one; never fix blindly.

## Step 2 — Judgement pass

Read the document (`read_text`, or the rendered pages) for what rules cannot decide:

- **One name per thing.** The same concept, product or role named two ways (`用戶`/`使用者`, `sign in`/`log in`, an abbreviation used before it is introduced). Prefer the form used most often, or the brief's glossary.
- **Numbers, dates, units**: one style per document — thousands separators, `%` vs `percent`, `2026/11/22` vs `2026-11-22` vs `2026 年 11 月 22 日`, currency placement.
- **Spacing between Chinese and Latin text**: open-doc adds the gap automatically inside one run of text, so manual spaces are optional — but be consistent within the document, and don't fight the house style.
- **Headings and lists**: parallel phrasing within one list, consistent punctuation at item ends.
- Typos and wrong characters (`的`/`得`/`地`, `在`/`再`).

Don't rewrite for style, tone or length — that is not proofreading.

## Step 3 — Propose, then fix

Group what you found by kind and show it as a short table: where, what it says, what it should say. For a long list, ask once whether to apply all of a kind ("make every `Github` `GitHub`?"). Then edit the source in place — text runs only — and re-run `open-doc proofread <id>` and `open-doc check <id>` (changed text can move page breaks).

## Hand off

What you changed (counts per kind, plus anything notable), findings you deliberately left (and why — a quote, a product name), and choices a person should confirm (which of two terms to keep).

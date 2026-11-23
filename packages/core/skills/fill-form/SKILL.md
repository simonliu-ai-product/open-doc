---
name: fill-form
description: Use this skill to fill in a form in an open-doc document — usually one imported from Word — with someone's details, without disturbing its layout. "Fill in this form", "幫我填這份申請表", "complete the application with these details", "tick 已婚", "fill the blanks from this data", "/fill-form". It finds the blanks, boxes and empty cells, fills them in the form's own type, ticks checkboxes, and checks the page still prints the same. Do NOT use to write a new document (create-doc) or to change the form's wording or design (doc-authoring).
---

# Fill in a form

A form imported from Word keeps Word's look: every label, rule and box is where Word put it. Filling it in means adding the applicant's words **into the spaces the form leaves** and changing nothing else.

## Step 1 — Gather the details

Ask for what you do not have; never invent a person's real details. If the user asks for sample data, make it plainly fictional. Read the form's own instructions (勾選此項者無需填寫…, 「無案號者免填」): some spaces are meant to stay empty, and a signature line is for a hand unless the user says to type a name there.

## Step 2 — Find the spaces

Work on a copy if the user wants the blank form kept (MCP `duplicate_document`, or copy `docs/<id>/` to a new folder). Then read `docs/<id>/index.tsx` and find each space by the label printed before it:

| Space | How it looks in the source | How to fill it |
| --- | --- | --- |
| Underlined blank (`姓名：____`) | `<span data-od-blank="" style={{ display: 'inline-block', minWidth: '4em', borderBottom: … }} />` | Put the text inside: `<span data-od-blank="" style={{ … }}>王小明</span>`. Keep the style; `minWidth` lets a long name widen the line instead of wrapping. |
| Checkbox | `<Checkbox />` | `<Checkbox checked />` (`mark="cross"` for ☒). It is drawn, so it keeps its size in any font. Never type ☑ — CJK fonts lack it and it prints smaller than the box beside it. |
| Empty table cell | `<td … />` or `<td …><p …><br /></p></td>` | Write the text into the cell's own `<p>` (or add one with the style of a filled cell in the same row). |
| Run of spaces (`填表日期：    年    月    日`) | Plain spaces in a `whiteSpace: 'pre-wrap'` paragraph | Replace spaces with the value, removing about as many spaces as characters you add so the line keeps its length. |
| Space after a label (`此致機關：`) | The label, then the end of the paragraph | Type the value after the label in the same span. |

The same label can appear in several tables (表1 and 表2 both have 姓名：); edit by a string that is unique in the file, and check each edit landed in the cell you meant.

## Step 3 — Fill without moving anything

- Text you add inherits the paragraph's font and size — do not set new ones.
- Paragraphs in Word forms often carry a hanging indent (`textIndent: -21`). Anything you add as an inline-block or positioned element should carry `textIndent: 0`, or it is pulled left over the label.
- Do not add rows, delete labels, or change widths, borders or line heights. If a value does not fit its space, ask before shrinking the type.

## Step 4 — Check it prints the same

1. `open-doc check <id>` — must stay clean, same page count as before.
2. Render the filled pages (`open-doc export <id> -f png` or MCP `render_page`) and compare with the blank form: same rows, same table rules, filled text sitting on its lines and inside its cells. The check does not see a row grown by 2 px or a tick outside its box — only the picture does.

## Hand off

Say what was filled and what was left empty on purpose (and why), and point at anything the user must still do by hand — a signature, a seal (用印), an attachment the form asks for.

---
'@open-document/core': minor
---

The inspector edits text wherever it actually lives.

A document written through helpers used to report `text is produced by code` for
most of itself: the words behind `{agency}`, `{line}` or `{children}` are not in
the element that renders them. Each child of the selected element now resolves
on its own — to a call site's attribute, to one entry of an array the call site
passed, to whatever sits between its tags, or to a template literal. Runs that
cannot be told apart by what is on screen are still refused, so a save never
rewrites a sibling.

Resolving the element as a whole was also why `{label}：{value}` offered nothing
but the colon: the literal was found, so the props were never looked for.

A contents row selects the heading it was generated from, and scrolls to it —
the list stays a view of the headings rather than something to type into.

The text panel is one field instead of one per run. A sentence interrupted by
five `<code>` spans is still a sentence; it now reads like one, with the markup
between the words as inert chips.

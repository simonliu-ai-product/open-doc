---
'@open-document/core': minor
---

The inspector can edit text a component receives as props. Clicking a heading
whose source reads `{agency}　{kind}` used to report that the text was produced
by code; the words are found at the call site and edited there, leaving the
expression alone. Two call sites of the same component are told apart by what
is on screen, and anything that cannot be resolved that way is still refused.

---
'@open-document/core': patch
---

The document browser's pages now line up. Documents, folders, Themes and
Assets share one page frame, one header (title, description, actions), one
empty state, and one card width and grid, so moving between them no longer
shifts every edge.

- **Document cards** wrap long titles onto a second line instead of cutting
  them off. Their second line reads as the sheet and the date, e.g.
  `A4 · Oct 1, 2026`, where it used to say `3 + flow`.
- **Asset cards** use the same layout as documents:
  - The name has its own line.
  - The size and an *unused* note sit beneath it.
  - Copy import is a button, and Rename and Delete are in the ⋯ menu.
- **Asset previews** are drawn on white paper in both themes, so a dark logo
  is visible.
- **Assets page**:
  - The Upload button sits in the header.
  - Files can be dropped anywhere on the page.
  - The scope switcher is a segmented control. Its first option is called
    *Project*, as in the viewer's assets panel.

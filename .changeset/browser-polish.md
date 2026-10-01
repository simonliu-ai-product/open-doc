---
'@open-document/core': minor
'@open-document/cli': patch
---

A pass over the browser and viewer chrome:

- **⌘K command palette**, everywhere. Find any document by its title, a
  folder, a theme, or a page of the browser, and switch between light and
  dark. Inside a document it also lists the document's sections with their
  pages, jumps to page N when you type a number, and runs the viewer's
  actions: download in any format, the three layouts, fullscreen, edit mode
  and the design panel. A Search field at the top of the sidebar opens it
  too.
- **Document list.** It can be sorted (Newest, Oldest, A–Z, Z–A; the choice
  is remembered) and filtered by title.
- **Page headers** show an icon, the title and a count. The explanatory text
  meant for developers is gone, and empty states speak to people using
  open-doc rather than to the framework.
- **Cards** grow with the window, so pages and themes preview at a readable
  size.
- **Content panels.** Both the browser and the viewer sit on an inset,
  rounded panel. The theme toggle moves to the sidebar footer.
- **Page rail.** It numbers its thumbnails (01, 02 …) and marks the current
  page.
- **Copy link** button in the viewer header.

Document titles are now read at build time alongside `createdAt`
(`docTitles` in `virtual:open-doc/docs`), so search and sorting don't load
every document. The user guides list ⌘K among the shortcuts.

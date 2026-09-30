---
'@open-document/core': minor
'@open-document/mcp': minor
---

Export to Word (`.docx`), for review that runs in Word — track changes, Word
comments, pasting a section into someone else's template.

```bash
open-doc export my-report --format docx
```

and **Word (DOCX)** in the viewer's Download menu, with the same page range
prompt as the other formats. MCP's `export_document` takes `docx` too.

The output is structure that Word lays out itself, not a picture of the pages —
Word repaginates the moment anyone edits:

- Page size, orientation and margins from the document; each fixed page starts
  a new Word page, and a `flow()` section's pages continue one another. A fixed
  page keeps where it placed its words — a cover's title low on the sheet, a
  closing line centred — and sits in a section without the flow's footer.
- Headings become Word's Heading styles, so the navigation pane works; the
  cover's title becomes Title, and a heading kept out of the outline ("Contents")
  becomes TOC Heading.
- `<TableOfContents />` becomes a TOC field Word updates when the file opens;
  `<ListOfFigures />` and `<ListOfTables />` point at bookmarked captions with
  `PAGEREF` fields, dot leaders and all.
- Bold, italic, underline, strikethrough, colour, size, code and links are read
  from the rendered page's own styles; line breaks, lists (each ordered list
  counting on its own) and code blocks with their indentation survive. A code
  block's panel and a quote's rule come across as a shaded, bordered box, and
  code is kept out of the spelling check.
- Tables keep their column widths, cell borders and a header row that repeats
  across pages; captions use the Caption style.
- `<Footnote>` becomes a real Word footnote.
- A `flow()` footer becomes the Word footer, with `PAGE` and `NUMPAGES` fields
  where the page numbers were.
- Fonts come from the design: the first real family in each stack, and a CJK
  family anywhere in it as the East Asian font (`w:eastAsia`), so Word does not
  substitute one and change the line breaks. A font table names a stand-in of
  the same kind for each, so code stays monospaced where the web font is not
  installed.
- Images are embedded; anything drawn rather than written — a chart made of
  boxes, a compiled diagram — is placed as a picture.

Not carried over: decoration drawn with no text (a coloured band), running
lines drawn inside fixed pages, rounded corners, and page-for-page breaks.

Also fixes PNG and SVG downloads from the viewer laying a page out against no
height: anything placed against the foot of the sheet — a footer, a cover's
title, a centred closing page — moved up to the top.

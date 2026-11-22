---
"@open-document/core": minor
"@open-document/mcp": minor
---

Import Word documents. `open-doc import form.docx` turns a `.docx` into an ordinary open-doc document that looks like the Word page: the paper size and margins, centred and right-aligned lines, indents and hanging indents, paragraph spacing and line height, fonts (Ming and Kai faces print in a serif, Hei and Arial-like faces in a sans), sizes, bold, italic, underline and colours all come across. Tables keep their column widths, merged cells, borders and grey shading; underlined blanks such as `姓名：____` stay blanks to write on; Word's page and section breaks start a new page, and a label just above a table stays with it. There is no added cover — the first page is the first page Word printed. Paragraphs in Word's heading styles are still real headings, so the outline, the inspector and the design panel work as on any document, and a long table without merged rows breaks across pages by rows.

Add `--plain` (MCP `plain: true`) to import only the structure in the house style instead, like Markdown import: headings, lists, tables and links, with a cover from Word's Title and Subtitle.

Either way, embedded pictures are copied into the document's `assets/`, the language is detected as for Markdown, and what a document cannot hold is reported instead of silently lost: text boxes are kept as paragraphs, footnotes and endnotes move to the end, tracked changes are accepted, and comments, charts and EMF/WMF pictures are listed as warnings in the command's output.

AI agents get the same through the new `import_docx` MCP tool. Documents can also use `useTableSlice` from `@open-document/core` to print only a split table's rows on each page.

Markdown import also names a document after its file when the title has no Latin letters to make an id from (a Chinese title used to give `document`), and text that looks like an HTML entity (`&copy;`) now stays as written.

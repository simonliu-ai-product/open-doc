---
"@open-document/core": minor
"@open-document/mcp": minor
---

Import Word documents. `open-doc import form.docx` turns a `.docx` into an ordinary open-doc document that looks like the Word page: the paper size and margins, centred and right-aligned lines, indents and hanging indents, paragraph spacing and line height, fonts (Ming and Kai faces print in a serif, Hei and Arial-like faces in a sans), sizes, bold, italic, underline and colours all come across. Tables keep their column widths, merged cells, borders and grey shading; underlined blanks such as `姓名：____` stay blanks to write on; Word's page and section breaks start a new page, and a label just above a table stays with it. There is no added cover — the first page is the first page Word printed. Paragraphs in Word's heading styles are still real headings, so the outline, the inspector and the design panel work as on any document, and a long table without merged rows breaks across pages by rows.

Add `--plain` (MCP `plain: true`) to import only the structure in the house style instead, like Markdown import: headings, lists, tables and links, with a cover from Word's Title and Subtitle.

Either way, embedded pictures are copied into the document's `assets/`, the language is detected as for Markdown, and what a document cannot hold is reported instead of silently lost: footnotes print at the foot of their page and endnotes after the text, tracked changes are accepted, and comments, charts and EMF/WMF pictures are listed as warnings in the command's output.

AI agents get the same through the new `import_docx` MCP tool. Documents can also use `useTableSlice` from `@open-document/core` to print only a split table's rows on each page.

Markdown import also names a document after its file when the title has no Latin letters to make an id from (a Chinese title used to give `document`), and text that looks like an HTML entity (`&copy;`) now stays as written.

Word files from any producer come in: Strict OOXML, LibreOffice, Google Docs, WPS and older Word files, `.docm` and `.dotx` templates. Nothing is lost on the way — ruby (注音) over Chinese characters, content controls and checkboxes, fields, symbol-font boxes (☐ ☑), drop caps, internal links, right-to-left text, multi-column sections, table-style header rows and banding, grouped and old-style text boxes placed where Word put them, and line spacing that follows the font as Word's does (標楷體 and 新細明體 on a line grid). Headers and footers print in the margin band of every page with live page numbers (`Page 3 of 9`), including a different first page, and a header taller than its margin pushes the text down as Word does. A picture or chart that cannot come across keeps a labelled frame of its size, hidden text is reported, a long table or row breaks across pages, and a password-protected file or an old `.doc` is refused with a message saying what to do.

Imported forms are ready for an agent to fill in: underlined blanks — and the spaces a form leaves for a date (`　　年　　月`) — are marked `data-od-blank`, named for their label (`data-od-field="填表日期.月"`) and widen to fit what is typed into them, and ☐ boxes become the new `<Checkbox>` component — drawn, so `<Checkbox checked />` keeps its size in any font. The new `fill-form` skill walks an agent through filling a form in place and checking it still prints the same.

Fonts a Word file embeds are unscrambled into the document's assets and registered under their own names, so its text sets in Word's type on any machine.

---
"@open-document/core": minor
"@open-document/mcp": minor
---

Import Word documents. `open-doc import report.docx` turns a `.docx` into an ordinary open-doc document, exactly like Markdown import: headings come from Word's heading styles (including Chinese Word's), the Title and Subtitle styles fill the cover, and paragraphs keep their bold, italic, code-font runs, links and line breaks. Bulleted and numbered lists keep their nesting, tables come in with the first row as the header, embedded pictures are copied into the document's `assets/` (a Caption paragraph under a picture becomes its caption), and the document's language is detected as for Markdown. Files without heading styles, such as those saved by TextEdit, get their headings and typed bullets recognised from the formatting.

What a document cannot hold is reported instead of silently lost: text boxes are kept as paragraphs, footnotes and endnotes move to a numbered list at the end, tracked changes are accepted, and comments, charts and EMF/WMF pictures are listed as warnings in the command's output.

AI agents get the same through the new `import_docx` MCP tool.

Markdown import also names a document after its file when the title has no Latin letters to make an id from (a Chinese title used to give `document`), and text that looks like an HTML entity (`&copy;`) now stays as written.

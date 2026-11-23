---
name: import-document
description: Use this skill to bring an existing Word, PDF or Markdown document into open-doc — "import this .docx", "convert our old report PDF", "move this Word template into open-doc", "rebuild this PDF as a document", "/import-document". Word and Markdown go through `open-doc import`; a PDF is read and rebuilt as Markdown first. It then applies a theme, fixes what the conversion lost and runs the layout check until clean. Do NOT use for writing new content — that is `create-doc`.
---

# Import an existing document

## Word (`.docx`) and Markdown (`.md`)

```bash
open-doc import <file> --lang zh-Hant-TW --theme <theme> --contents
```

Over MCP: `import_docx` for Word, `import_markdown` for Markdown. Useful CLI flags: `--id`, `--title`, `--subtitle`, `--author`, `--page-size`, `--orientation`, `--no-cover`, `--contents` (`open-doc import --help`). The language is detected for Chinese, Japanese and Korean text when `--lang` is omitted — pass it anyway when you know it. Images are copied into `docs/<id>/assets/`. An old binary `.doc` is refused: ask for it saved as `.docx`.

The command prints what it could not carry over (for Word: text boxes, comments, tracked changes, anything without structure). Read that list — every item is something you must fix or report in Step 3.

## PDF

A PDF has no structure to import, only positioned text. Rebuild it:

1. Read the PDF. If you can read PDF files directly, do. Otherwise extract text with `pdftotext -layout <file.pdf> -` (poppler) when it is installed. A scanned PDF has no text layer: say so and ask for the original file or an OCR'd copy rather than retyping it from images.
2. Write the content as Markdown in a scratch file: headings by their visual rank (`#`, `##`, `###`), paragraphs re-joined across line and page breaks, lists, tables as GFM tables, footnotes as plain text. Drop running headers, footers and page numbers — open-doc makes its own.
3. Keep **every word and number exactly as in the PDF**. Do not summarise, correct or "improve" — this is a conversion. Note what you could not read.
4. Pictures: if you can extract them (`pdfimages -png`), reference them from the Markdown; otherwise leave an `<ImagePlaceholder>` with what the picture showed, and list it.
5. `open-doc import <scratch.md> …` as above, then delete the scratch file.

## Word keeps its look

A `.docx` imports with Word's page look by default: page size and margins, fonts, alignment, colours, table grid with merged cells, borders and shading, fill-in blanks. That is usually what the user wants — a form must still look like the form. So for a Word import, **skip the theme and restyle steps below** unless the user asks for a restyle; then re-import with `--plain` (MCP `plain: true`), which keeps only the structure, and continue with the steps below. Still run the check and the proofread. To fill an imported form in, use the `fill-form` skill.

## After a Markdown, PDF or `--plain` import

1. **Theme and design**: apply the house theme (`--theme`, or follow `themes/<id>.md` for the components it offers) instead of restyling by hand.
2. **Restore what conversion flattens**, following `doc-authoring`: a table of numbers that came from a spreadsheet becomes a `.csv` with `<DataTable>`; numbered figures and tables get `<Figure>` and `<Ref>`; a chart that arrived as a picture can stay a picture unless its data is available.
3. **Check until clean**:

   ```bash
   open-doc check <id>
   ```

   Fix overflowing tables (fewer columns, `splittable`), oversized images, stranded headings.
4. **Proofread** with the `proofread` skill — converted documents often carry full-width digits, mixed punctuation and stray double spaces.

## Hand off

The new document id, what came across cleanly, everything that did not (the import's warnings, unreadable passages, placeholders standing in for pictures), and that the check is clean. Do not delete or modify the original file.

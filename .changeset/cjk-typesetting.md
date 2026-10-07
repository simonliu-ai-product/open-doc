---
"@open-document/core": minor
"@open-document/mcp": minor
---

Set Chinese, Japanese and Korean properly. A document declares its language with `meta.lang` (`'zh-Hant-TW'`, `'ja'`…), and every sheet — in the viewer, the thumbnails, the flow measurement and the PDF, HTML, PNG and Word exports — carries it, so glyphs and line-breaking follow the document rather than the reader's interface language (which used to leak into the page). The sheet's base style adds strict kinsoku and an eighth-em gap where CJK meets Latin letters or digits, and phrase-aware breaks in Japanese headings. HTML exports declare the document's language instead of always `en`, and Word files set the East Asian language. Markdown import takes `--lang` (and `lang` in front matter or over MCP), and detects Traditional or Simplified Chinese, Japanese and Korean when it is not given.

---
"@open-document/core": minor
"@open-document/mcp": minor
---

New `open-doc proofread [ids…] [--json]` and MCP tool `proofread_document`: read the text a document prints and report the slips a copy editor would mark — full-width letters and digits (`Ａ１`), punctuation of the wrong width for the language (`中文,中文` in Chinese or Japanese, `word，word` elsewhere), Simplified characters in a Traditional Chinese document or the reverse, doubled words (`the the`, `的的`), and one term capitalised two ways (`GitHub` / `Github`). Each finding carries the page, a snippet and the source `line:column`. Code, URLs, email addresses and emoticons are left alone. It is advice: every finding is a warning and the command always exits 0.

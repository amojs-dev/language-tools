# Changelog

## 0.1.0-dev — unreleased

First slice: everything that needs no coupling to the AmoJS compiler.

- HTML syntax highlighting inside `` html`` `` tagged templates, via a TextMate
  injection into `source.js` / `source.ts` (and the JSX/TSX variants).
- `${…}` holes are highlighted as JavaScript, including **attribute** holes
  (`class=${x}`, `class="${x}"`, `onclick=${fn}`). The grammar parses tags itself
  to make that work — the HTML grammar owns a tag once it enters one, and no
  injection is consulted inside it, so an attribute hole would otherwise have
  ended up as a plain HTML string with no completion.
- Embedded-language registration so HTML IntelliSense and Emmet work inside a
  template, and JavaScript completion works inside a hole.
- Snippets for the whole 12-name API.
- Commands **AmoJS: Build** and **AmoJS: Eject**, run as workspace tasks, with
  settings for the CLI path and the source/output directories.
- 18 tokenizer tests run against the real JavaScript and HTML grammars from an
  installed VS Code or Cursor.

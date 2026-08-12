# Changelog

## 0.4.0

- **Fixes the Build command against AmoJS 0.10.** `amo build` became one verb
  with three modes (`csr | ssr | ssg`) and `src/` → `dist/` defaults, so the old
  `amo build <src> <out>` line the extension emitted is now an error. It emits
  the shortest correct command instead: plain `amo build` at the defaults.
- **New setting `amojs.build.mode`** (`csr` · `ssr` · `ssg`). Server-rendered and
  static projects can use the Build command now, not only client-side ones.
- Tracks `@amojs.dev/compiler@^0.10.0`, so the editor's diagnostics match the
  current parser — raw-text elements (`<textarea>`, `<script>`, `<style>`,
  `<title>`) carrying static content are accepted, and a hole inside one is
  reported with the cure.
- The extension has an icon.


## 0.3.0 — first Marketplace release

- Tracks the package rename: the compiler is now `@amojs.dev/compiler`, and the
  specifier the extension looks for is `@amojs.dev/core`. Snippets and the
  diagnostics fixtures moved with it.
- Depends on the **published** `@amojs.dev/compiler`, not a local checkout, so
  the shipped bundle is reproducible.
- Verified in the packaged `.vsix`: the parser and acorn are bundled, while the
  compiler's filesystem code (`build`, `eject`) is absent — the narrow
  `diagnose` entry does what it was built for.

## 0.2.0 — unreleased (folded into 0.3.0)

Template diagnostics — the axis where AmoJS can beat a lit-html plugin rather
than tie it.

- Inline errors from AmoJS's own parser, via `diagnose()` in `@amojs.dev/compiler`.
  Every judgement about legality comes from the compiler, so the editor and
  `amo build` cannot disagree; the extension only converts offsets to ranges.
- Ranges are grown from the parser's point into the smallest thing worth
  underlining — a tag with its name, a `/>`, or the whole `${…}` when the hole
  itself is the problem.
- Debounced 300ms while typing, immediate on save, cleared when a file closes.
- Silent on files that do not import `amojs`, and silent on JavaScript syntax
  errors, which the built-in JS/TS support already reports.
- Analysis is imported through the narrow `@amojs.dev/compiler/diagnose` entry, so the
  package's filesystem code (`build`, `eject`) never reaches the extension.

## 0.1.0 — unreleased (folded into 0.3.0)

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

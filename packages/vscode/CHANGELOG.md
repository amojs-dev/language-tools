# Changelog

## 0.5.0

- Tracks `@amojs.dev/compiler@^0.11.0`, keeping the editor's parser the same
  one `amo build` uses. The CLI grew `amo dev`, `amo serve`, TypeScript input
  and `public/` root assets in this cycle; none of that changes what the
  extension underlines, and all 25 extension tests pass unchanged against the
  new compiler — the bump exists so the two cannot drift.

## 0.4.1

- Fixes the listing itself. This README — which *is* the Marketplace page — still
  said "Pre-release (`0.1.0-dev`), not on the Marketplace yet", stale since the
  first draft. It also told readers that files not importing `amojs` are skipped;
  the specifier has been `@amojs.dev/core` since the scope rename.

## 0.4.0 — first Marketplace release

Everything the extension does, in one place.

- **HTML syntax highlighting inside `` html`` `` templates**, via a TextMate
  injection into `source.js` / `source.ts` and the JSX/TSX variants. `${…}` holes
  are highlighted as JavaScript, **including attribute holes** (`class=${x}`,
  `class="${x}"`, `onclick=${fn}`) — the grammar parses tags itself to make that
  work, because the HTML grammar owns a tag once it enters one and consults no
  injection inside it.
- **HTML IntelliSense and Emmet** in there too: template contents are registered
  as an embedded HTML region and holes as embedded JavaScript, so completion works
  inside attribute values as well as element children.
- **Template diagnostics from AmoJS's own parser** — the axis where this beats a
  lit-html plugin rather than tying it, since the browser parses those templates
  permissively and has nothing to report. Every judgement comes from `diagnose()`
  in `@amojs.dev/compiler`, so the editor and `amo build` cannot disagree; the
  extension only converts offsets to ranges. Ranges grow from the parser's point
  to the smallest thing worth underlining — a tag with its name, a `/>`, or the
  whole `${…}` when the hole itself is the problem. Debounced 300 ms while typing,
  immediate on save, cleared when a file closes. Silent on files that do not
  import `@amojs.dev/core`, and silent on JavaScript syntax errors, which the
  built-in JS/TS support already reports.
- **Snippets** for the whole twelve-name API (`amocomp`, `amosignal`, `amoeach`, …).
- **Two commands**, AmoJS: Build and AmoJS: Eject, run as workspace tasks — with
  a `amojs.build.mode` setting (`csr` · `ssr` · `ssg`), so server-rendered and
  static projects can use Build, not only client-side ones.
- Tracks `@amojs.dev/compiler@^0.10.0` — the current parser, so raw-text elements
  (`<textarea>`, `<script>`, `<style>`, `<title>`) carrying static content are
  accepted and a hole inside one is reported with its cure.
- Analysis comes through the narrow `@amojs.dev/compiler/diagnose` entry, so the
  package's filesystem code (`build`, `eject`) never reaches the extension —
  verified in the packaged `.vsix`, which bundles the parser and acorn while
  `buildDir`/`ejectDir` are absent, and requires only `node:fs`, `node:path` and
  `vscode`.

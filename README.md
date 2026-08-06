# amojs-language-tools

Editor tooling for [AmoJS](https://github.com/amojs-dev/amojs).

```
packages/
  vscode/     the VS Code extension — Marketplace id `amojs`
```

## Why this is small

Vue's and Svelte's language tools are large projects because `.vue` and
`.svelte` files are **not JavaScript**: the editor has no idea what they are, so
those repos must generate virtual TypeScript (`svelte2tsx`,
`@vue/language-core`), run a language server, and ship a `tsc` twin to keep CI
honest.

An AmoJS file is standard `.js` or `.ts`. Hover, go-to-definition, rename,
find-references and type-checking already work, for free, today. The only thing
the editor cannot see is the inside of the `` html`` `` template string — and
filling that in is a pure function over the document, not a server.

So: **no language server, no LSP, no TypeScript plugin.** The modest size of
this repository is a dividend of AmoJS having no file format, not a shortcut.

## One package, on purpose

There is no separate `analyzer` package, and the reason is worth writing down
because the opposite was proposed first.

The argument for splitting was testability — extension code supposedly needs
`@vscode/test-electron`. That is only true of code which imports `vscode`. A
module that does not is an ordinary TS file, and vitest imports it directly;
`packages/vscode/test/grammar.test.ts` already proves it, running under plain
vitest inside this package with no editor involved.

Svelte and Vue do split, but for a reason that does not transfer: their language
server is consumed by other editors over LSP. We are deliberately not building
one.

What actually remains here is thin. The analysis that matters — turning a
template error into a source range — lives in `amojs-compiler`, where AmoJS's
own test suite covers it and it cannot drift. The extension side is the glue that
converts offsets into `vscode.Range`. Glue is not a package.

Two rules keep the option open, so splitting later is a file move rather than a
rewrite:

1. **Analysis code imports nothing from `vscode`** — enforced by a test, not by
   discipline.
2. **It wraps `amojs-compiler`; it never re-implements parsing.** Two tokenizers
   that disagree is the worst outcome available — the editor calls a template
   fine and the build fails, or the reverse.

## Phases

| | |
|---|---|
| **1** ✅ | Syntax highlighting inside `` html`` ``, embedded HTML/JS IntelliSense, snippets, build/eject commands. Zero coupling to AmoJS's code — it is a grammar. |
| **2** | Inline diagnostics from AmoJS's own parser. Needs three small additions on the AmoJS side: structured errors carrying `{ part, offset }`, quasi source ranges, and one `diagnose()` entry point. |
| **3** | Marketplace release. |

## Development

```bash
pnpm install
pnpm build     # bundle the extension with esbuild
pnpm test      # tokenizer tests against the real JS + HTML grammars
pnpm check     # build, then typecheck
```

To try it in a real editor, open a window with the extension loaded:

```bash
code --extensionDevelopmentPath="$PWD/packages/vscode" some-amo-project/
```

Then open a `.js` file containing an `` html`` `` template.

## License

MIT

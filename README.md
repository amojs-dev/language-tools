# amojs-language-tools

Editor tooling for [AmoJS](https://github.com/amojs-dev/amojs).

```
packages/
  vscode/     the VS Code extension — Marketplace id `amojs-dev.amojs`
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
template error into a source range — lives in `@amojs.dev/compiler`, where AmoJS's
own test suite covers it and it cannot drift. The extension side is the glue that
converts offsets into `vscode.Range`. Glue is not a package.

Two rules keep the option open, so splitting later is a file move rather than a
rewrite:

1. **Analysis code imports nothing from `vscode`** — enforced by a test, not by
   discipline.
2. **It wraps `@amojs.dev/compiler`; it never re-implements the template parser.**
   Two parsers that disagree is the worst outcome available — the editor calls
   a template fine and the build fails, or the reverse. Finding *where* a
   template literal sits is a lexical job and lives here (the compiler's own
   detector is acorn, which reads JavaScript only, and TypeScript files need
   the same treatment); whether its contents are legal is always the
   compiler's verdict.

## Phases

| | |
|---|---|
| **1** ✅ | Syntax highlighting inside `` html`` `` (a grammar, zero coupling to AmoJS's code), snippets, build/eject commands. |
| **2** ✅ | Inline diagnostics from AmoJS's own parser, through the compiler's `diagnose` entry — the editor and `amo build` share one parser. |
| **3** ✅ | Published: VS Code Marketplace and Open VSX. |
| **4** ✅ | HTML completion inside templates, and templates located lexically so `.ts` files get diagnostics and completion too. |

## Development

```bash
pnpm install
pnpm build     # bundle the extension with esbuild
pnpm test      # grammar tests against the real JS + HTML grammars, plus scanner, analysis and completion
pnpm check     # build, then typecheck
```

To try it in a real editor, open a window with the extension loaded:

```bash
code --extensionDevelopmentPath="$PWD/packages/vscode" some-amo-project/
```

Then open a `.js` or `.ts` file containing an `` html`` `` template.

## License

MIT

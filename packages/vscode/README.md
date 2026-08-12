# AmoJS for VS Code

HTML syntax highlighting and IntelliSense inside AmoJS `` html`` `` templates,
plus `build` and `eject` commands.

## What it does

**Highlights the template as HTML.** Tags, attributes and text inside
`` html`…` `` are coloured like HTML instead of like one long string, and
`${…}` holes go back to being JavaScript.

```js
const el = html`<button class=${cls} onclick=${() => count.value++}>
  ${count} × 2 = ${double}
</button>`;
```

**Gives you HTML IntelliSense in there too** — tag and attribute completion, and
Emmet — because the template contents are registered as an embedded HTML region.
Holes are registered as embedded JavaScript, so completion works inside
`class=${…}` as well, not only in element children.

**Snippets** for the whole API — type `amo` and pick: `amocomp`, `amosignal`,
`amocomputed`, `amoeach`, `amoif`, `amoref`, `amoonmount`, `amocleanup`,
`amoroot`, `amomount`, `amoeffect`, `amoimport`.

**Tells you when a template is wrong.** AmoJS's parser accepts a strict subset
and refuses to guess, so the errors are specific and they appear where the
problem is:

| you wrote | you get |
|---|---|
| `html\`<div><p>hi</p>\`` | `unclosed <div>` on the `<div>` |
| `html\`<div/>\`` | self-closing is only valid on void elements, on the `/>` |
| `html\`<circle r=${n}/>\`` | the unquoted-hole trap, on the `/>` |
| `html\`<div ${x}>\`` | a hole may only be a child or a full attribute value, on the `${x}` |

This is the part a lit-html plugin cannot do: the browser parses those templates
permissively, so there is nothing to report. Here the same parser that runs
`amo build` is the one underlining your code, which means the editor and the
build cannot disagree.

Files that do not import from `@amojs.dev/core` are left alone entirely, and
JavaScript syntax errors are left to the built-in JS/TS support rather than
reported twice.

**Two commands** (Command Palette): **AmoJS: Build** and **AmoJS: Eject**. Both
run the `amo` CLI as a task in your workspace folder.

## What it deliberately does not do

There is **no language server**, and that is a design decision rather than a
missing feature. An AmoJS file is standard JavaScript, so hover,
go-to-definition, rename, find-references and type-checking are already handled
by the built-in JS/TS support — nothing needs to be re-created. Compare Vue and
Svelte, whose language tooling is large because `.vue` and `.svelte` files are
not JavaScript and the editor must be taught what they are from scratch.

Also not here: a formatter for template contents, and type-checking *inside*
templates.

## Settings

| setting | default | what it does |
|---|---|---|
| `amojs.cli.path` | `amo` | how to invoke the CLI; may include arguments, e.g. `pnpm amo` |
| `amojs.build.mode` | `csr` | `csr` for the browser, `ssr` for per-request rendering, `ssg` for static pages. `ssr`/`ssg` also build `src/islands/` for the browser |
| `amojs.build.srcDir` | `src` | source directory passed to build and eject |
| `amojs.build.outDir` | `dist` | output directory for **build** |
| `amojs.eject.outDir` | `ejected` | output directory for **eject** |
| `amojs.eject.runtimeDir` | `amo-runtime` | where the ejected runtime is written |

## Known limitations

- **A foreign `` html`` `` is highlighted too.** A TextMate grammar cannot follow
  imports, so a lit-html template — or your own local `html` helper — gets the
  same treatment. The AmoJS *compiler* is import-aware and unaffected; only the
  colouring is generous. `obj.html`` ` is excluded, since a member expression is
  never an AmoJS template.
- **One error per template at a time.** The parser stops at its first failure,
  so a template with two problems shows the second only once the first is fixed.
  Separate templates are reported independently.
- **An escaped character makes the range coarser.** The parser reads the cooked
  string, where `` \` `` is one character while the source spends two, so precise
  placement would drift. When a static part contains an escape the whole part is
  underlined and the message says "somewhere in this part" rather than pointing
  confidently at the wrong column.
- **The bundled parser can differ from the one your project builds with.** The
  extension carries its own copy of the AmoJS parser (the changelog names the
  exact version each release tracks), so if your project pins a different one,
  the editor and `amo build` can in principle disagree. Resolving your
  project's own installed parser first is the fix; it is not built yet.
- **A dynamic `` <title>${…}</title> `` is not flagged either way.** It compiles
  for the server target and is rejected for the browser one, and nothing in a
  file says which target it is built for — so the editor stays silent and lets
  the build report it, rather than underlining correct server code.

## Status

Released. The extension bundles `@amojs.dev/compiler` — the same parser
`amo build` runs — so the editor and the build agree by construction.

AmoJS itself is **pre-1.0**
([`@amojs.dev/core`](https://www.npmjs.com/package/@amojs.dev/core)), so the
template language can still change. When it does, this extension follows.

Part of [amojs-dev/language-tools](https://github.com/amojs-dev/language-tools).
Bugs and requests: [issues](https://github.com/amojs-dev/language-tools/issues).

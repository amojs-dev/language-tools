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
- Template diagnostics are not here yet. AmoJS's parser produces precise
  strict-subset errors (`unclosed <div>`, `an attribute hole must be the entire
  attribute value`) and surfacing them inline is the next milestone.

## Status

Pre-release (`0.1.0-dev`), not on the Marketplace yet.
Part of [amojs-dev/language-tools](https://github.com/amojs-dev/language-tools).

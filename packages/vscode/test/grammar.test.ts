/**
 * Tokenizer tests for the html`` injection grammar.
 *
 * A TextMate grammar is a pile of regexes whose interactions are not obvious
 * from reading them, so it gets asserted rather than eyeballed. `vscode-textmate`
 * + `vscode-oniguruma` are the same engine VS Code itself runs, and the real
 * JavaScript and HTML grammars are loaded from an installed editor.
 *
 * Everything here needs those real grammars. An earlier version of this file
 * also tested the injection ALONE, with `source.js` and `text.html.basic`
 * unresolved — and those tests reported passes and failures that had nothing to
 * do with real behaviour, because a grammar whose includes resolve to nothing is
 * not the grammar that ships. Same lesson as testing DOM semantics in a DOM
 * emulator: verify against the real thing or do not claim the result.
 */
import { test, expect, describe, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const HERE = import.meta.url.startsWith('file:')
  ? dirname(fileURLToPath(import.meta.url))
  : dirname(import.meta.url);

const OUR_SCOPE = 'inline.amojs.html';
const OUR_GRAMMAR = join(HERE, '../syntaxes/amojs-html.injection.json');

/** Where an installed editor keeps the grammars we embed. */
const CANDIDATES = [
  '/Applications/Cursor.app/Contents/Resources/app/extensions',
  '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions',
  '/usr/share/code/resources/app/extensions',
  '/usr/lib/code/extensions',
];
const editorBase = CANDIDATES.find(
  (p) => existsSync(join(p, 'javascript/syntaxes/JavaScript.tmLanguage.json')),
);

let grammar: textmate.IGrammar;

beforeAll(async () => {
  if (!editorBase) return;
  const require = createRequire(import.meta.url);
  const wasm = join(dirname(require.resolve('vscode-oniguruma')), '../release/onig.wasm');
  await oniguruma.loadWASM(await readFile(wasm));

  const sources: Record<string, string> = {
    [OUR_SCOPE]: OUR_GRAMMAR,
    'source.js': join(editorBase, 'javascript/syntaxes/JavaScript.tmLanguage.json'),
    'text.html.basic': join(editorBase, 'html/syntaxes/html.tmLanguage.json'),
  };

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (s) => new oniguruma.OnigScanner(s),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scope) => {
      const file = sources[scope];
      return file ? textmate.parseRawGrammar(await readFile(file, 'utf8'), file) : null;
    },
    // this is what package.json's `injectTo` does at runtime
    getInjections: (scope) =>
      scope === 'source.js' || scope.startsWith('source.js.') ? [OUR_SCOPE] : undefined,
  });

  const loaded = await registry.loadGrammar('source.js');
  if (!loaded) throw new Error('could not load source.js');
  grammar = loaded;
});

interface Tok {
  text: string;
  scopes: string[];
}

/** Tokenize, flattening all lines and dropping whitespace-only tokens. */
function tokenize(code: string): Tok[] {
  const out: Tok[] = [];
  let state = textmate.INITIAL;
  for (const line of code.split('\n')) {
    const result = grammar.tokenizeLine(line, state);
    for (const t of result.tokens) {
      const text = line.slice(t.startIndex, t.endIndex);
      if (text.trim() !== '') out.push({ text, scopes: t.scopes });
    }
    state = result.ruleStack;
  }
  return out;
}

const has = (t: Tok, needle: string): boolean => t.scopes.some((s) => s.includes(needle));
const pick = (toks: Tok[], needle: string): Tok[] => toks.filter((t) => has(t, needle));
const textOf = (toks: Tok[]): string => toks.map((t) => t.text).join('');

/** everything the extension treats as a hole */
const HOLE = 'meta.template.expression.amojs';
/** the region package.json maps to the html language */
const EMBEDDED = 'meta.embedded.block.html';

describe.skipIf(!editorBase)('html`` injection grammar', () => {
  test('the tag and its backticks are claimed', () => {
    const toks = tokenize('const el = html`<p>hi</p>`;');
    expect(pick(toks, 'entity.name.function.tagged-template.amojs')[0].text).toBe('html');
    expect(pick(toks, 'punctuation.definition.string.template.begin')).toHaveLength(1);
    expect(pick(toks, 'punctuation.definition.string.template.end')).toHaveLength(1);
  });

  test('the injection wins over the host template-literal rule', () => {
    const toks = tokenize("import { html } from '@amojs.dev/core';\nconst el = html`<p>hi</p>`;");
    expect(pick(toks, 'meta.import')).not.toHaveLength(0); // real JS is running
    expect(textOf(pick(toks, EMBEDDED))).toBe('<p>hi</p>'); // and we still won
  });

  test('tags and attribute names get real HTML scopes', () => {
    const toks = tokenize('html`<div class="card">hi</div>`;');
    expect(textOf(pick(toks, 'entity.name.tag'))).toContain('div');
    expect(textOf(pick(toks, 'entity.other.attribute-name'))).toContain('class');
    expect(textOf(pick(toks, 'string.quoted'))).toContain('card');
  });

  test('a child hole is JavaScript again, not HTML text', () => {
    const toks = tokenize('html`<p>${count.value * 2}</p>`;');
    const hole = pick(toks, HOLE);
    expect(textOf(hole)).toBe('${count.value*2}');
    expect(hole.some((t) => has(t, 'keyword.operator'))).toBe(true);
    expect(hole.every((t) => !has(t, 'entity.name.tag'))).toBe(true);
  });

  /* Attribute holes are the reason this grammar parses tags itself. If these
     regress, `class=${x}` silently becomes a plain HTML string again — losing
     both the colouring and the completion that embeddedLanguages provides. */

  test('an UNQUOTED attribute hole is a hole', () => {
    const toks = tokenize('html`<b class=${cls}>x</b>`;');
    expect(textOf(pick(toks, HOLE))).toBe('${cls}');
    expect(textOf(pick(toks, 'entity.other.attribute-name'))).toContain('class');
  });

  test('a QUOTED attribute hole is a hole, and the quotes stay HTML', () => {
    const toks = tokenize('html`<b class="${cls}">x</b>`;');
    expect(textOf(pick(toks, HOLE))).toBe('${cls}');
    expect(pick(toks, 'punctuation.definition.string.begin')).not.toHaveLength(0);
    expect(pick(toks, 'punctuation.definition.string.end')).not.toHaveLength(0);
  });

  test('an event hole is a hole', () => {
    const toks = tokenize('html`<button onclick=${() => n++}>x</button>`;');
    expect(textOf(pick(toks, HOLE))).toContain('${()');
    expect(textOf(pick(toks, 'entity.other.attribute-name'))).toContain('onclick');
  });

  test('two attribute holes in one tag stay separate', () => {
    const toks = tokenize('html`<b class=${a} title=${b}>x</b>`;');
    const holes = pick(toks, HOLE);
    expect(textOf(holes)).toBe('${a}${b}');
    const names = textOf(pick(toks, 'entity.other.attribute-name'));
    expect(names).toContain('class');
    expect(names).toContain('title');
  });

  test('static attributes still read as attributes, not as values', () => {
    const toks = tokenize('html`<input disabled type=text>`;');
    const names = textOf(pick(toks, 'entity.other.attribute-name'));
    expect(names).toContain('disabled');
    expect(names).toContain('type');
    expect(textOf(pick(toks, 'string.unquoted'))).toContain('text');
  });

  test('a hole containing an object literal consumes its own closing brace', () => {
    // the classic injection bug: ending the hole at the first `}`
    const toks = tokenize('html`<p>${ {a:1} }</p>`;');
    expect(textOf(pick(toks, HOLE))).toBe('${{a:1}}');
    expect(textOf(pick(toks, EMBEDDED))).toContain('</p>'); // did not desync
  });

  test('the template ends at its own backtick, not a later one', () => {
    const toks = tokenize('const a = html`<p>x</p>`; const b = `plain`;');
    expect(textOf(pick(toks, EMBEDDED))).toBe('<p>x</p>');
  });

  test('an escaped backtick does not end the template', () => {
    const toks = tokenize('html`<p>a\\`b</p>`;');
    expect(pick(toks, 'constant.character.escape')[0].text).toBe('\\`');
    expect(textOf(pick(toks, EMBEDDED))).toContain('a\\`b');
  });

  test('a multi-line template stays embedded across lines', () => {
    const toks = tokenize(['html`<ul>', '  <li>${x}</li>', '</ul>`;'].join('\n'));
    const embedded = textOf(pick(toks, EMBEDDED));
    expect(embedded).toContain('<ul>');
    expect(embedded).toContain('</ul>');
    expect(textOf(pick(toks, HOLE))).toBe('${x}');
  });

  test('obj.html`` is NOT claimed — it is never ours', () => {
    const toks = tokenize('obj.html`<p>x</p>`;');
    expect(pick(toks, 'entity.name.function.tagged-template.amojs')).toHaveLength(0);
    expect(pick(toks, EMBEDDED)).toHaveLength(0);
  });

  test('a nested html`` inside a hole is highlighted too', () => {
    const toks = tokenize("html`<div>${cond ? html`<em>y</em>` : ''}</div>`;");
    expect(textOf(pick(toks, 'entity.name.tag'))).toContain('em');
  });

  test('code after the template is ordinary JavaScript again', () => {
    const toks = tokenize('const el = html`<p>x</p>`;\nconst n = 1 + 2;');
    const plus = toks.filter((t) => t.text === '+');
    expect(plus).not.toHaveLength(0);
    expect(plus.every((t) => !has(t, EMBEDDED))).toBe(true);
  });

  test('SVG in a template highlights, including a self-closed element', () => {
    // AmoJS supports foreign content, so the grammar must not choke on `/>`
    const toks = tokenize('html`<svg viewBox="0 0 2 2"><circle r="${n}"/></svg>`;');
    const tags = textOf(pick(toks, 'entity.name.tag'));
    expect(tags).toContain('svg');
    expect(tags).toContain('circle');
    expect(textOf(pick(toks, HOLE))).toBe('${n}');
    expect(textOf(pick(toks, 'entity.other.attribute-name'))).toContain('viewBox');
  });
});

test('the editor grammars needed by this suite were found', () => {
  // fails loudly rather than silently skipping everything above
  expect(editorBase, 'no VS Code / Cursor install found — grammar tests skipped').toBeTruthy();
});

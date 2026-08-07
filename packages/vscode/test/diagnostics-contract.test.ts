/**
 * Guards on the diagnostics layer.
 *
 * The extension is not the place to decide what a legal template is — that
 * belongs to the compiler, so that the editor and `amo build` can never
 * disagree. These tests enforce that boundary mechanically, because it is the
 * kind of rule that erodes one convenient exception at a time.
 *
 * They deliberately do NOT launch an editor. `diagnostics.ts` imports `vscode`,
 * which only exists inside the extension host, so what is checked here is the
 * source text plus the real behaviour of the compiler function it delegates to.
 */
import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnose } from '@amojs.dev/compiler/diagnose';

const HERE = import.meta.url.startsWith('file:')
  ? dirname(fileURLToPath(import.meta.url))
  : dirname(import.meta.url);

const read = (rel: string) => readFile(join(HERE, '..', rel), 'utf8');

test('diagnostics.ts delegates: it never decides what is legal itself', async () => {
  const src = await read('src/diagnostics.ts');

  // the one source of truth, imported through the narrow entry
  expect(src).toContain("from '@amojs.dev/compiler/diagnose'");

  // no second opinion about template syntax living here
  for (const smell of ['parseTemplate', 'unclosed', 'new RegExp', 'indexOf(\'<\')']) {
    expect(src, `diagnostics.ts should not contain ${smell}`).not.toContain(smell);
  }
});

test('the analysis import is the narrow entry, not the package root', async () => {
  const src = await read('src/diagnostics.ts');
  // the root pulls in build/eject — filesystem code an editor must not carry
  expect(src).not.toContain("from '@amojs.dev/compiler'");
});

test('stale problems cannot outlive a closed document', async () => {
  const src = await read('src/diagnostics.ts');
  expect(src).toContain('onDidCloseTextDocument');
  expect(src).toContain('collection.delete');
});

test('the extension activates on JS/TS files, not only on a command', async () => {
  // without onLanguage the extension sleeps until a command runs, and
  // diagnostics would never appear on their own
  const pkg = JSON.parse(await read('package.json')) as { activationEvents: string[] };
  expect(pkg.activationEvents).toContain('onLanguage:javascript');
  expect(pkg.activationEvents).toContain('onLanguage:typescript');
});

/* A few end-to-end checks of the function the extension actually calls, so a
   breaking change in the compiler shows up here and not in a bug report. */

test('the compiler entry reports a broken template and ignores a clean one', () => {
  const IMPORT = "import { html } from '@amojs.dev/core';\n";
  expect(diagnose(`${IMPORT}const el = html\`<p>hi</p>\`;`)).toEqual([]);

  const broken = diagnose(`${IMPORT}const el = html\`<div><p>hi</p>\`;`);
  expect(broken).toHaveLength(1);
  expect(broken[0].message).toBe('unclosed <div>');
  expect(broken[0].exact).toBe(true);
});

test('a file with no amojs import is left alone, and so is invalid JS', () => {
  expect(diagnose("import { html } from 'lit';\nconst el = html`<div>`;")).toEqual([]);
  expect(diagnose('function (((')).toEqual([]);
});

test('offsets fall inside the document, so positionAt can never throw', () => {
  const src = "import { html } from '@amojs.dev/core';\nconst el = html`<div><span>x</div>`;";
  for (const d of diagnose(src)) {
    expect(d.start).toBeGreaterThanOrEqual(0);
    expect(d.end).toBeGreaterThan(d.start); // never zero-width: nothing to see
    expect(d.end).toBeLessThanOrEqual(src.length);
  }
});

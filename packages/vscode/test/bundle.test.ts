/**
 * The built bundle, executed.
 *
 * 0.6.0 shipped a bundle that threw on activation, and every check before it
 * had been static: the vsix was listed, the bundle was grepped for stray
 * `require("…")` calls, the source was unit-tested. None of that runs the
 * artifact. The UMD build of a dependency calls `require` through a variable,
 * so the grep saw nothing and the extension host saw `Cannot find module`.
 *
 * So this test builds `dist/extension.js` exactly as `pnpm build:prod` does,
 * loads it in a separate node process with a stubbed `vscode` module (the
 * only thing a bundle may require besides node builtins), activates it, and
 * asks the completion provider it registered for a completion. If the bundle
 * cannot load, cannot activate, or cannot complete, this fails — before the
 * Marketplace does.
 */
import { test, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const HERE = import.meta.url.startsWith('file:')
  ? dirname(fileURLToPath(import.meta.url))
  : dirname(import.meta.url);
const PKG = join(HERE, '..');
const ROOT = join(PKG, '../..');
const BUNDLE = join(PKG, 'dist/extension.js');

beforeAll(() => {
  // the real build:prod line, read from package.json so the two cannot drift
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const args = pkg.scripts.build.replace(/^esbuild\s+/, '').split(/\s+/).concat('--minify', '--log-level=silent');
  execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), args, { cwd: PKG });
}, 60_000);

/** runs inside a child node: stub `vscode`, load the bundle, activate, complete */
const RUNNER = String.raw`
const Module = require('node:module');
const calls = [];
class Item { constructor(label, kind) { this.label = label; this.kind = kind; } }
class List { constructor(items, isIncomplete) { this.items = items; this.isIncomplete = isIncomplete; } }
const disposable = () => ({ dispose() {} });
let provider;
const vscode = {
  commands: { registerCommand: () => disposable() },
  languages: {
    createDiagnosticCollection: () => ({ set() {}, delete() {}, dispose() {} }),
    registerCompletionItemProvider: (sel, p) => { provider = p; calls.push('completion'); return disposable(); },
  },
  workspace: {
    textDocuments: [],
    onDidOpenTextDocument: () => disposable(),
    onDidChangeTextDocument: () => disposable(),
    onDidSaveTextDocument: () => disposable(),
    onDidCloseTextDocument: () => disposable(),
  },
  Disposable: class { constructor(fn) { this.dispose = fn; } },
  Range: class { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } },
  Diagnostic: class {}, DiagnosticSeverity: { Error: 0 },
  CompletionItem: Item, CompletionList: List,
  SnippetString: class { constructor(v) { this.value = v; } },
  MarkdownString: class { constructor(v) { this.value = v; } },
  TaskRevealKind: { Always: 1 }, TaskPanelKind: { Dedicated: 1 },
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode' : resolve.call(this, request, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscode };

const ext = require(process.env.AMOJS_BUNDLE);
ext.activate({ subscriptions: [] });

const src = "import { html } from '@amojs.dev/core';\ntype P = { t: string };\nexport default (p: P) => html\x60<main>\n  <di\n</main>\x60;\n";
const offset = src.indexOf('<di') + 3;
const lines = src.slice(0, offset).split('\n');
const position = { line: lines.length - 1, character: lines[lines.length - 1].length };
const doc = { getText: () => src, offsetAt: () => offset };
const list = provider.provideCompletionItems(doc, position);
const labels = list.items.map((i) => i.label);
console.log(JSON.stringify({ calls, items: labels.length, hasDiv: labels.includes('div'), ctor: list.constructor.name }));
`;

test('the built bundle loads, activates, and completes <di → div in a TypeScript file', () => {
  const out = execFileSync(process.execPath, ['-e', RUNNER], { encoding: 'utf8', env: { ...process.env, AMOJS_BUNDLE: BUNDLE } });
  const result = JSON.parse(out.trim().split('\n').pop()!) as { calls: string[]; items: number; hasDiv: boolean; ctor: string };
  expect(result.calls).toContain('completion');
  expect(result.hasDiv).toBe(true);
  expect(result.items).toBeGreaterThan(50);
  expect(result.ctor).toBe('List'); // the editor's own CompletionList class, not the LSP one
});

test('the bundle requires only node builtins and vscode — nothing left for the extension host to resolve', () => {
  const js = readFileSync(BUNDLE, 'utf8');
  const literal = [...js.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  const builtin = (n: string) => builtinModules.includes(n.replace(/^node:/, ''));
  for (const name of literal) expect(name === 'vscode' || builtin(name), name).toBe(true);
  // the 0.6.0 failure: a dependency's UMD wrapper loading its own modules at runtime
  expect(js).not.toContain('./parser/htmlScanner');
});

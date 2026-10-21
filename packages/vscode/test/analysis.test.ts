/**
 * analysis.ts — the two pure functions the editor glue calls.
 *
 * `analyzeText` must say exactly what the compiler's `diagnose` says on
 * JavaScript, and keep saying it on TypeScript, where `diagnose` is silent
 * because acorn cannot read the file. `completeAt` must offer HTML inside a
 * template's static text, nothing inside a hole, nothing outside.
 */
import { test, expect } from 'vitest';
import { diagnose } from '@amojs.dev/compiler/diagnose';
import { analyzeText, completeAt } from '../src/analysis.js';

const IMPORT = "import { html } from '@amojs.dev/core';\n";

const underlined = (src: string) =>
  analyzeText(src).map((d) => ({ message: d.message, text: src.slice(d.start, d.end), exact: d.exact }));

test('JavaScript: byte-for-byte what diagnose() reports', () => {
  for (const src of [
    `${IMPORT}const a = html\`<div><p>hi</p>\`;`,
    `${IMPORT}const a = html\`<div/>\`;`,
    `${IMPORT}const a = html\`<circle r=\${n}/>\`;`,
    `${IMPORT}const a = html\`<div \${x}></div>\`;`,
    `${IMPORT}const a = html\`<p>\\\`<div>\`;`, // escape → coarse range
    `${IMPORT}const a = html\`<p>fine</p>\`; const b = html\`<ul>\${xs.map((x) => html\`<li>\${x}\`)}</ul>\`;`,
    `${IMPORT}const a = html\`<p>ok</p>\`;`,
  ]) {
    expect(analyzeText(src)).toEqual(diagnose(src));
  }
});

test('TypeScript: the same error is found where diagnose() finds nothing', () => {
  const src = `${IMPORT}type P = { t: string };\nexport const x = (p: P): Node => html\`<div><p>\${p.t}</div>\`;`;
  expect(diagnose(src)).toEqual([]); // acorn cannot read the annotation
  expect(underlined(src)).toEqual([{ message: 'unexpected </div>', text: '</div>', exact: true }]);
});

test('a file that does not import amojs is left alone', () => {
  expect(analyzeText("import { html } from 'lit';\nconst a = html`<div>`;")).toEqual([]);
});

const labels = (src: string, marker: string) => {
  const at = src.indexOf(marker) + marker.length;
  return completeAt(src, at)?.items.map((i) => i.label) ?? undefined;
};

test('tag completion inside a template, in JavaScript and in TypeScript', () => {
  const js = `${IMPORT}const a = html\`<main><di</main>\`;`;
  expect(labels(js, '<main><di')).toContain('div');
  const ts = `${IMPORT}const a = (p: { t: string }): Node => html\`<main><di</main>\`;`;
  expect(labels(ts, '<main><di')).toContain('div');
});

test('attribute completion, and the closing tag', () => {
  const src = `${IMPORT}const a = html\`<div cl></div><p>\${x}</\`;`;
  expect(labels(src, '<div cl')).toContain('class');
  expect(labels(src, '${x}</')).toContain('/p');
});

test('nothing inside a hole, nothing outside a template, nothing in a foreign file', () => {
  const src = `${IMPORT}const a = html\`<p>\${co}</p>\`; const b = 1;`;
  expect(completeAt(src, src.indexOf('${co') + 4)).toBeUndefined(); // the JS service owns the hole
  expect(completeAt(src, src.indexOf('const b') + 3)).toBeUndefined();
  expect(completeAt("import { html } from 'lit';\nconst a = html`<di`;", 40)).toBeUndefined();
});

test('positions come back in the real document, so a textEdit lands inside the template', () => {
  const src = `${IMPORT}const a = html\`<section>\n  <di\n</section>\`;`;
  const at = src.indexOf('<di') + 3;
  const list = completeAt(src, at)!;
  const div = list.items.find((i) => i.label === 'div')!;
  expect(div.textEdit && 'range' in div.textEdit).toBe(true);
  const r = (div.textEdit as { range: { start: { line: number; character: number }; end: { line: number; character: number } } }).range;
  // line 2 of the document (0-based) is "  <di" — the edit replaces the `di`
  expect(r.start).toEqual({ line: 2, character: 3 });
  expect(r.end).toEqual({ line: 2, character: 5 });
});

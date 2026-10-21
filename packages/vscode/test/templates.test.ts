/**
 * The lexical template finder.
 *
 * Its contract is "the same ranges acorn would report, in files acorn cannot
 * read". So the first group checks it AGAINST the compiler's acorn-based
 * `detectTemplates` on JavaScript, and the second group checks the cases
 * that only exist because acorn is absent: TypeScript syntax, and the lexical
 * hazards (strings, comments, regexes) a parser handles for free.
 */
import { test, expect } from 'vitest';
import { detectTemplates } from '@amojs.dev/compiler';
import { cook, findTemplates, templateAt, templateTags } from '../src/templates.js';

const IMPORT = "import { html } from '@amojs.dev/core';\n";

/**
 * acorn's view, in the scanner's terms: acorn starts a template at its TAG and
 * reports the expression nodes bare; the scanner starts at the backtick and
 * reports each `${…}` with its braces — which is the span between two quasis.
 */
const acorn = (src: string) =>
  detectTemplates(src)
    .map((t) => ({
      start: t.quasis[0].start - 1,
      end: t.end,
      strings: t.strings,
      quasis: t.quasis,
      holes: t.quasis.slice(0, -1).map((q, i) => ({ start: q.end, end: t.quasis[i + 1].start })),
    }))
    .sort((a, b) => a.start - b.start);
const ours = (src: string) =>
  findTemplates(src)
    .map((t) => ({ start: t.start, end: t.end, strings: t.strings, quasis: t.quasis, holes: t.expressions }))
    .sort((a, b) => a.start - b.start);

const JS_FIXTURES = [
  `${IMPORT}const a = html\`<p>hi</p>\`;`,
  `${IMPORT}const a = html\`<p class=\${cls}>\${count} × \${double}</p>\`;`,
  `${IMPORT}const a = html\`<ul>\${items.map((i) => html\`<li>\${i}</li>\`)}</ul>\`;`,
  `${IMPORT}const a = html\`<p>\${cond ? html\`<b>y</b>\` : 'n'}</p>\`;`,
  `${IMPORT}const s = '\`'; const b = "\${not}"; // html\`<no>\`\n/* html\`<no>\` */\nconst a = html\`<p>ok</p>\`;`,
  `${IMPORT}const re = /\`\${/; const a = html\`<p>\${x}</p>\`;`,
  `${IMPORT}const n = a / b; const c = html\`<p>\${n / 2}</p>\`;`,
  `${IMPORT}const a = html\`<p>\${ { k: html\`<i>\${v}</i>\` }.k }</p>\`;`,
  `${IMPORT}const a = html\`<p>\\\`\\\${escaped}\\n</p>\`;`,
  `${IMPORT}const other = lit\`<p>\`; const a = html \`<p>\${x}</p>\`;`,
  `${IMPORT}const a = html\`<p>\n  multi\n  \${x}\n</p>\`;`,
  "import { html as h } from '@amojs.dev/core';\nconst a = h`<p>${x}</p>`; const b = html`<not-ours>`;",
  "import def, { html, signal } from '@amojs.dev/core';\nconst a = html`<p>${x}</p>`;",
  `${IMPORT}const a = obj.html\`<p>\`; const b = html\`<p>\${y}</p>\`;`,
];

test.each(JS_FIXTURES)('agrees with acorn on JavaScript: %s', (src) => {
  expect(ours(src)).toEqual(acorn(src));
  expect(ours(src).length).toBeGreaterThan(0);
});

test('a file that does not import amojs yields nothing', () => {
  expect(findTemplates("import { html } from 'lit';\nconst a = html`<p>`;")).toEqual([]);
  expect(findTemplates('const a = html`<p>`;')).toEqual([]);
  expect(templateTags("import { html } from '@amojs.dev/core/runtime';")).toEqual(new Set());
});

test('TypeScript: annotations, generics, interfaces and template-literal types do not break it', () => {
  const src = [
    IMPORT,
    'type Page = { title: string; content: Node };',
    'interface P { n?: number }',
    'type Route = `/${string}`;',
    'export const layout = ({ title, content }: Page): Node =>',
    '  html`<html><head><title>${title}</title></head><body>${content}</body></html>`;',
    'const f = <T,>(x: T): T => x;',
    'const g = (p: P) => html`<p class="${p.n ?? 0}">${f<string>("x")}</p>`;',
  ].join('\n');
  const found = findTemplates(src);
  expect(found).toHaveLength(2);
  expect(src.slice(found[0].start, found[0].end)).toBe('`<html><head><title>${title}</title></head><body>${content}</body></html>`');
  expect(found[0].strings).toEqual(['<html><head><title>', '</title></head><body>', '</body></html>']);
  expect(found[1].expressions).toHaveLength(2);
  // the generic call inside the hole, with its own quotes, is skipped as code
  expect(src.slice(found[1].expressions[1].start, found[1].expressions[1].end)).toBe('${f<string>("x")}');
});

test('an unterminated template (mid-typing) still reports a range to the end of the file', () => {
  const src = `${IMPORT}const a = html\`<di`;
  const [t] = findTemplates(src);
  expect(t.start).toBe(src.indexOf('`'));
  expect(t.end).toBe(src.length);
  expect(t.strings).toEqual(['<di']);
});

test('templateAt: innermost template wins, and holes are reported as holes', () => {
  const src = `${IMPORT}const a = html\`<ul>\${items.map((i) => html\`<li>\${i}</li>\`)}</ul>\`;`;
  const ts = findTemplates(src);
  const li = src.indexOf('<li>') + 2;
  expect(src.slice(templateAt(ts, li)!.template.start, templateAt(ts, li)!.template.end)).toBe('`<li>${i}</li>`');
  expect(templateAt(ts, li)!.inHole).toBe(false);
  const inner = src.indexOf('${i}') + 2;
  expect(templateAt(ts, inner)!.inHole).toBe(true);
  const mapCall = src.indexOf('items.map') + 3;
  expect(src.slice(templateAt(ts, mapCall)!.template.start).startsWith('`<ul>')).toBe(true);
  expect(templateAt(ts, mapCall)!.inHole).toBe(true);
  expect(templateAt(ts, 5)).toBeUndefined(); // in the import line
  expect(templateAt(ts, src.length)).toBeUndefined(); // after the closing backtick
});

test('cook: the escapes a template can carry', () => {
  expect(cook('plain')).toBe('plain');
  expect(cook('a\\`b\\${c}\\\\d')).toBe('a`b${c}\\d');
  expect(cook('x\\ny\\tz')).toBe('x\ny\tz');
  expect(cook('\\u00e9\\u{1F600}\\x41')).toBe('é😀A');
  expect(cook('line\\\ncont')).toBe('linecont');
  expect(cook('crlf\r\nhere')).toBe('crlf\nhere');
  expect(cook('bad\\u12')).toBe('bad\\u12'); // invalid escape → raw, like acorn's cooked ?? raw
});

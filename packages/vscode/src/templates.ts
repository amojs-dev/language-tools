/**
 * Where the templates are — found lexically, so TypeScript files work too.
 *
 * The compiler's `detectTemplates` uses acorn, which reads JavaScript only: on a
 * file with one type annotation it throws, and an editor built on it goes
 * silent for every `.ts` file. The editor needs the template RANGES in any
 * open file, and that is a lexical question — where each `html\`…\`` starts
 * and ends, and where its `${…}` holes are. This module answers only that.
 * Whether a template is LEGAL stays the compiler's call (`diagnoseTemplate`),
 * so the rule "the editor never decides what is valid" still holds: it decides
 * where to look, nothing more.
 *
 * Scope: the file must import `html` (or an alias of it) from
 * `@amojs.dev/core`; nothing is reported otherwise — someone else's `html\`\``
 * is not ours to judge. Strings, comments, regex literals and nested
 * templates are skipped the way a JS tokenizer would. The one heuristic is
 * `/` — regex or division is decided from the previous significant token,
 * the same rule every lexer without a parser uses.
 */

export interface FoundTemplate {
  /** offset of the opening backtick */
  start: number;
  /** one past the closing backtick */
  end: number;
  /** the static parts, COOKED — what the runtime's strings[] holds */
  strings: string[];
  /** source offsets of each static part, aligned index-for-index with `strings` */
  quasis: { start: number; end: number }[];
  /** source offsets of each `${…}`, braces included */
  expressions: { start: number; end: number }[];
}

const CORE = '@amojs.dev/core';

/** `html` and whatever it was imported as (`import { html as h }`). */
export function templateTags(source: string): Set<string> {
  const tags = new Set<string>();
  const re = /import\s*(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[3] !== CORE) continue;
    for (const spec of m[1].split(',')) {
      const parts = spec.trim().split(/\s+as\s+/);
      if (parts[0] === 'html') tags.add(parts[1] ?? 'html');
    }
  }
  return tags;
}

const IDENT = /[A-Za-z0-9_$]/;
/** after one of these a `/` starts a regex, not a division */
const KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

export function findTemplates(source: string): FoundTemplate[] {
  const tags = templateTags(source);
  const out: FoundTemplate[] = [];
  if (tags.size === 0) return out;

  /** the identifier ending right before `at` (whitespace allowed), or '' */
  function tagBefore(at: number): string {
    let i = at - 1;
    while (i >= 0 && /\s/.test(source[i])) i--;
    const end = i + 1;
    while (i >= 0 && IDENT.test(source[i])) i--;
    if (i >= 0 && source[i] === '.') return ''; // obj.html`` — never ours
    return source.slice(i + 1, end);
  }

  /** does a `/` at `at` open a regex literal? */
  function regexAllowed(at: number): boolean {
    let i = at - 1;
    while (i >= 0 && /\s/.test(source[i])) i--;
    if (i < 0) return true;
    const c = source[i];
    if (c === ')' || c === ']') return false;
    if (IDENT.test(c)) {
      let j = i;
      while (j >= 0 && IDENT.test(source[j])) j--;
      return KEYWORDS_BEFORE_REGEX.has(source.slice(j + 1, i + 1));
    }
    return true; // an operator, `(`, `,`, `{`, `}`, `;`, `:` …
  }

  function skipString(i: number, quote: string): number {
    i++;
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') i += 2;
      else if (c === quote || c === '\n') return i + 1;
      else i++;
    }
    return i;
  }

  function skipRegex(i: number): number {
    i++;
    let inClass = false;
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') i += 2;
      else if (c === '\n') return i;
      else if (inClass) {
        if (c === ']') inClass = false;
        i++;
      } else if (c === '[') {
        inClass = true;
        i++;
      } else if (c === '/') {
        i++;
        while (i < source.length && IDENT.test(source[i])) i++; // flags
        return i;
      } else i++;
    }
    return i;
  }

  /**
   * Scan code from `i`. With `untilBrace`, stop at the `}` that closes the
   * hole this call was entered from and return its index; otherwise run to
   * the end. Templates met along the way are recorded.
   */
  function scanCode(i: number, untilBrace: boolean): number {
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      const next = source[i + 1];
      if (c === '/' && next === '/') {
        while (i < source.length && source[i] !== '\n') i++;
      } else if (c === '/' && next === '*') {
        const close = source.indexOf('*/', i + 2);
        i = close === -1 ? source.length : close + 2;
      } else if (c === '"' || c === "'") {
        i = skipString(i, c);
      } else if (c === '`') {
        const tag = tagBefore(i);
        const t = scanTemplate(i);
        if (tags.has(tag)) out.push(t);
        i = t.end;
      } else if (c === '/') {
        i = regexAllowed(i) ? skipRegex(i) : i + 1;
      } else if (c === '{') {
        depth++;
        i++;
      } else if (c === '}') {
        if (untilBrace && depth === 0) return i;
        depth--;
        i++;
      } else i++;
    }
    return i;
  }

  /** the literal opening at `start`; always returns, even when unterminated */
  function scanTemplate(start: number): FoundTemplate {
    const t: FoundTemplate = { start, end: source.length, strings: [], quasis: [], expressions: [] };
    let i = start + 1;
    let quasiStart = i;
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') i += 2;
      else if (c === '`') {
        t.quasis.push({ start: quasiStart, end: i });
        t.end = i + 1;
        break;
      } else if (c === '$' && source[i + 1] === '{') {
        t.quasis.push({ start: quasiStart, end: i });
        const close = scanCode(i + 2, true);
        const exprEnd = close < source.length ? close + 1 : source.length;
        t.expressions.push({ start: i, end: exprEnd });
        i = exprEnd;
        quasiStart = i;
      } else i++;
    }
    if (t.quasis.length === t.expressions.length) t.quasis.push({ start: quasiStart, end: source.length }); // unterminated
    t.strings = t.quasis.map((q) => cook(source.slice(q.start, q.end)));
    return t;
  }

  scanCode(0, false);
  return out;
}

/**
 * The cooked value of a template's raw part — what `strings[]` holds at
 * runtime. An invalid escape (`\u` with no hex) leaves the cooked value
 * undefined in JS; the raw text is returned then, as the compiler's own
 * detector does.
 */
export function cook(raw: string): string {
  if (!raw.includes('\\') && !raw.includes('\r')) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\r') {
      out += '\n'; // template literals normalise CRLF and CR to LF
      if (raw[i + 1] === '\n') i++;
      continue;
    }
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = raw[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0':
        if (/[0-9]/.test(raw[i + 1] ?? '')) return raw; // legacy octal: invalid in templates
        out += '\0';
        break;
      case 'x': {
        const hex = raw.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) return raw;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2;
        break;
      }
      case 'u': {
        if (raw[i + 1] === '{') {
          const close = raw.indexOf('}', i + 2);
          const hex = close === -1 ? '' : raw.slice(i + 2, close);
          if (!/^[0-9a-fA-F]+$/.test(hex)) return raw;
          out += String.fromCodePoint(parseInt(hex, 16));
          i = close;
        } else {
          const hex = raw.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return raw;
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        }
        break;
      }
      case '\r':
        if (raw[i + 1] === '\n') i++; // line continuation
        break;
      case '\n':
      case ' ':
      case ' ':
        break; // line continuation
      case undefined:
        return raw;
      default:
        if (/[1-9]/.test(n)) return raw; // \1 … \9: invalid in templates
        out += n; // \` \$ \\ \' \" and any other identity escape
    }
  }
  return out;
}

/**
 * The innermost template containing `offset`, with whether the offset sits
 * inside one of its holes (where the JS service, not HTML, is the authority).
 */
export function templateAt(
  templates: FoundTemplate[],
  offset: number,
): { template: FoundTemplate; inHole: boolean } | undefined {
  let best: FoundTemplate | undefined;
  for (const t of templates) {
    if (offset > t.start && offset < t.end && (!best || t.start > best.start)) best = t;
  }
  if (!best) return undefined;
  const inHole = best.expressions.some((e) => offset > e.start && offset < e.end);
  return { template: best, inHole };
}

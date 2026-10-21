/**
 * The analysis — pure functions over the document text, no editor API.
 *
 * Two questions, both answered without `vscode`:
 *   - what is wrong with this file, and where (`analyzeText`) — every
 *     judgement comes from the compiler's `diagnoseTemplate`; this file only
 *     finds the templates, in JavaScript AND TypeScript (see `templates.ts`);
 *   - what could go here (`completeAt`) — HTML completion inside a template,
 *     from the same language service VS Code's own HTML support is built on.
 *
 * `diagnostics.ts` and `completion.ts` are the editor glue around these.
 */

import { diagnoseTemplate, type Diagnostic } from '@amojs.dev/compiler/diagnose';
import {
  getLanguageService,
  TextDocument,
  type CompletionList,
} from 'vscode-html-languageservice';
import { findTemplates, templateAt } from './templates.js';

export type { Diagnostic } from '@amojs.dev/compiler/diagnose';

/** Every template error in a module — one per broken template, as `diagnose()`. */
export function analyzeText(source: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const t of findTemplates(source)) {
    const d = diagnoseTemplate(source, t);
    if (d) out.push(d);
  }
  return out;
}

const html = getLanguageService();

/**
 * HTML completion at `offset`, or undefined when the offset is not inside a
 * template's static part (outside any template, or inside a `${…}` hole —
 * there the JS/TS service is the authority, and returning nothing lets it
 * speak).
 *
 * The trick that keeps this small: the HTML service sees a VIRTUAL document
 * that is the real one with everything outside the template, and every hole,
 * blanked to spaces — same length, same line breaks. Every position the
 * service reports is therefore already a position in the real document; no
 * mapping, nothing to get off by one.
 */
export function completeAt(source: string, offset: number): CompletionList | undefined {
  const hit = templateAt(findTemplates(source), offset);
  if (!hit || hit.inHole) return undefined;
  const { template } = hit;

  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let virtual = blank(source.slice(0, template.start + 1));
  let at = template.start + 1;
  for (let i = 0; i < template.quasis.length; i++) {
    const q = template.quasis[i];
    virtual += source.slice(q.start, q.end);
    at = q.end;
    const e = template.expressions[i];
    if (e) {
      virtual += blank(source.slice(e.start, e.end));
      at = e.end;
    }
  }
  virtual += blank(source.slice(at));

  const doc = TextDocument.create('amojs://template.html', 'html', 1, virtual);
  return html.doComplete(doc, doc.positionAt(offset), html.parseHTMLDocument(doc));
}

/**
 * Template diagnostics — the squiggle.
 *
 * All judgement about what is legal comes from `diagnose()` in @amojs.dev/compiler.
 * This file owns only editor concerns: when to run, which documents to run on,
 * and turning offsets into `vscode.Range`. If it ever starts deciding what
 * counts as an error, the editor and the build have begun to disagree.
 */

import * as vscode from 'vscode';
// the NARROW entry, not the package root: the root re-exports `build` and
// `eject`, which reach for the filesystem and use import.meta. An editor needs
// none of that, and bundling it dragged ~150KB of dead weight into the .vsix.
import { diagnose } from '@amojs.dev/compiler/diagnose';

/** Languages whose files can contain an AmoJS template. */
const LANGUAGES = new Set([
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
]);

/**
 * Wait this long after the last keystroke before re-analysing.
 *
 * Analysis is cheap, but a template is broken for most of the time it is being
 * typed — `<div` is invalid until the `>` arrives. Waiting keeps the squiggle
 * from flickering under the cursor while someone is mid-word.
 */
const DEBOUNCE_MS = 300;

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('amojs');
  context.subscriptions.push(collection);

  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (key: string): void => {
    const pending = timers.get(key);
    if (pending) {
      clearTimeout(pending);
      timers.delete(key);
    }
  };

  const refresh = (doc: vscode.TextDocument): void => {
    if (!LANGUAGES.has(doc.languageId)) return;
    collection.set(doc.uri, analyze(doc));
  };

  const schedule = (doc: vscode.TextDocument): void => {
    if (!LANGUAGES.has(doc.languageId)) return;
    const key = doc.uri.toString();
    cancel(key);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(doc);
      }, DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    // saving should feel immediate — no reason to wait out the debounce
    vscode.workspace.onDidSaveTextDocument((doc) => {
      cancel(doc.uri.toString());
      refresh(doc);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      cancel(doc.uri.toString());
      collection.delete(doc.uri); // stale problems must not outlive the file
    }),
    new vscode.Disposable(() => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    }),
  );

  // documents already open when the extension activates
  for (const doc of vscode.workspace.textDocuments) refresh(doc);
}

function analyze(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const text = doc.getText();

  let found;
  try {
    found = diagnose(text);
  } catch {
    /* diagnose() swallows unparseable input and returns [], so reaching here
       means a genuine bug in it. Reporting nothing is right: an editor that
       shows a crash as a code error would be blaming the wrong thing. */
    return [];
  }

  return found.map((d) => {
    const range = new vscode.Range(doc.positionAt(d.start), doc.positionAt(d.end));
    const diagnostic = new vscode.Diagnostic(
      range,
      // `exact: false` means an escape in the template made precise placement
      // impossible, so the range is the whole static part — say so rather than
      // let the width look like a claim about where the problem is
      d.exact ? d.message : `${d.message} (somewhere in this part)`,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = 'amojs';
    return diagnostic;
  });
}

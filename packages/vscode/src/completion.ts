/**
 * HTML completion inside templates — the editor glue.
 *
 * What to suggest comes from `completeAt()` in `analysis.ts`; this file only
 * registers the provider and converts LSP-shaped items into `vscode` ones.
 * The virtual document the service sees shares the real one's line layout,
 * so positions pass through unchanged.
 */

import * as vscode from 'vscode';
import { InsertTextFormat, type CompletionItem, type MarkupContent } from 'vscode-html-languageservice';
import { completeAt } from './analysis.js';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

/** the characters VS Code's own HTML support completes on */
const TRIGGERS = ['<', '/', '"', "'", '=', '.', ':'];

export function registerCompletion(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGES.map((language) => ({ language, scheme: '*' })),
      {
        provideCompletionItems(doc, position) {
          const list = completeAt(doc.getText(), doc.offsetAt(position));
          if (!list) return undefined;
          return new vscode.CompletionList(list.items.map(convert), list.isIncomplete);
        },
      },
      ...TRIGGERS,
    ),
  );
}

function convert(it: CompletionItem): vscode.CompletionItem {
  // LSP kinds are 1-based, vscode's enum is 0-based, same order
  const item = new vscode.CompletionItem(it.label, it.kind === undefined ? undefined : it.kind - 1);
  item.detail = it.detail;
  item.documentation = docs(it.documentation);
  item.sortText = it.sortText;
  item.filterText = it.filterText;

  let text = it.insertText ?? it.label;
  if (it.textEdit && 'range' in it.textEdit) {
    text = it.textEdit.newText;
    const r = it.textEdit.range;
    item.range = new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
  }
  item.insertText = it.insertTextFormat === InsertTextFormat.Snippet ? new vscode.SnippetString(text) : text;

  if (it.command) item.command = { title: it.command.title, command: it.command.command, arguments: it.command.arguments };
  return item;
}

function docs(d: string | MarkupContent | undefined): string | vscode.MarkdownString | undefined {
  if (!d) return undefined;
  if (typeof d === 'string') return d;
  return d.kind === 'markdown' ? new vscode.MarkdownString(d.value) : d.value;
}

/**
 * The AmoJS VS Code extension.
 *
 * Phase 1 is deliberately almost empty, and that is the design: the syntax
 * highlighting is a declarative TextMate injection (`syntaxes/`), the snippets
 * are JSON, and neither needs a line of code. What is left is the two CLI
 * commands.
 *
 * There is no language server here and there will not be one. An AmoJS file is
 * standard JavaScript, so hover, go-to-definition, rename and type-checking are
 * already provided by the built-in JS/TS support. The only gap is inside the
 * template string, and that gap is a pure function over the document — Phase 2
 * fills it by calling `diagnose()` from `amojs-compiler`.
 */

import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

type Mode = 'build' | 'eject';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('amojs.build', () => runCli('build')),
    vscode.commands.registerCommand('amojs.eject', () => runCli('eject')),
  );
}

export function deactivate(): void {
  /* nothing to tear down: no server, no watchers */
}

/**
 * Run `amo build` / `amo eject` as a VS Code Task.
 *
 * A Task rather than a raw terminal write, because tasks are what the editor
 * already knows how to show, re-run, and cancel — and a problem matcher can be
 * attached later without changing the call site.
 */
async function runCli(mode: Mode): Promise<void> {
  const folder = await pickFolder();
  if (!folder) return;

  const cfg = vscode.workspace.getConfiguration('amojs');
  const cli = (cfg.get<string>('cli.path') ?? 'amo').trim() || 'amo';
  const src = cfg.get<string>('build.srcDir') ?? 'src';
  const out =
    mode === 'build'
      ? (cfg.get<string>('build.outDir') ?? 'dist')
      : (cfg.get<string>('eject.outDir') ?? 'ejected');

  if (!existsSync(join(folder.uri.fsPath, src))) {
    const pick = await vscode.window.showWarningMessage(
      `AmoJS: "${src}" does not exist in ${folder.name}.`,
      'Open Settings',
    );
    if (pick === 'Open Settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'amojs.build.srcDir',
      );
    }
    return;
  }

  const args = [mode, quote(src), quote(out)];
  if (mode === 'eject') {
    const runtime = (cfg.get<string>('eject.runtimeDir') ?? '').trim();
    // only pass the flag when it differs from the CLI's own default, so the
    // command line stays the one a person would have typed
    if (runtime && runtime !== 'amo-runtime') args.push('--runtime', quote(runtime));
  }

  const task = new vscode.Task(
    { type: 'amojs', mode },
    folder,
    `amo ${mode}`,
    'amojs',
    // the CLI string may itself carry arguments ("pnpm amo"), so it is passed
    // through the shell rather than as a single executable name
    new vscode.ShellExecution(`${cli} ${args.join(' ')}`, { cwd: folder.uri.fsPath }),
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };

  await vscode.tasks.executeTask(task);
}

/** The folder to run in: the only one, the active file's, or ask. */
async function pickFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showErrorMessage('AmoJS: open a folder first.');
    return undefined;
  }
  if (folders.length === 1) return folders[0];

  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const owning = vscode.workspace.getWorkspaceFolder(active);
    if (owning) return owning;
  }
  return vscode.window.showWorkspaceFolderPick();
}

/** Quote only when needed, so the echoed command stays readable. */
function quote(value: string): string {
  return /[\s"']/.test(value) ? JSON.stringify(value) : value;
}

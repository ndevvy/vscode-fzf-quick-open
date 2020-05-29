"use strict";

import * as vscode from "vscode";
import * as path from "path";
import { systemDefaultPlatform } from "vscode-test/out/util";
let fzfTerminal: vscode.Terminal | undefined = undefined;
let fzfTerminalPwd: vscode.Terminal | undefined = undefined;

let codeCmd: string;
let findCmd: string;
let fzfCmd: string;
let initialCwd: string;
let rgCaseFlag: string;

export const TERMINAL_NAME = "fzf terminal";
export const TERMINAL_NAME_PWD = "fzf pwd terminal";

export enum rgoptions {
  CaseSensitive = "Case sensitive",
  IgnoreCase = "Ignore case",
  SmartCase = "Smart case",
}

export const rgflagmap = new Map<string, string>([
  [rgoptions.CaseSensitive, "--case-sensitive"],
  [rgoptions.IgnoreCase, "--ignore-case"],
  [rgoptions.SmartCase, "--smart-case"],
]);

function showFzfTerminal(
  name: string,
  fzfTerminal: vscode.Terminal | undefined
): vscode.Terminal {
  if (!fzfTerminal) {
    // Look for an existing terminal
    fzfTerminal = vscode.window.terminals.find((term) => {
      return term.name === name;
    });
  }
  if (!fzfTerminal) {
    // Create an fzf terminal
    if (!initialCwd && vscode.window.activeTextEditor) {
      initialCwd = path.dirname(
        vscode.window.activeTextEditor.document.fileName
      );
    }
    initialCwd = initialCwd || "";
    fzfTerminal = vscode.window.createTerminal({
      cwd: initialCwd,
      name: name,
    });
  }
  fzfTerminal.show();
  return fzfTerminal;
}

function moveToPwd(term: vscode.Terminal) {
  if (vscode.window.activeTextEditor) {
    let cwd = path.dirname(vscode.window.activeTextEditor.document.fileName);
    term.sendText(`cd ${cwd}`);
  }
}

function xargsCmd() {
  if (process.platform === "darwin") {
    return "xargs -0";
  } else {
    return "xargs -0 -r";
  }
}

function applyConfig() {
  codeCmd =
    (vscode.workspace
      .getConfiguration("fzf-quick-open")
      .get("codeCmd") as string) ?? "code";
  fzfCmd =
    (vscode.workspace
      .getConfiguration("fzf-quick-open")
      .get("fuzzyCmd") as string) ?? "fzf";
  findCmd = vscode.workspace
    .getConfiguration("fzf-quick-open")
    .get("findDirectoriesCmd") as string;
  initialCwd = vscode.workspace
    .getConfiguration("fzf-quick-open")
    .get("initialWorkingDirectory") as string;
  let rgopt = vscode.workspace
    .getConfiguration("fzf-quick-open")
    .get("ripgrepSearchStyle") as string;
  rgCaseFlag = rgflagmap.get(rgopt) ?? "Case sensitive";
}

export function activate(context: vscode.ExtensionContext) {
  applyConfig();
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("fzf-quick-open")) {
      applyConfig();
    }
  });
  let codeOpenFileCmd = `${fzfCmd} --print0 | ${xargsCmd()} ${codeCmd}`;
  let codeOpenFolderCmd = `${fzfCmd} --print0 | ${xargsCmd()} ${codeCmd} -a`;

  context.subscriptions.push(
    vscode.commands.registerCommand("fzf-quick-open.runFzfFile", () => {
      let term = showFzfTerminal(TERMINAL_NAME, fzfTerminal);
      term.sendText(codeOpenFileCmd, true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fzf-quick-open.runFzfFilePwd", () => {
      let term = showFzfTerminal(TERMINAL_NAME_PWD, fzfTerminalPwd);
      moveToPwd(term);
      term.sendText(codeOpenFileCmd, true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "fzf-quick-open.runFzfAddWorkspaceFolder",
      () => {
        let term = showFzfTerminal(TERMINAL_NAME, fzfTerminal);
        term.sendText(`${findCmd} | ${codeOpenFolderCmd}`, true);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "fzf-quick-open.runFzfAddWorkspaceFolderPwd",
      () => {
        let term = showFzfTerminal(TERMINAL_NAME_PWD, fzfTerminalPwd);
        moveToPwd(term);
        term.sendText(`${findCmd} | ${codeOpenFolderCmd}`, true);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fzf-quick-open.runFzfSearch", async () => {
      let pattern = await getSearchText();
      if (pattern === undefined) {
        return;
      }
      let term = showFzfTerminal(TERMINAL_NAME, fzfTerminal);
      term.sendText(makeSearchCmd(pattern, codeCmd), true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "fzf-quick-open.runFzfSearchPwd",
      async () => {
        let pattern = await getSearchText();
        if (pattern === undefined) {
          return;
        }
        let term = showFzfTerminal(TERMINAL_NAME_PWD, fzfTerminalPwd);
        moveToPwd(term);
        term.sendText(makeSearchCmd(pattern, codeCmd), true);
      }
    )
  );

  vscode.window.onDidCloseTerminal((terminal) => {
    switch (terminal.name) {
      case TERMINAL_NAME:
        fzfTerminal = undefined;
        break;

      case TERMINAL_NAME_PWD:
        fzfTerminalPwd = undefined;
        break;
    }
  });
}

async function getSearchText(): Promise<string | undefined> {
  let activeSelection = vscode.window.activeTextEditor?.selection;
  let value: string | undefined = undefined;

  if (activeSelection) {
    let activeRange: vscode.Range | undefined;
    if (activeSelection.isEmpty) {
      activeRange = vscode.window.activeTextEditor?.document.getWordRangeAtPosition(
        activeSelection.active
      );
    } else {
      activeRange = activeSelection;
    }
    value = activeRange
      ? vscode.window.activeTextEditor?.document.getText(activeRange)
      : undefined;
  }

  let pattern = await vscode.window.showInputBox({
    prompt: "Search pattern",
    value: value,
  });
  return pattern;
}

/**
 * Return the command used to invoke rg. Exported to allow unit testing.
 * @param pattern Pattern to search for
 * @param codeCmd Command used to launch code
 */
export function makeSearchCmd(pattern: string, codeCmd: string): string {
  pattern = pattern.replace("'", "\\'");
  return `rg '${pattern}' ${rgCaseFlag} --vimgrep --color ansi | ${fzfCmd} --ansi --print0 | gcut -z -d : -f 1-3 | ${xargsCmd()} ${codeCmd} -g`;
}

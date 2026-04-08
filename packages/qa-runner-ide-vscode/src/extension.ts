import * as vscode from "vscode";

async function sendQaEvent(): Promise<void> {
  const summary = await vscode.window.showInputBox({ prompt: "Summarize the change" });
  if (!summary) {
    return;
  }
  const payload = {
    files: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
    summary,
    tool: "vscode",
    timestamp: Date.now(),
  };

  try {
    await fetch("http://localhost:4545/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    vscode.window.showInformationMessage("QA Runner event sent.");
  } catch (error) {
    vscode.window.showErrorMessage("QA Runner daemon not reachable.");
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand("qaRunner.sendEvent", sendQaEvent));
}

export function deactivate() {}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    // Command to apply clipboard patch and stage and commit the file
    let disposableCommit = vscode.commands.registerCommand('extension.applyClipboardPatchAndCommit', async () => {
        await applyClipboardPatch(true);
    });

    // Command to apply clipboard patch and only stage the file
    let disposableStage = vscode.commands.registerCommand('extension.applyClipboardPatchAndStage', async () => {
        await applyClipboardPatch(false);
    });

    context.subscriptions.push(disposableCommit);
    context.subscriptions.push(disposableStage);
}

export function deactivate() {
    // Do nothing
}

async function applyClipboardPatch(commit: boolean) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found!');
        return;
    }

    try {
        const clipboardy = await import('clipboardy');
        const clipboardContent = await clipboardy.default.read();

        const lines = clipboardContent.split('\n');
        if (lines.length === 0 || !lines[0].startsWith('//#')) {
            vscode.window.showErrorMessage(' No metadata found.');
            return;
        }

        const metadataLine = lines[0].substring(3).trim(); // Remove the leading `//#` and trim whitespace
        let metadata: { filePath: string };

        try {
            metadata = JSON.parse(metadataLine);
        } catch (error) {
            vscode.window.showErrorMessage(' Failed to parse metadata: ' + error);
            return;
        }

        const code = lines.slice(1).join('\n'); // The rest is the code

        // Resolve the full path relative to the workspace root
        const workspaceRoot = vscode.workspace.rootPath || '';
        const fullPath = path.resolve(workspaceRoot, metadata.filePath);

          // Check if the file already exists
        if (fs.existsSync(fullPath)) {
            const existingContent = fs.readFileSync(fullPath, 'utf8');
            if (existingContent === code) {
                vscode.window.showInformationMessage(` No changes detected.`);
                const document = await vscode.workspace.openTextDocument(fullPath);
                await vscode.window.showTextDocument(document);
                return;
            }
        }

        // Ensure the directory exists
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });

        // Write or update the code in the specified file, replacing existing content
        fs.writeFileSync(fullPath, code, 'utf8');

        // Stage the file
        exec(`git add ${fullPath}`, { cwd: workspaceRoot }, (err) => {
            if (err) {
                vscode.window.showErrorMessage(` Failed to stage file: ${err.message}`);
                return;
            }
            if (commit) {
                const commitMessage = ` Comitted ${metadata.filePath}`;
                exec(`git commit -m "${commitMessage}"`, { cwd: workspaceRoot }, (err) => {
                    if (err) {
                        vscode.window.showErrorMessage(`Failed to commit file: ${err.message}`);
                        return;
                    }
                    vscode.window.showInformationMessage(`${metadata.filePath} committed!`);
                });
            } else {
                vscode.window.showInformationMessage(`${metadata.filePath} staged!`);
            }
        });

        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document);

    } catch (error) {
        vscode.window.showErrorMessage('Failed to import code from clipboard: ' + error);
    }
}
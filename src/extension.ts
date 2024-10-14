import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';
import clipboardy from 'clipboardy';

const METADATA_PREFIX = '//#';
const MAX_CLIPBOARD_READ_RETRIES = 3;
const CLIPBOARD_RETRY_DELAY_MS = 1000;

function handleErrorMessage(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`${context}: ${message}`);
    console.error(`${context}:`, message);
}

async function retryClipboardRead(): Promise<string | null> {
    let clipboardContent: string | null = null;
    for (let attempt = 0; attempt < MAX_CLIPBOARD_READ_RETRIES; attempt++) {
        try {
            clipboardContent = await clipboardy.read();
            break;
        } catch (error) {
            if (attempt < MAX_CLIPBOARD_READ_RETRIES - 1) {
                vscode.window.showWarningMessage(`Failed to read from clipboard (attempt ${attempt + 1}/${MAX_CLIPBOARD_READ_RETRIES}). Retrying in ${CLIPBOARD_RETRY_DELAY_MS / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, CLIPBOARD_RETRY_DELAY_MS));
            } else {
                handleErrorMessage(error, 'Failed to read from clipboard after multiple attempts');
                return null;
            }
        }
    }
    return clipboardContent;
}

export function activate(context: vscode.ExtensionContext) {
    // Register commands to apply clipboard patch and handle commit or staging
    let disposableCommit = vscode.commands.registerCommand('extension.applyClipboardPatchAndCommit', async () => {
        await handleApplyClipboardPatch(true);
    });

    let disposableStage = vscode.commands.registerCommand('extension.applyClipboardPatchAndStage', async () => {
        await handleApplyClipboardPatch(false);
    });

    context.subscriptions.push(disposableCommit);
    context.subscriptions.push(disposableStage);
}

export function deactivate() {
    // Do nothing
}

async function handleApplyClipboardPatch(commit: boolean) {
    await applyClipboardPatch({ commit });
}

async function applyClipboardPatch(options: { commit: boolean }) {
    const clipboardContent = await retryClipboardRead();
    if (!clipboardContent) return;

    try {
        const metadata = parseClipboardContent(clipboardContent);
        if (!metadata) return;

        const workspaceRoot = await getWorkspaceRoot();
        if (!workspaceRoot) return;

        const fullPath = path.resolve(workspaceRoot, metadata.filePath);
        await ensureDirectoryExists(fullPath);

        const fileContent = await getFileContent(fullPath);
        if (fileContent === null) return;

        if (metadata.type === "diff") {
            await applyDiff(fullPath, fileContent, clipboardContent);
        } else {
            await writeCompleteFile(fullPath, fileContent, clipboardContent);
        }

        await stageAndCommitFile(fullPath, workspaceRoot, metadata.filePath, options.commit);
        await openFileInEditor(fullPath);

    } catch (error: unknown) {
        handleErrorMessage(error, 'Failed to import code from clipboard');
    }
}

function parseClipboardContent(clipboardContent: string): { filePath: string, type?: string } | null {
    const lines = clipboardContent.split(os.EOL);
    if (lines.length === 0 || !lines[0].startsWith(METADATA_PREFIX)) {
        vscode.window.showErrorMessage('Clipboard content does not contain valid metadata. Expected metadata to start with //# followed by a valid JSON object.');
        return null;
    }

    const metadataLine = lines[0].substring(METADATA_PREFIX.length).trim();
    try {
        return JSON.parse(metadataLine);
    } catch (error: unknown) {
        handleErrorMessage(error, 'Failed to parse metadata');
        return null;
    }
}

async function getWorkspaceRoot(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return null;
    }

    return workspaceFolders.length === 1 ? workspaceFolders[0].uri.fsPath : await selectWorkspaceFolder(workspaceFolders);
}

async function ensureDirectoryExists(fullPath: string): Promise<void> {
    try {
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    } catch (error) {
        handleErrorMessage(error, 'Failed to create directory');
        throw error;
    }
}

async function getFileContent(fullPath: string): Promise<string> {
    try {
        await fs.promises.access(fullPath, fs.constants.F_OK);
        return await fs.promises.readFile(fullPath, 'utf8');
    } catch (error) {
        if (error instanceof Error && (error as any).code === 'ENOENT') {
            return '';
        }
        handleErrorMessage(error, 'Failed to read file');
        throw error;
    }
}

async function applyDiff(fullPath: string, fileContent: string, clipboardContent: string) {
    const lines = clipboardContent.split(os.EOL);
    const fileLines = fileContent.split(os.EOL);

    processDiffLines(lines, fileLines);

    try {
        await fs.promises.writeFile(fullPath, fileLines.join(os.EOL), 'utf8');
    } catch (error) {
        handleErrorMessage(error, 'Failed to write updated content to file');
        throw error;
    }
}

function processDiffLines(lines: string[], fileLines: string[]) {
    let inDiffBlock = false;
    // `currentLineNumber` keeps track of the current line number in the file that is being modified.
    // It is updated based on the parsed diff information and helps in inserting, deleting, or modifying lines.
    let currentLineNumber = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('@@')) {
            const match = RegExp(/@@ -\d+,\d+ \+(\d+),\d+ @@/).exec(line);
            if (match) {
                // Set `currentLineNumber` to the starting line number from the diff header, adjusting to 0-based index.
                currentLineNumber = parseInt(match[1]) - 1;
                inDiffBlock = true;
            }
        } else if (inDiffBlock) {
            if (line.startsWith('+')) {
                // Insert the new line at `currentLineNumber` and then increment `currentLineNumber`.
                fileLines.splice(currentLineNumber, 0, line.substring(1));
                currentLineNumber++;
            } else if (line.startsWith('-')) {
                // Remove the line at `currentLineNumber` without incrementing it.
                fileLines.splice(currentLineNumber, 1);
            } else {
                // No change, simply move to the next line.
                currentLineNumber++;
            }
        }
    }
}

async function writeCompleteFile(fullPath: string, fileContent: string, clipboardContent: string) {
    const code = clipboardContent.split(os.EOL).slice(1).join(os.EOL);
    if (fileContent === code) {
        vscode.window.showInformationMessage(`No changes detected.`);
    } else {
        try {
            await fs.promises.writeFile(fullPath, code, 'utf8');
        } catch (error) {
            handleErrorMessage(error, 'Failed to write complete file');
            throw error;
        }
    }
}

async function stageAndCommitFile(fullPath: string, workspaceRoot: string, filePath: string, commit: boolean) {
    const git = simpleGit(workspaceRoot);
    try {
        await git.add(fullPath);
        if (commit) {
            const commitMessage = await vscode.window.showInputBox({
                prompt: 'Enter a commit message',
                value: `Automated commit: Update ${filePath}`
            }) ?? `Automated commit: Update ${filePath}`;
            await git.commit(commitMessage);
            vscode.window.showInformationMessage(`File ${filePath} successfully committed.`);
        } else {
            vscode.window.showInformationMessage(`File ${filePath} successfully staged.`);
        }
    } catch (err) {
        handleErrorMessage(err, 'Failed to stage or commit file');
        throw err;
    }
}

async function openFileInEditor(fullPath: string) {
    try {
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        handleErrorMessage(error, 'Failed to open file in editor');
        throw error;
    }
}

async function selectWorkspaceFolder(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<string | null> {
    const folderNames = workspaceFolders.map(folder => `${folder.name} (${folder.uri.fsPath}) [${folder.index}]`);
    const selectedFolder = await vscode.window.showQuickPick(folderNames, {
        placeHolder: 'Select a workspace folder to use',
    });

    if (selectedFolder) {
        const selected = workspaceFolders.find(folder => `${folder.name} (${folder.uri.fsPath}) [${folder.index}]` === selectedFolder);
        return selected?.uri.fsPath ?? null;
    }
    return null;
}


# Clipboard Patch VSCode Extension

## Overview

This VSCode extension allows you to apply patches from the clipboard directly to your workspace files. It supports both staging and committing the changes with Git integration, making it convenient to quickly apply updates and manage your codebase.

## Features
- **Apply Clipboard Patch and Commit**: Reads the patch content from the clipboard, applies the changes to the specified file, stages the changes, and creates a Git commit.
- **Apply Clipboard Patch and Stage**: Similar to the above command, but only stages the changes without committing.
- **Supports Diff Patches**: Can apply diff-style patches that include line modifications, additions, or deletions.

## Commands

- `Apply Clipboard Patch and Commit`: Apply the patch from the clipboard and commit the changes.
- `Apply Clipboard Patch and Stage`: Apply the patch from the clipboard and stage the changes for a future commit.

## How It Works
The extension reads from the system clipboard, looking for metadata in the following format:

```plaintext
//# { "filePath": "path/to/file", "type": "diff" }
<patch or code content here>
```

- **filePath**: The relative path to the file where the changes should be applied.
- **type**: Indicates if the patch is a "diff". If not provided, the content is treated as a full file replacement.

## Installation
1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to compile the TypeScript code.
4. Open this folder in VSCode.
5. Press `F5` to start a new VSCode instance with the extension enabled.

## Usage
1. Copy patch content to the clipboard in the expected format.
2. Use the command palette (`Cmd/Ctrl + Shift + P`) to select one of the extension commands:
   - `Apply Clipboard Patch and Commit`
   - `Apply Clipboard Patch and Stage`
3. The extension will automatically parse the metadata and apply the patch accordingly.

## Error Handling
- If the clipboard does not contain valid metadata, an error will be shown to explain the expected format.
- Errors encountered during directory creation, file access, or Git commands are logged to both the VSCode error message and the console for debugging.

## Requirements
- Git must be installed and accessible from your terminal.
- Node.js environment to build the extension.

## Development
### Structure
- `src/extension.ts`: The main file containing all logic for clipboard handling, Git integration, and file updates.
- `handleErrorMessage()`: A utility function to log and show error messages.
- `retryClipboardRead()`: Implements retry logic to read from the clipboard in case of temporary failures.

### Running the Extension in Development Mode
1. Open the folder in VSCode.
2. Press `F5` to launch an Extension Development Host.

### Building the Project
```bash
npm run build
```

## Contribution
Feel free to submit issues or pull requests. Contributions are always welcome to make this extension better!

## License
This project is licensed under the MIT License.


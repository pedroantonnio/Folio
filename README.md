# Folio

Folio is a Manifest V3 Chrome extension that turns ChatGPT into a local, read-only file agent.

It lets ChatGPT inspect a user-authorized local folder through visible tool calls, while keeping the user in control of what folder is connected and when Folio is active.

Folio currently targets `https://chatgpt.com/*`.

## What Folio does

Folio adds a small control directly to the ChatGPT composer. From that control, you can activate or pause Folio for the current conversation and select or change the local workspace folder.

When active, Folio allows ChatGPT to request local file operations such as listing folders, reading text files, searching filenames, grepping file contents, getting file metadata, and attaching selected files to ChatGPT as uploads.

Folio is read-only. It does not write, edit, delete, rename, move, or execute local files.

## Current version

Current release: `v0.3.2`

### Highlights

- Folio composer control is always visible while the extension is installed.
- New chats start as **Paused** by default.
- Active/Paused state is scoped to the current conversation only.
- Conversation state is stored by SHA-256 hash of the canonical conversation URL.
- Workspace selection happens from the Folio dropdown in the ChatGPT composer.
- The popup is reserved for advanced settings.
- Folio does not use rendered chat history as memory for activation or bootstrap state.
- Folder access is explicitly granted by the user through the browser's native directory picker.

## Available tools

Folio exposes these tools to ChatGPT through visible tool calls:

| Tool | Purpose |
| --- | --- |
| `list_files` | Lists files and folders inside the authorized workspace. |
| `read_file` | Reads textual content from a specific file. |
| `search_files` | Searches file and folder names/paths. |
| `grep_files` | Searches text content inside non-sensitive text files. |
| `get_file_info` | Returns metadata for one file, including kind, size, sensitivity, and recommended delivery. |
| `attach_file` | Attaches a local file to ChatGPT as an upload, after user confirmation. |

## How activation works

Folio is not a global always-on agent. The extension is always available, but each conversation has its own state.

### Paused

When a conversation is **Paused**:

- Folio does not intercept user messages.
- Folio does not inject bootstrap instructions.
- Folio does not inject reminder instructions.
- Folio does not execute tool calls.
- Folio does not send tool results.
- The Folio button remains visible in the composer.

New chats start as **Paused** by default.

### Active

When a conversation is **Active**:

- Folio intercepts the user's message.
- If the conversation has not been bootstrapped in extension storage, Folio sends bootstrap instructions with the user's request.
- If the conversation has already been bootstrapped, Folio sends the user's request normally.
- Folio sends reminder instructions after configured message/token thresholds.
- Folio detects visible `TOOL_CALL` blocks in assistant responses.
- Folio executes the requested local tool.
- Folio sends the result back to ChatGPT as a visible `TOOL_RESULT` block.

### Running

When Folio is **Running**, the agent is in a tool-call loop. The dropdown includes a stop action so the current run can be interrupted.

## Workspace selection

Workspace selection is done from the Folio dropdown in the ChatGPT composer.

1. Open `https://chatgpt.com`.
2. Click the Folio control in the composer.
3. Choose **Select folder** or **Change folder**.
4. Pick a local folder in the browser's native directory picker.
5. Confirm the browser permission prompt.
6. Set the current conversation to **Active** when you want Folio to operate on that chat.

The popup no longer selects the workspace. It remains available for advanced settings.

## Advanced settings

The extension popup is used for configuration, including:

- Read size limits.
- Search result limits.
- Grep result limits.
- Attachment size limits.
- Sensitive filename patterns.
- Sensitive content patterns.
- Reminder thresholds.

## Security model

Folio is designed around explicit user control.

- Folio only accesses the folder selected by the user.
- Folio does not access files outside the authorized workspace.
- Absolute paths are rejected.
- `../` traversal is rejected.
- Folio is read-only.
- Folio does not execute shell commands.
- Folio does not run code from the workspace.
- Sensitive text files require confirmation before content is sent.
- Sensitive values can be masked before sending.
- `attach_file` requires confirmation before upload.
- Large reads, searches, and attachments are limited by settings.

File contents are treated as untrusted data. Instructions found inside local files, comments, logs, README files, dependencies, or generated output should not override user intent or Folio's protocol rules.

## Tool protocol

Folio detects tool calls only when they appear visibly in the assistant's response.

Example:

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: list_files
path: .
%%END_LOCAL_AGENT_TOOL_CALL%%
```

Folio returns results as visible user messages:

```text
%%LOCAL_AGENT_TOOL_RESULT%%
tool: list_files
path: .
status: success
content:
...
%%END_LOCAL_AGENT_TOOL_RESULT%%
```

Supported result statuses:

- `success`
- `success_masked`
- `denied`
- `error`

## Installation

Folio is currently installed as an unpacked Chrome extension.

1. Download the release ZIP.
2. Extract the ZIP.
3. Open Chrome.
4. Go to `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the extracted `folio-extension` folder.
8. Open `https://chatgpt.com`.
9. Use the Folio dropdown in the composer to select a local workspace folder.
10. Set a conversation to **Active** when you want Folio to operate on that chat.

## Project status

Folio is an early local-agent prototype.

The current implementation focuses on:

- ChatGPT web integration.
- Read-only local file access.
- Explicit user-granted workspace access.
- Per-conversation activation.
- Visible tool-call protocol.
- Safe file reading, searching, and attachment.

Future adapters may support other web AI interfaces using the same per-URL state model.

## Changelog

### v0.3.2

- Workspace selection now happens only from the Folio dropdown in the ChatGPT composer.
- Removed folder selection from the extension popup.
- Added an extension-origin workspace picker window so the selected folder handle is saved in the same origin used by the offscreen file executor.
- Added explicit offscreen workspace refresh after folder selection.
- Updated workspace permission error messages to point users back to the Folio dropdown.

### v0.2.0

- Added `search_files`.
- Added `grep_files`.
- Added `get_file_info`.
- Added `attach_file`.
- Added support for file attachment delivery.
- Added configurable limits for search, grep, and attachments.

### v0.1.0

- Initial read-only local file agent prototype.
- Added `list_files`.
- Added `read_file`.
- Added visible tool-call/tool-result protocol.
- Added sensitive-file confirmation flow.
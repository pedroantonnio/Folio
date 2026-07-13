# Folio

Folio is a Manifest V3 Chrome extension that turns `chatgpt.com` into a local file agent through visible tool calls.

## v0.3.4

This release improves the conversation UI while preserving the visible tool-call protocol internally:

- Folio now hides technical `TOOL_CALL`, `TOOL_RESULT`, and system notice turns by default.
- Hidden technical turns are re-hidden after page reloads and when old conversations are reopened.
- A `Folio engine...` status row appears while the local agent loop is running.
- The engine status alternates through the Folio icon set every two seconds.
- The final ChatGPT answer remains visible normally.
- The Folio dropdown includes a Show/Hide technical messages action for debugging.

## Current tools

- `list_files`
- `read_file`
- `search_files`
- `grep_files`
- `get_file_info`
- `attach_file`

## Behavior

When a conversation is **Paused**:

- Folio does not intercept messages.
- Folio does not inject bootstrap/reminder instructions.
- Folio does not execute tool calls.
- The composer button remains visible.

When a conversation is **Active**:

- Folio intercepts the user's message.
- If the conversation has not been bootstrapped in extension storage, Folio sends the bootstrap plus the user request.
- If already bootstrapped, Folio sends the user request normally.
- Folio sends reminders after configured message/token thresholds.
- Folio executes visible `TOOL_CALL` blocks using the workspace selected for that chat.
- Folio returns `TOOL_RESULT` blocks.
- Folio hides the technical protocol turns from the ChatGPT UI by default.
- Folio shows `Folio engine...` while the tool loop is running.

## Workspace selection

Workspace selection happens from the Folio dropdown inside the ChatGPT composer.

Each conversation can have its own workspace:

- Chat A can use `/project-a`.
- Chat B can use `/project-b`.
- Chat C can use `/client-site`.

The popup no longer selects folders. It remains for advanced settings.

## Technical messages

Folio still uses visible protocol messages internally because ChatGPT web does not expose a native local tool API to the extension.

By default, Folio hides these protocol turns from the UI:

- `%%LOCAL_AGENT_TOOL_CALL%%`
- `%%LOCAL_AGENT_TOOL_RESULT%%`
- `%%LOCAL_AGENT_SYSTEM_NOTICE%%`

They remain in the conversation context so the agent loop continues to work. The dropdown can temporarily show them again for debugging.

Bootstrap and reminder prompts are not hidden yet because they are sent together with the user's real request.

## Install locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this `folio-extension` folder.
6. Open `https://chatgpt.com`.
7. Use the Folio dropdown in ChatGPT's composer to select a local folder for the current chat.
8. Use the Folio dropdown to set the current chat to **Active**.

## Security model

- Folio only accesses folders explicitly selected by the user.
- A selected folder is associated with a specific conversation state.
- Folio does not write, delete, rename, or modify local files.
- Folio rejects absolute paths and `../` traversal.
- Sensitive text files require confirmation before sending.
- `attach_file` always requires confirmation before upload.
- File contents are treated as untrusted data.

# Folio

Folio is a Manifest V3 Chrome extension that turns `chatgpt.com` into a local file agent.

## v0.2.0

This version supports:

- `list_files` — list files and folders.
- `read_file` — read text/code files into the chat.
- `search_files` — search file and folder names/paths.
- `grep_files` — search text content inside non-sensitive text files.
- `get_file_info` — inspect type, size, sensitivity, and recommended delivery.
- `attach_file` — attach a local file to ChatGPT as an upload after user confirmation.

Bootstrap is sent once per ChatGPT conversation. Short reminders are configurable in the popup.

## Install locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this `folio-extension` folder.
6. Open `https://chatgpt.com`.
7. Open Folio from the extension icon.
8. Click **Select** and choose a local folder.
9. Turn Folio on.
10. Type your prompt directly into ChatGPT.

## Protocol examples

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: search_files
query: login
path: .
%%END_LOCAL_AGENT_TOOL_CALL%%
```

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: grep_files
query: DATABASE_URL
path: .
%%END_LOCAL_AGENT_TOOL_CALL%%
```

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: get_file_info
path: images/diagram.png
%%END_LOCAL_AGENT_TOOL_CALL%%
```

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: attach_file
path: images/diagram.png
%%END_LOCAL_AGENT_TOOL_CALL%%
```

## Security model

- Folio only accesses the folder selected by the user.
- Absolute paths and `../` are rejected.
- Writes, deletes, renames, terminal commands, and Git operations are not implemented.
- Sensitive text files require approval before content is sent.
- `attach_file` always asks before attaching a local file to ChatGPT.
- `grep_files` does not expose matching lines from files that appear sensitive.
- Large files and result counts are limited by settings.

## ChatGPT selectors

Folio currently targets the observed ChatGPT DOM:

- Composer: `div#prompt-textarea[contenteditable="true"]`
- Send button: `button[data-testid="send-button"]`
- Stop button: `button[data-testid="stop-button"]`
- File input: `input#upload-files[type="file"]`
- Assistant turns: `section[data-turn="assistant"]`

ChatGPT can change its frontend at any time, so these selectors may need adjustment later.

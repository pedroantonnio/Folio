# Folio

**Folio** is a minimal Chrome extension that turns ChatGPT into a local read-only file agent.

It lets ChatGPT inspect a user-selected local folder through a controlled tool protocol, allowing the model to list files and read file contents during a normal chat conversation.

Folio is experimental and currently focused on `chatgpt.com`.

---

## What Folio Does

Folio allows ChatGPT to work with a local folder selected by the user.

Once enabled, ChatGPT can request local read-only actions by writing visible tool calls in the conversation. Folio detects those calls, executes them locally inside the authorized folder, and sends the result back into the chat.

The current version supports:

* Listing files and folders
* Reading file contents
* Looping through multiple tool calls
* Asking for explicit permission before sending sensitive files
* Sending masked versions of sensitive files
* Configurable limits
* Per-conversation bootstrap instructions
* Reminder instructions after configurable message/token thresholds

---

## What Folio Does Not Do

Folio is intentionally limited in its first version.

It does **not**:

* Edit files
* Create files
* Delete files
* Run terminal commands
* Access folders the user did not select
* Give ChatGPT direct access to the computer
* Hide tool calls from the chat
* Work with all AI websites yet

Folio is currently a read-only local bridge for ChatGPT.

---

## Why Folio Exists

Modern AI coding tools such as Cursor, Claude Code, Codex-style agents, and other agentic IDEs can inspect project files and reason over them.

Folio explores a lighter approach:

> What if any normal ChatGPT conversation could safely inspect a local folder, without requiring a custom IDE?

Instead of building a new chat interface, Folio uses the existing ChatGPT web UI and adds a local tool bridge through a Chrome extension.

---

## How It Works

Folio uses a simple visible tool-call protocol.

When enabled, the extension injects an initial instruction into a ChatGPT conversation. This instruction explains that ChatGPT can ask Folio to execute read-only tools.

For example, ChatGPT may respond with:

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: list_files
path: .
%%END_LOCAL_AGENT_TOOL_CALL%%
```

Folio detects the tool call, lists files in the selected local folder, and sends the result back into the chat:

```text
%%LOCAL_AGENT_TOOL_RESULT%%
tool: list_files
path: .
status: success
content:
package.json
src/
README.md
.env [sensitive]
%%END_LOCAL_AGENT_TOOL_RESULT%%
```

ChatGPT can then continue requesting files:

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: read_file
path: package.json
%%END_LOCAL_AGENT_TOOL_CALL%%
```

When ChatGPT responds without a tool call, Folio treats that response as the final answer to the user.

---

## Supported Tools

### `list_files`

Lists files and folders inside the selected local workspace.

Example:

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: list_files
path: .
%%END_LOCAL_AGENT_TOOL_CALL%%
```

### `read_file`

Reads the contents of a specific file inside the selected local workspace.

Example:

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: read_file
path: src/main.ts
%%END_LOCAL_AGENT_TOOL_CALL%%
```

---

## Sensitive File Handling

Folio does not silently block sensitive files.

Instead, it asks for explicit user approval every time a sensitive file is requested.

Examples of sensitive files include:

* `.env`
* `.env.*`
* `*.pem`
* `*.key`
* `*.p12`
* `*.pfx`
* `id_rsa`
* `id_ed25519`
* `credentials.json`
* `secrets.json`
* `.npmrc`
* `.pypirc`
* `.netrc`

Folio may also detect sensitive-looking content such as:

* `API_KEY`
* `SECRET`
* `TOKEN`
* `PASSWORD`
* `PRIVATE_KEY`
* `DATABASE_URL`
* `AWS_ACCESS_KEY_ID`
* `BEGIN PRIVATE KEY`

When a sensitive file is requested, the user can choose:

* Send full content once
* Send a masked version
* Deny the request

Approval is never permanent. Folio asks again every time.

---

## Installation

This project is currently intended for local development and manual installation.

1. Clone this repository:

```bash
git clone https://github.com/pedroantonnio/Folio.git
cd folio
```

2. Open Chrome and go to:

```text
chrome://extensions
```

3. Enable **Developer mode**.

4. Click **Load unpacked**.

5. Select the extension folder.

6. Open:

```text
https://chatgpt.com
```

7. Open the Folio popup.

8. Select a local folder.

9. Enable Folio.

10. Start chatting normally with ChatGPT.

---

## Usage Example

User writes in ChatGPT:

```text
Analyze this project and tell me why the build is failing.
```

Folio sends the initial agent instruction only if the current conversation has not been initialized yet.

ChatGPT may respond:

```text
%%LOCAL_AGENT_TOOL_CALL%%
tool: list_files
path: .
%%END_LOCAL_AGENT_TOOL_CALL%%
```

Folio replies:

```text
%%LOCAL_AGENT_TOOL_RESULT%%
tool: list_files
path: .
status: success
content:
package.json
tsconfig.json
src/
src/main.ts
src/App.tsx
.env [sensitive]
%%END_LOCAL_AGENT_TOOL_RESULT%%
```

ChatGPT may then request specific files, inspect them, and eventually respond normally with its analysis.

---

## Instruction Policy

Folio does not inject the full bootstrap instruction on every message.

Instead:

* The full bootstrap is sent once per conversation.
* Existing conversations are checked for a Folio marker.
* If a conversation was never initialized with Folio, the next Folio-enabled message includes the bootstrap.
* A short reminder can be sent after a configurable number of messages or approximate tokens.

This keeps the chat cleaner and reduces context usage.

---

## Current Scope

Folio currently targets:

```text
https://chatgpt.com/*
```

The ChatGPT adapter relies on the current ChatGPT web UI structure, including the composer and conversation turn elements.

Because ChatGPT is a web application and its DOM may change, the adapter may need updates over time.

---

## Configuration

The popup allows configuring limits such as:

* Maximum tool calls per task
* Maximum listed items
* Maximum file size
* Maximum total content sent per task
* Reminder frequency by message count
* Reminder frequency by approximate token count

These limits help prevent oversized responses, runaway loops, and accidental context flooding.

---

## Security Model

Folio is designed around user-controlled local access.

Important security principles:

* The user explicitly selects the local folder.
* Folio only operates inside the selected folder.
* The current version is read-only.
* Sensitive files require confirmation every time.
* Tool calls must appear visibly in the chat.
* The model cannot secretly call tools through hidden reasoning.
* File contents are treated as untrusted data.
* Prompt injection inside files should not be followed as instructions.

Folio does not give ChatGPT unrestricted access to your computer.

---

## Limitations

Folio is experimental.

Known limitations:

* Only ChatGPT is supported initially.
* Tool calls are visible in the chat.
* The UI is intentionally minimal.
* The extension depends on ChatGPT’s current DOM.
* Token counting is approximate.
* No file editing is supported yet.
* No terminal or shell command execution is supported.
* No Git integration is supported yet.

---

## Roadmap

Potential future improvements:

* Cleaner visual treatment for tool calls and results
* Side panel UI
* Multi-site support

  * Claude
  * Gemini
  * AI Studio
  * Perplexity
* File search tool
* Diff preview
* Controlled write mode
* Manual approval workflow for edits
* Git diff awareness
* Better workspace indexing
* Optional native host for advanced local capabilities

---

## Development Notes

Folio is built as a Chrome Manifest V3 extension.

Main components:

* Popup UI
* ChatGPT content script
* Background service worker
* Offscreen document for local file operations
* File System Access API integration
* Local tool-call parser
* Read-only file runtime

The extension communicates through Chrome extension messaging and uses the browser’s file access permissions for local folder access.

---

## Contributing

Contributions are welcome.

Good areas to contribute:

* ChatGPT adapter stability
* UI improvements
* Security review
* Better sensitive-file detection
* Better masking logic
* Documentation
* Multi-site adapters
* Test cases

Before adding write/edit capabilities, please open a discussion first. Folio’s safety model should remain explicit, user-controlled, and conservative.

---

## Disclaimer

Folio is not affiliated with OpenAI, ChatGPT, Google, Anthropic, Perplexity, or any other AI platform.

This project is experimental software. Use it carefully, especially when working with private repositories, credentials, or sensitive files.

---

## License

MIT

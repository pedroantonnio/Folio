import { getWorkspaceHandle } from "./lib/idb.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/defaults.js";

let workspaceHandle = null;
let workspaceName = null;
const taskState = new Map();

const workspaceChannel = new BroadcastChannel("folio-workspace");
workspaceChannel.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type !== "FOLIO_SET_WORKSPACE_HANDLE") return;

  workspaceHandle = message.handle || null;
  workspaceName = message.name || workspaceHandle?.name || "Selected folder";

  // Do not use chrome.storage from the offscreen document. Some Chrome
  // contexts expose runtime messaging but not storage, so settings and
  // metadata are passed through the background service worker instead.
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "folio-offscreen") return false;

  handleOffscreenMessage(message)
    .then(sendResponse)
    .catch((error) => {
      console.error("Folio offscreen error", error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    });

  return true;
});

async function handleOffscreenMessage(message) {
  switch (message.type) {
    case "FOLIO_OFFSCREEN_WORKSPACE_STATUS": {
      return getWorkspaceStatus();
    }

    case "FOLIO_OFFSCREEN_RESET_TASK": {
      const taskId = requireTaskId(message.taskId);
      taskState.set(taskId, { totalBytes: 0, toolCalls: 0, stopped: false });
      return { ok: true };
    }

    case "FOLIO_OFFSCREEN_STOP_TASK": {
      const taskId = message.taskId;
      if (taskId && taskState.has(taskId)) {
        taskState.get(taskId).stopped = true;
      }
      return { ok: true };
    }

    case "FOLIO_OFFSCREEN_EXECUTE_TOOL": {
      return executeTool(message);
    }

    default:
      return { ok: false, error: `Unknown offscreen message type: ${message.type}` };
  }
}

function getSettingsFromMessage(message) {
  return normalizeSettings(message?.settings || DEFAULT_SETTINGS);
}

async function getCurrentWorkspaceHandle() {
  if (workspaceHandle) return workspaceHandle;

  workspaceHandle = await getWorkspaceHandle();
  workspaceName = workspaceHandle?.name || workspaceName || "Selected folder";
  return workspaceHandle;
}

async function getWorkspaceStatus() {
  const handle = await getCurrentWorkspaceHandle();
  if (!handle) {
    return { ok: true, hasWorkspace: false, name: null, permission: "missing" };
  }

  let permission = "unknown";
  try {
    permission = await handle.queryPermission({ mode: "read" });
  } catch (error) {
    permission = "error";
  }

  return {
    ok: true,
    hasWorkspace: true,
    name: workspaceName || handle.name || "Selected folder",
    permission
  };
}

async function executeTool(message) {
  const taskId = requireTaskId(message.taskId);
  const call = validateToolCall(message.call);
  const settings = getSettingsFromMessage(message);
  const state = taskState.get(taskId) || { totalBytes: 0, toolCalls: 0, stopped: false };
  taskState.set(taskId, state);

  if (state.stopped) {
    return toolResult(call, "error", "Agent task was stopped by the user.");
  }

  state.toolCalls += 1;
  if (state.toolCalls > settings.maxToolCalls) {
    return toolResult(call, "error", `Tool call limit reached (${settings.maxToolCalls}).`);
  }

  const root = await getCurrentWorkspaceHandle();
  if (!root) {
    return toolResult(call, "error", "No local folder is connected. Open Folio and select a folder first.");
  }

  const permission = await root.queryPermission({ mode: "read" });
  if (permission !== "granted") {
    return toolResult(
      call,
      "error",
      "Local folder permission is not currently active. Open Folio and click Reconnect to reactivate the folder."
    );
  }

  if (call.tool === "list_files") {
    return listFiles(root, call, settings, state);
  }

  if (call.tool === "read_file") {
    return readFile(root, call, settings, state, message.sensitiveDecision);
  }

  return toolResult(call, "error", `Unsupported tool: ${call.tool}`);
}

function requireTaskId(taskId) {
  if (!taskId || typeof taskId !== "string") {
    throw new Error("Missing taskId.");
  }
  return taskId;
}

function validateToolCall(call) {
  if (!call || typeof call !== "object") {
    throw new Error("Invalid tool call.");
  }

  const tool = String(call.tool || "").trim();
  const path = normalizeRelativePath(String(call.path || ".").trim());

  if (!tool) throw new Error("Missing tool name.");
  if (!path) throw new Error("Missing path.");
  if (!new Set(["list_files", "read_file"]).has(tool)) {
    throw new Error(`Tool is not allowed in this MVP: ${tool}`);
  }

  return { tool, path };
}

function normalizeRelativePath(path) {
  const normalized = path.replaceAll("\\", "/").trim();
  if (!normalized || normalized === "./") return ".";
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error("Absolute paths are not allowed.");
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error("Paths containing '..' are not allowed.");
  }

  return parts.length ? parts.join("/") : ".";
}

async function getDirectoryHandleByPath(root, path) {
  if (path === ".") return root;

  let current = root;
  for (const segment of path.split("/")) {
    current = await current.getDirectoryHandle(segment, { create: false });
  }
  return current;
}

async function getFileHandleByPath(root, path) {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("Path must point to a file.");

  let current = root;
  for (const segment of parts) {
    current = await current.getDirectoryHandle(segment, { create: false });
  }
  return current.getFileHandle(fileName, { create: false });
}

async function listFiles(root, call, settings, state) {
  try {
    const directory = await getDirectoryHandleByPath(root, call.path);
    const items = [];
    const truncated = { value: false };
    const sensitivePatterns = settings.sensitiveNamePatterns || [];
    const largeDirs = new Set((settings.largeDirs || []).map((x) => x.toLowerCase()));

    await walkDirectory({
      dir: directory,
      basePath: call.path === "." ? "" : call.path,
      items,
      truncated,
      maxItems: settings.maxListItems,
      maxDepth: settings.maxListDepth,
      depth: 0,
      largeDirs,
      sensitivePatterns
    });

    let content = items.join("\n") || "[empty directory]";
    if (truncated.value) {
      content += "\n[listing truncated by Folio limits]";
    }

    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function walkDirectory({ dir, basePath, items, truncated, maxItems, maxDepth, depth, largeDirs, sensitivePatterns }) {
  if (items.length >= maxItems) {
    truncated.value = true;
    return;
  }

  const entries = [];
  for await (const [name, handle] of dir.entries()) {
    entries.push([name, handle]);
  }

  entries.sort(([aName, aHandle], [bName, bHandle]) => {
    if (aHandle.kind !== bHandle.kind) return aHandle.kind === "directory" ? -1 : 1;
    return aName.localeCompare(bName);
  });

  for (const [name, handle] of entries) {
    if (items.length >= maxItems) {
      truncated.value = true;
      return;
    }

    const itemPath = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === "directory") {
      if (largeDirs.has(name.toLowerCase())) {
        items.push(`${itemPath}/ [truncated]`);
        continue;
      }

      items.push(`${itemPath}/`);
      if (depth + 1 < maxDepth) {
        await walkDirectory({
          dir: handle,
          basePath: itemPath,
          items,
          truncated,
          maxItems,
          maxDepth,
          depth: depth + 1,
          largeDirs,
          sensitivePatterns
        });
      }
      continue;
    }

    const label = isSensitiveName(itemPath, sensitivePatterns) ? " [sensitive]" : "";
    items.push(`${itemPath}${label}`);
  }
}

async function readFile(root, call, settings, state, sensitiveDecision) {
  try {
    const fileHandle = await getFileHandleByPath(root, call.path);
    const file = await fileHandle.getFile();

    if (file.size > settings.maxFileSizeKb * 1024) {
      return toolResult(call, "error", `File is larger than the configured limit (${settings.maxFileSizeKb} KB).`);
    }

    const content = await file.text();
    const sensitiveReason = detectSensitivity(call.path, content, settings);

    if (sensitiveReason && !sensitiveDecision) {
      return {
        ok: true,
        approvalRequired: true,
        path: call.path,
        reason: sensitiveReason,
        call
      };
    }

    if (sensitiveReason && sensitiveDecision === "deny") {
      return toolResult(call, "denied", "The user did not authorize sending this sensitive file.");
    }

    if (sensitiveReason && sensitiveDecision === "masked") {
      const masked = maskSensitiveContent(content, settings);
      return boundedToolResult(call, "success_masked", masked, settings, state);
    }

    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

function detectSensitivity(path, content, settings) {
  if (isSensitiveName(path, settings.sensitiveNamePatterns)) {
    return "name_pattern";
  }

  const upper = String(content || "").toUpperCase();
  const matched = (settings.sensitiveContentPatterns || []).find((pattern) => upper.includes(String(pattern).toUpperCase()));
  return matched ? `content_pattern:${matched}` : "";
}

function isSensitiveName(path, patterns) {
  const fileName = path.split("/").pop() || path;
  const lowerPath = path.toLowerCase();
  const lowerName = fileName.toLowerCase();

  return (patterns || []).some((pattern) => {
    const lowerPattern = String(pattern).toLowerCase().trim();
    if (!lowerPattern) return false;
    if (!lowerPattern.includes("*")) {
      return lowerName === lowerPattern || lowerPath.endsWith(`/${lowerPattern}`);
    }
    const regex = new RegExp(`^${globToRegexSource(lowerPattern)}$`, "i");
    return regex.test(lowerName) || regex.test(lowerPath);
  });
}

function maskSensitiveContent(content, settings) {
  const lines = String(content || "").split(/\r?\n/);
  const patterns = (settings.sensitiveContentPatterns || []).map((pattern) => String(pattern).toUpperCase());

  return lines.map((line) => {
    const upper = line.toUpperCase();
    const looksSensitive = patterns.some((pattern) => upper.includes(pattern));
    const keyValueMatch = line.match(/^\s*([^=#:\s]+)\s*([=:])\s*(.*)$/);

    if (looksSensitive && keyValueMatch) {
      return `${keyValueMatch[1]}${keyValueMatch[2]}***MASKED***`;
    }

    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
      return "-----BEGIN PRIVATE KEY-----***MASKED***";
    }

    return line;
  }).join("\n");
}

function boundedToolResult(call, status, content, settings, state) {
  const bytes = new TextEncoder().encode(String(content || "")).length;
  if (state.totalBytes + bytes > settings.maxTotalBytes) {
    return toolResult(call, "error", `Total content limit reached (${settings.maxTotalBytes} bytes).`);
  }

  state.totalBytes += bytes;
  return toolResult(call, status, content);
}

function toolResult(call, status, contentOrMessage) {
  const contentKey = status === "success" || status === "success_masked" ? "content" : "message";
  return {
    ok: true,
    result: {
      tool: call.tool,
      path: call.path,
      status,
      [contentKey]: String(contentOrMessage || "")
    }
  };
}

function globToRegexSource(value) {
  return String(value)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
}

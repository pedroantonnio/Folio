import { getWorkspaceHandle } from "./lib/idb.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/defaults.js";

let workspaceHandle = null;
let workspaceName = null;
const taskState = new Map();

const workspaceChannel = new BroadcastChannel("folio-workspace");
workspaceChannel.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type !== "FOLIO_SET_WORKSPACE_HANDLE") return;
  workspaceHandle = message.handle || null;
  workspaceName = message.name || workspaceHandle?.name || "Selected folder";
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
    case "FOLIO_OFFSCREEN_WORKSPACE_STATUS":
      return getWorkspaceStatus();

    case "FOLIO_OFFSCREEN_REFRESH_WORKSPACE_HANDLE":
      workspaceHandle = null;
      workspaceName = null;
      return getWorkspaceStatus();

    case "FOLIO_OFFSCREEN_RESET_TASK": {
      const taskId = requireTaskId(message.taskId);
      taskState.set(taskId, { totalBytes: 0, toolCalls: 0, stopped: false });
      return { ok: true };
    }

    case "FOLIO_OFFSCREEN_STOP_TASK": {
      const taskId = message.taskId;
      if (taskId && taskState.has(taskId)) taskState.get(taskId).stopped = true;
      return { ok: true };
    }

    case "FOLIO_OFFSCREEN_EXECUTE_TOOL":
      return executeTool(message);

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
  if (!handle) return { ok: true, hasWorkspace: false, name: null, permission: "missing" };

  let permission = "unknown";
  try {
    permission = await handle.queryPermission({ mode: "read" });
  } catch (error) {
    permission = "error";
  }

  return { ok: true, hasWorkspace: true, name: workspaceName || handle.name || "Selected folder", permission };
}

async function executeTool(message) {
  const taskId = requireTaskId(message.taskId);
  const settings = getSettingsFromMessage(message);
  const call = validateToolCall(message.call);
  const state = taskState.get(taskId) || { totalBytes: 0, toolCalls: 0, stopped: false };
  taskState.set(taskId, state);

  if (state.stopped) return toolResult(call, "error", "Agent task was stopped by the user.");

  state.toolCalls += 1;
  if (state.toolCalls > settings.maxToolCalls) {
    return toolResult(call, "error", `Tool call limit reached (${settings.maxToolCalls}).`);
  }

  const root = await getCurrentWorkspaceHandle();
  if (!root) return toolResult(call, "error", "No local folder is connected. Use the Folio dropdown in ChatGPT and select a folder first.");

  const permission = await root.queryPermission({ mode: "read" });
  if (permission !== "granted") {
    return toolResult(call, "error", "Local folder permission is not currently active. Use the Folio dropdown in ChatGPT and select the folder again.");
  }

  switch (call.tool) {
    case "list_files":
      return listFiles(root, call, settings, state);
    case "read_file":
      return readFile(root, call, settings, state, message.sensitiveDecision);
    case "search_files":
      return searchFiles(root, call, settings, state);
    case "grep_files":
      return grepFiles(root, call, settings, state);
    case "get_file_info":
      return getFileInfo(root, call, settings, state);
    case "attach_file":
      return attachFile(root, call, settings, state, message.attachmentDecision);
    default:
      return toolResult(call, "error", `Unsupported tool: ${call.tool}`);
  }
}

function requireTaskId(taskId) {
  if (!taskId || typeof taskId !== "string") throw new Error("Missing taskId.");
  return taskId;
}

function validateToolCall(rawCall) {
  if (!rawCall || typeof rawCall !== "object") throw new Error("Invalid tool call.");

  const tool = String(rawCall.tool || "").trim();
  const allowed = new Set(["list_files", "read_file", "search_files", "grep_files", "get_file_info", "attach_file"]);
  if (!tool) throw new Error("Missing tool name.");
  if (!allowed.has(tool)) throw new Error(`Tool is not allowed: ${tool}`);

  const call = { tool };

  if (tool === "search_files" || tool === "grep_files") {
    call.query = String(rawCall.query || "").trim();
    if (!call.query) throw new Error(`${tool} requires query.`);
    call.path = normalizeRelativePath(String(rawCall.path || ".").trim());
    return call;
  }

  call.path = normalizeRelativePath(String(rawCall.path || ".").trim());
  return call;
}

function normalizeRelativePath(path) {
  const normalized = path.replaceAll("\\", "/").trim();
  if (!normalized || normalized === "./") return ".";
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) throw new Error("Absolute paths are not allowed.");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) throw new Error("Paths containing '..' are not allowed.");
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
    const largeDirs = new Set(settings.largeDirs.map((x) => x.toLowerCase()));

    await walkDirectory({
      dir: directory,
      basePath: call.path === "." ? "" : call.path,
      items,
      truncated,
      maxItems: settings.maxListItems,
      maxDepth: settings.maxListDepth,
      depth: 0,
      largeDirs,
      includeDirs: true,
      includeFiles: true,
      onFile: (itemPath) => itemPath + (isSensitiveName(itemPath, settings.sensitiveNamePatterns) ? " [sensitive]" : "")
    });

    let content = items.join("\n") || "[empty directory]";
    if (truncated.value) content += "\n[listing truncated by Folio limits]";
    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function searchFiles(root, call, settings, state) {
  try {
    const directory = await getDirectoryHandleByPath(root, call.path);
    const query = call.query.toLowerCase();
    const results = [];
    const truncated = { value: false };
    const largeDirs = new Set(settings.largeDirs.map((x) => x.toLowerCase()));

    await walkDirectory({
      dir: directory,
      basePath: call.path === "." ? "" : call.path,
      items: results,
      truncated,
      maxItems: settings.maxSearchResults,
      maxDepth: 20,
      depth: 0,
      largeDirs,
      includeDirs: true,
      includeFiles: true,
      onDirectory: (itemPath, name) => (itemPath.toLowerCase().includes(query) || name.toLowerCase().includes(query)) ? `${itemPath}/` : null,
      onFile: (itemPath, name) => {
        if (!itemPath.toLowerCase().includes(query) && !name.toLowerCase().includes(query)) return null;
        return itemPath + (isSensitiveName(itemPath, settings.sensitiveNamePatterns) ? " [sensitive]" : "");
      }
    });

    let content = results.join("\n") || `[no file or folder names matched query: ${call.query}]`;
    if (truncated.value) content += "\n[search truncated by Folio limits]";
    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function grepFiles(root, call, settings, state) {
  try {
    const directory = await getDirectoryHandleByPath(root, call.path);
    const query = call.query.toLowerCase();
    const results = [];
    const truncated = { value: false };
    const largeDirs = new Set(settings.largeDirs.map((x) => x.toLowerCase()));

    await walkFileHandles({
      dir: directory,
      basePath: call.path === "." ? "" : call.path,
      maxResults: settings.maxGrepResults,
      maxDepth: 20,
      depth: 0,
      largeDirs,
      truncated,
      async onFile(itemPath, fileHandle) {
        if (results.length >= settings.maxGrepResults) {
          truncated.value = true;
          return;
        }

        const file = await fileHandle.getFile();
        if (file.size > settings.maxGrepFileSizeKb * 1024) return;
        if (!isLikelyTextFile(itemPath, file.type)) return;

        const content = await file.text();
        const sensitive = isSensitiveName(itemPath, settings.sensitiveNamePatterns) || Boolean(detectSensitivityInContent(content, settings));
        const lines = content.split(/\r?\n/);
        let hiddenMatches = 0;

        for (let i = 0; i < lines.length; i += 1) {
          if (!lines[i].toLowerCase().includes(query)) continue;
          if (sensitive) {
            hiddenMatches += 1;
            continue;
          }
          const excerpt = collapseWhitespace(lines[i]).slice(0, 220);
          results.push(`${itemPath}:${i + 1}: ${excerpt}`);
          if (results.length >= settings.maxGrepResults) {
            truncated.value = true;
            return;
          }
        }

        if (hiddenMatches > 0) {
          results.push(`${itemPath} [sensitive]: ${hiddenMatches} match(es), content not shown. Use read_file if explicitly needed.`);
        }
      }
    });

    let content = results.join("\n") || `[no text matches found for query: ${call.query}]`;
    if (truncated.value) content += "\n[grep truncated by Folio limits]";
    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function getFileInfo(root, call, settings, state) {
  try {
    const fileHandle = await getFileHandleByPath(root, call.path);
    const file = await fileHandle.getFile();
    const mime = inferMimeType(call.path, file.type);
    const kind = classifyKind(call.path, mime);
    const byNameSensitive = isSensitiveName(call.path, settings.sensitiveNamePatterns);
    let byContentSensitive = false;

    if (isLikelyTextFile(call.path, mime) && file.size <= settings.maxFileSizeKb * 1024) {
      const content = await file.text();
      byContentSensitive = Boolean(detectSensitivityInContent(content, settings));
    }

    const sensitive = byNameSensitive || byContentSensitive;
    const recommended = kind === "text" ? "read_file" : "attach_file";
    const content = [
      `name: ${file.name}`,
      `path: ${call.path}`,
      `type: ${mime || "unknown"}`,
      `kind: ${kind}`,
      `size_bytes: ${file.size}`,
      `size_human: ${formatBytes(file.size)}`,
      `sensitive: ${sensitive ? "true" : "false"}`,
      `recommended_delivery: ${recommended}`
    ].join("\n");

    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function readFile(root, call, settings, state, sensitiveDecision) {
  try {
    const fileHandle = await getFileHandleByPath(root, call.path);
    const file = await fileHandle.getFile();
    const mime = inferMimeType(call.path, file.type);

    if (!isLikelyTextFile(call.path, mime)) {
      return toolResult(call, "error", `This file does not look like text (${mime || "unknown"}). Use get_file_info or attach_file.`);
    }

    if (file.size > settings.maxFileSizeKb * 1024) {
      return toolResult(call, "error", `File is larger than the configured text-read limit (${settings.maxFileSizeKb} KB). Use get_file_info or attach_file.`);
    }

    const content = await file.text();
    const sensitiveReason = detectSensitivity(call.path, content, settings);

    if (sensitiveReason && !sensitiveDecision) {
      return { ok: true, approvalRequired: true, approvalKind: "sensitive_text", path: call.path, reason: sensitiveReason, call };
    }

    if (sensitiveReason && sensitiveDecision === "deny") {
      return toolResult(call, "denied", "The user did not authorize sending this sensitive file.");
    }

    if (sensitiveReason && sensitiveDecision === "masked") {
      return boundedToolResult(call, "success_masked", maskSensitiveContent(content, settings), settings, state);
    }

    return boundedToolResult(call, "success", content, settings, state);
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function attachFile(root, call, settings, state, attachmentDecision) {
  try {
    const fileHandle = await getFileHandleByPath(root, call.path);
    const file = await fileHandle.getFile();
    const mime = inferMimeType(call.path, file.type);
    const kind = classifyKind(call.path, mime);

    if (file.size > settings.maxAttachSizeKb * 1024) {
      return toolResult(call, "error", `File is larger than the configured attach limit (${settings.maxAttachSizeKb} KB).`);
    }

    let sensitiveReason = "";
    if (isSensitiveName(call.path, settings.sensitiveNamePatterns)) sensitiveReason = "name_pattern";
    if (!sensitiveReason && isLikelyTextFile(call.path, mime) && file.size <= settings.maxFileSizeKb * 1024) {
      const content = await file.text();
      sensitiveReason = detectSensitivityInContent(content, settings);
    }

    if (!attachmentDecision) {
      return {
        ok: true,
        approvalRequired: true,
        approvalKind: "attach_file",
        path: call.path,
        reason: sensitiveReason || "attachment_confirmation",
        fileInfo: {
          name: file.name,
          size: file.size,
          type: mime,
          kind,
          sensitive: Boolean(sensitiveReason)
        },
        call
      };
    }

    if (attachmentDecision === "deny") {
      return toolResult(call, "denied", "The user did not authorize attaching this file.");
    }

    if (attachmentDecision !== "attach") {
      return toolResult(call, "error", `Unknown attachment decision: ${attachmentDecision}`);
    }

    const base64 = await fileToBase64(file);
    return {
      ok: true,
      result: {
        tool: call.tool,
        path: call.path,
        status: "attach_ready",
        content: `File is ready to attach: ${file.name} (${mime || "unknown"}, ${formatBytes(file.size)}).`,
        attachment: {
          name: file.name,
          type: mime || "application/octet-stream",
          size: file.size,
          base64
        }
      }
    };
  } catch (error) {
    return toolResult(call, "error", String(error?.message || error));
  }
}

async function walkDirectory({ dir, basePath, items, truncated, maxItems, maxDepth, depth, largeDirs, includeDirs, includeFiles, onDirectory, onFile }) {
  if (items.length >= maxItems) {
    truncated.value = true;
    return;
  }

  const entries = [];
  for await (const [name, handle] of dir.entries()) entries.push([name, handle]);
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
      const rendered = onDirectory ? onDirectory(itemPath, name, handle) : `${itemPath}/`;
      if (includeDirs && rendered) items.push(rendered);
      if (largeDirs.has(name.toLowerCase())) {
        if (!onDirectory && includeDirs && !items.includes(`${itemPath}/ [truncated]`)) items.push(`${itemPath}/ [truncated]`);
        continue;
      }
      if (depth + 1 < maxDepth) {
        await walkDirectory({ dir: handle, basePath: itemPath, items, truncated, maxItems, maxDepth, depth: depth + 1, largeDirs, includeDirs, includeFiles, onDirectory, onFile });
      }
      continue;
    }

    if (includeFiles) {
      const rendered = onFile ? onFile(itemPath, name, handle) : itemPath;
      if (rendered) items.push(rendered);
    }
  }
}

async function walkFileHandles({ dir, basePath, maxResults, maxDepth, depth, largeDirs, truncated, onFile }) {
  if (depth >= maxDepth) return;
  const entries = [];
  for await (const [name, handle] of dir.entries()) entries.push([name, handle]);
  entries.sort(([aName, aHandle], [bName, bHandle]) => {
    if (aHandle.kind !== bHandle.kind) return aHandle.kind === "directory" ? -1 : 1;
    return aName.localeCompare(bName);
  });

  for (const [name, handle] of entries) {
    if (truncated.value) return;
    const itemPath = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === "directory") {
      if (largeDirs.has(name.toLowerCase())) continue;
      await walkFileHandles({ dir: handle, basePath: itemPath, maxResults, maxDepth, depth: depth + 1, largeDirs, truncated, onFile });
    } else {
      await onFile(itemPath, handle);
    }
  }
}

function detectSensitivity(path, content, settings) {
  if (isSensitiveName(path, settings.sensitiveNamePatterns)) return "name_pattern";
  return detectSensitivityInContent(content, settings);
}

function detectSensitivityInContent(content, settings) {
  const upper = String(content || "").toUpperCase();
  const matched = settings.sensitiveContentPatterns.find((pattern) => upper.includes(String(pattern).toUpperCase()));
  return matched ? `content_pattern:${matched}` : "";
}

function isSensitiveName(path, patterns) {
  const fileName = path.split("/").pop() || path;
  const lowerPath = path.toLowerCase();
  const lowerName = fileName.toLowerCase();

  return patterns.some((pattern) => {
    const lowerPattern = String(pattern).toLowerCase().trim();
    if (!lowerPattern) return false;
    if (!lowerPattern.includes("*")) return lowerName === lowerPattern || lowerPath.endsWith(`/${lowerPattern}`);
    const regex = new RegExp(`^${globToRegexSource(lowerPattern)}$`, "i");
    return regex.test(lowerName) || regex.test(lowerPath);
  });
}

function globToRegexSource(value) {
  return String(value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
}

function maskSensitiveContent(content, settings) {
  const lines = String(content || "").split(/\r?\n/);
  const patterns = settings.sensitiveContentPatterns.map((pattern) => String(pattern).toUpperCase());
  return lines.map((line) => {
    const upper = line.toUpperCase();
    const looksSensitive = patterns.some((pattern) => upper.includes(pattern));
    const keyValueMatch = line.match(/^\s*([^=#: \t]+)\s*([=:])\s*(.*)$/);
    if (looksSensitive && keyValueMatch) return `${keyValueMatch[1]}${keyValueMatch[2]}***MASKED***`;
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) return "-----BEGIN PRIVATE KEY-----***MASKED***";
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
  return { ok: true, result: { tool: call.tool, path: call.path || ".", status, [contentKey]: String(contentOrMessage || "") } };
}

function isLikelyTextFile(path, mime) {
  const ext = extensionOf(path);
  if (mime && (mime.startsWith("text/") || ["application/json", "application/xml", "application/javascript", "application/typescript", "image/svg+xml"].includes(mime))) return true;
  return new Set([
    "txt", "md", "markdown", "json", "jsonc", "js", "jsx", "ts", "tsx", "mjs", "cjs", "css", "scss", "sass", "less", "html", "htm", "xml", "svg", "yml", "yaml", "toml", "ini", "env", "gitignore", "dockerignore", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "prisma", "vue", "svelte", "astro", "tsx"
  ]).has(ext) || path.split("/").pop()?.startsWith(".");
}

function inferMimeType(path, provided) {
  if (provided) return provided;
  const ext = extensionOf(path);
  const map = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    pdf: "application/pdf", txt: "text/plain", md: "text/markdown", json: "application/json", js: "application/javascript", mjs: "application/javascript", ts: "text/typescript", tsx: "text/typescript", jsx: "text/javascript", css: "text/css", html: "text/html", xml: "application/xml", csv: "text/csv", yaml: "text/yaml", yml: "text/yaml"
  };
  return map[ext] || "application/octet-stream";
}

function classifyKind(path, mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (isLikelyTextFile(path, mime)) return "text";
  return "binary";
}

function extensionOf(path) {
  const name = path.split("/").pop() || "";
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : name.toLowerCase();
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

import { getWorkspaceHandle } from "./lib/idb.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/defaults.js";

const OFFSCREEN_URL = "offscreen.html";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "folio-offscreen") return false;

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("Folio background error", error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    });
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "FOLIO_GET_SETTINGS": {
      return { ok: true, settings: await getSettings() };
    }

    case "FOLIO_SAVE_SETTINGS": {
      const settings = normalizeSettings(message.settings || {});
      await chrome.storage.local.set({ settings });
      return { ok: true, settings };
    }

    case "FOLIO_OPEN_POPUP": {
      try {
        await chrome.action.openPopup();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }

    case "FOLIO_GET_CONVERSATION_STATE": {
      return { ok: true, state: await getConversationState(message.key) };
    }

    case "FOLIO_SAVE_CONVERSATION_STATE": {
      const state = await saveConversationState(message.key, message.patch || {});
      return { ok: true, state };
    }

    case "FOLIO_PREPARE_OFFSCREEN": {
      await ensureOffscreenDocument();
      return { ok: true };
    }

    case "FOLIO_GET_WORKSPACE_STATUS": {
      const workspaceKey = await resolveWorkspaceKey(message);
      await ensureOffscreenDocument();
      const status = await sendToOffscreen({ type: "FOLIO_OFFSCREEN_WORKSPACE_STATUS", workspaceKey });
      if (status?.hasWorkspace) return status;
      return getFallbackWorkspaceStatus(workspaceKey);
    }

    case "FOLIO_REFRESH_WORKSPACE_HANDLE": {
      const workspaceKey = await resolveWorkspaceKey(message);
      await ensureOffscreenDocument();
      const status = await sendToOffscreen({ type: "FOLIO_OFFSCREEN_REFRESH_WORKSPACE_HANDLE", workspaceKey });
      if (status?.hasWorkspace) return status;
      return getFallbackWorkspaceStatus(workspaceKey);
    }

    case "FOLIO_RESET_TASK": {
      await ensureOffscreenDocument();
      return sendToOffscreen({ type: "FOLIO_OFFSCREEN_RESET_TASK", taskId: message.taskId });
    }

    case "FOLIO_STOP_TASK": {
      await ensureOffscreenDocument();
      return sendToOffscreen({ type: "FOLIO_OFFSCREEN_STOP_TASK", taskId: message.taskId });
    }

    case "FOLIO_EXECUTE_TOOL": {
      await ensureOffscreenDocument();
      const settings = await getSettings();
      const workspaceKey = await resolveWorkspaceKey(message);
      if (!workspaceKey) {
        return {
          ok: true,
          result: makeToolErrorResult(message.call, "No workspace is selected for this chat. Use the Folio dropdown and choose Select folder for this chat.")
        };
      }
      return sendToOffscreen({
        type: "FOLIO_OFFSCREEN_EXECUTE_TOOL",
        taskId: message.taskId,
        call: message.call,
        sensitiveDecision: message.sensitiveDecision,
        attachmentDecision: message.attachmentDecision,
        workspaceKey,
        settings
      });
    }

    default:
      return { ok: false, error: `Unknown message type: ${message?.type}` };
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return normalizeSettings(stored.settings || DEFAULT_SETTINGS);
}

async function resolveWorkspaceKey(message) {
  const directKey = normalizeWorkspaceKey(message?.workspaceKey);
  if (directKey) return directKey;

  const conversationKey = String(message?.conversationKey || "").trim();
  if (!conversationKey) return null;

  const state = await getConversationState(conversationKey);
  return normalizeWorkspaceKey(state?.workspaceKey);
}

function normalizeWorkspaceKey(value) {
  const key = String(value || "").trim();
  return key || null;
}

function makeToolErrorResult(call, message) {
  const rawCall = call && typeof call === "object" ? call : {};
  return {
    tool: String(rawCall.tool || "unknown"),
    path: String(rawCall.path || "."),
    query: rawCall.query ? String(rawCall.query) : undefined,
    status: "error",
    message
  };
}

async function getFallbackWorkspaceStatus(workspaceKey) {
  const key = normalizeWorkspaceKey(workspaceKey);
  if (!key) {
    return { ok: true, hasWorkspace: false, name: null, permission: "missing" };
  }

  const handle = await getWorkspaceHandle(key);
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
    name: handle.name || "Selected folder",
    permission
  };
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) return;

  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["LOCAL_STORAGE"],
    justification: "Keep the selected local folder handle active while Folio executes local file tools for the current ChatGPT agent loop."
  });
}

async function sendToOffscreen(message) {
  return chrome.runtime.sendMessage({ ...message, target: "folio-offscreen" });
}

async function getConversationState(key) {
  if (!key) return null;
  const stored = await chrome.storage.local.get("conversationStates");
  return stored.conversationStates?.[key] || null;
}

async function saveConversationState(key, patch) {
  if (!key) return null;
  const stored = await chrome.storage.local.get("conversationStates");
  const conversationStates = stored.conversationStates || {};
  const previous = conversationStates[key] || {};
  const cleanPatch = Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== undefined)
  );
  const next = {
    ...previous,
    ...cleanPatch,
    updatedAt: Date.now()
  };
  conversationStates[key] = next;

  const entries = Object.entries(conversationStates)
    .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))
    .slice(0, 100);

  await chrome.storage.local.set({ conversationStates: Object.fromEntries(entries) });
  return next;
}

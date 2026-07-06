import { saveWorkspaceHandle, clearWorkspaceHandle } from "./lib/idb.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/defaults.js";

const els = {
  enabled: document.getElementById("enabled"),
  selectFolder: document.getElementById("selectFolder"),
  workspaceStatus: document.getElementById("workspaceStatus"),
  maxToolCalls: document.getElementById("maxToolCalls"),
  maxListItems: document.getElementById("maxListItems"),
  maxFileSizeKb: document.getElementById("maxFileSizeKb"),
  maxTotalKb: document.getElementById("maxTotalKb"),
  reminderUserMessages: document.getElementById("reminderUserMessages"),
  reminderApproxTokens: document.getElementById("reminderApproxTokens"),
  largeDirs: document.getElementById("largeDirs"),
  sensitiveNamePatterns: document.getElementById("sensitiveNamePatterns"),
  sensitiveContentPatterns: document.getElementById("sensitiveContentPatterns"),
  save: document.getElementById("save"),
  stop: document.getElementById("stop"),
  message: document.getElementById("message")
};

init();

async function init() {
  await loadSettings();
  await refreshWorkspaceStatus();

  els.enabled.addEventListener("change", saveSettings);
  els.save.addEventListener("click", saveSettings);
  els.selectFolder.addEventListener("click", selectFolder);
  els.stop.addEventListener("click", stopAgentInActiveTab);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(stored.settings || DEFAULT_SETTINGS);

  els.enabled.checked = Boolean(settings.enabled);
  els.maxToolCalls.value = settings.maxToolCalls;
  els.maxListItems.value = settings.maxListItems;
  els.maxFileSizeKb.value = settings.maxFileSizeKb;
  els.maxTotalKb.value = Math.round(settings.maxTotalBytes / 1024);
  els.reminderUserMessages.value = settings.reminderUserMessages;
  els.reminderApproxTokens.value = settings.reminderApproxTokens;
  els.largeDirs.value = settings.largeDirs.join("\n");
  els.sensitiveNamePatterns.value = settings.sensitiveNamePatterns.join("\n");
  els.sensitiveContentPatterns.value = settings.sensitiveContentPatterns.join("\n");
}

async function saveSettings() {
  const settings = normalizeSettings({
    enabled: els.enabled.checked,
    maxToolCalls: Number(els.maxToolCalls.value),
    maxListItems: Number(els.maxListItems.value),
    maxFileSizeKb: Number(els.maxFileSizeKb.value),
    maxTotalBytes: Number(els.maxTotalKb.value) * 1024,
    maxListDepth: DEFAULT_SETTINGS.maxListDepth,
    reminderUserMessages: Number(els.reminderUserMessages.value),
    reminderApproxTokens: Number(els.reminderApproxTokens.value),
    largeDirs: lines(els.largeDirs.value),
    sensitiveNamePatterns: lines(els.sensitiveNamePatterns.value),
    sensitiveContentPatterns: lines(els.sensitiveContentPatterns.value)
  });

  await chrome.runtime.sendMessage({ type: "FOLIO_SAVE_SETTINGS", settings });
  showMessage("Saved.");
}

async function selectFolder() {
  if (!window.showDirectoryPicker) {
    showMessage("This Chrome version does not support folder selection.");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const permission = await handle.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      showMessage("Folder permission was not granted.");
      return;
    }

    await saveWorkspaceHandle(handle);
    await chrome.storage.local.set({ workspaceName: handle.name || "Selected folder" });

    // MV3 service workers can suspend between tool calls. Keep an offscreen
    // extension document alive and pass the freshly-authorized handle to it so
    // Folio does not lose the active folder during a ChatGPT agent loop.
    await chrome.runtime.sendMessage({ type: "FOLIO_PREPARE_OFFSCREEN" }).catch(() => null);
    try {
      const channel = new BroadcastChannel("folio-workspace");
      channel.postMessage({
        type: "FOLIO_SET_WORKSPACE_HANDLE",
        handle,
        name: handle.name || "Selected folder"
      });
      setTimeout(() => channel.close(), 500);
    } catch (broadcastError) {
      console.warn("Folio could not broadcast workspace handle", broadcastError);
    }

    await refreshWorkspaceStatus();
    showMessage("Workspace connected.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    showMessage(`Could not select folder: ${error?.message || error}`);
    await clearWorkspaceHandle().catch(() => {});
  }
}

async function refreshWorkspaceStatus() {
  const status = await chrome.runtime.sendMessage({ type: "FOLIO_GET_WORKSPACE_STATUS" });
  if (!status?.hasWorkspace) {
    els.workspaceStatus.textContent = "No folder selected.";
    return;
  }

  els.workspaceStatus.textContent = `${status.name} · ${status.permission}`;
}

async function stopAgentInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showMessage("No active tab.");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FOLIO_STOP" });
    showMessage("Stop signal sent.");
  } catch (error) {
    showMessage("Open chatgpt.com to stop an active agent.");
  }
}

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function showMessage(text) {
  els.message.textContent = text;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    els.message.textContent = "";
  }, 2500);
}

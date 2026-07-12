import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/defaults.js";

const els = {
  maxToolCalls: document.getElementById("maxToolCalls"),
  maxListItems: document.getElementById("maxListItems"),
  maxFileSizeKb: document.getElementById("maxFileSizeKb"),
  maxTotalKb: document.getElementById("maxTotalKb"),
  maxSearchResults: document.getElementById("maxSearchResults"),
  maxGrepResults: document.getElementById("maxGrepResults"),
  maxGrepFileSizeKb: document.getElementById("maxGrepFileSizeKb"),
  maxAttachSizeKb: document.getElementById("maxAttachSizeKb"),
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
  els.save.addEventListener("click", saveSettings);
  els.stop.addEventListener("click", stopAgentInActiveTab);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(stored.settings || DEFAULT_SETTINGS);
  els.maxToolCalls.value = settings.maxToolCalls;
  els.maxListItems.value = settings.maxListItems;
  els.maxFileSizeKb.value = settings.maxFileSizeKb;
  els.maxTotalKb.value = Math.round(settings.maxTotalBytes / 1024);
  els.maxSearchResults.value = settings.maxSearchResults;
  els.maxGrepResults.value = settings.maxGrepResults;
  els.maxGrepFileSizeKb.value = settings.maxGrepFileSizeKb;
  els.maxAttachSizeKb.value = settings.maxAttachSizeKb;
  els.reminderUserMessages.value = settings.reminderUserMessages;
  els.reminderApproxTokens.value = settings.reminderApproxTokens;
  els.largeDirs.value = settings.largeDirs.join("\n");
  els.sensitiveNamePatterns.value = settings.sensitiveNamePatterns.join("\n");
  els.sensitiveContentPatterns.value = settings.sensitiveContentPatterns.join("\n");
}

async function saveSettings() {
  const settings = normalizeSettings({
    enabled: true,
    maxToolCalls: Number(els.maxToolCalls.value),
    maxListItems: Number(els.maxListItems.value),
    maxFileSizeKb: Number(els.maxFileSizeKb.value),
    maxTotalBytes: Number(els.maxTotalKb.value) * 1024,
    maxSearchResults: Number(els.maxSearchResults.value),
    maxGrepResults: Number(els.maxGrepResults.value),
    maxGrepFileSizeKb: Number(els.maxGrepFileSizeKb.value),
    maxAttachSizeKb: Number(els.maxAttachSizeKb.value),
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
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function showMessage(text) {
  els.message.textContent = text;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { els.message.textContent = ""; }, 2500);
}

import { saveWorkspaceHandle } from "./lib/idb.js";

const params = new URLSearchParams(location.search);
const requestId = params.get("requestId") || "";
const workspaceKey = params.get("workspaceKey") || `workspace:${crypto.randomUUID()}`;
const statusEl = document.getElementById("status");
const selectButton = document.getElementById("select");
const cancelButton = document.getElementById("cancel");
let selecting = false;
let completed = false;

selectButton.addEventListener("click", () => selectWorkspace(false));
cancelButton.addEventListener("click", () => {
  if (completed) return;
  postResult({ ok: false, cancelled: true });
  window.close();
});

// Chrome may allow the native picker to open because this window was opened
// from a direct user gesture in the ChatGPT composer. If not, the visible
// Select folder button remains as the explicit gesture fallback.
setTimeout(() => selectWorkspace(true), 80);

async function selectWorkspace(autoAttempt) {
  if (selecting || completed) return;
  if (!window.showDirectoryPicker) {
    const error = "This Chrome version does not support folder selection.";
    setStatus(error);
    postResult({ ok: false, error });
    return;
  }

  selecting = true;
  selectButton.disabled = true;
  setStatus("Opening native folder picker…");

  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const permission = await handle.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      completed = true;
      const error = "Folder permission was not granted.";
      setStatus(error);
      postResult({ ok: false, error });
      setTimeout(() => window.close(), 500);
      return;
    }

    const name = handle.name || "Selected folder";
    setStatus("Saving workspace…");
    await saveWorkspaceHandle(handle, workspaceKey);

    await chrome.runtime.sendMessage({ type: "FOLIO_PREPARE_OFFSCREEN" }).catch((error) => {
      console.warn("Folio could not prepare offscreen after workspace selection", error);
    });

    const refresh = await chrome.runtime.sendMessage({ type: "FOLIO_REFRESH_WORKSPACE_HANDLE", workspaceKey }).catch((error) => {
      console.warn("Folio could not refresh offscreen workspace handle", error);
      return null;
    });

    try {
      const channel = new BroadcastChannel("folio-workspace");
      channel.postMessage({ type: "FOLIO_SET_WORKSPACE_HANDLE", workspaceKey, handle, name });
      setTimeout(() => channel.close(), 500);
    } catch (broadcastError) {
      console.warn("Folio workspace picker could not broadcast handle", broadcastError);
    }

    completed = true;
    setStatus(`Workspace connected: ${name}`);
    postResult({
      ok: true,
      workspaceKey,
      name,
      permission: refresh?.permission || permission
    });
    setTimeout(() => window.close(), 350);
  } catch (error) {
    if (error?.name === "AbortError") {
      completed = true;
      postResult({ ok: false, cancelled: true });
      window.close();
      return;
    }

    if (autoAttempt && isUserActivationError(error)) {
      selecting = false;
      selectButton.disabled = false;
      setStatus("Click Select folder to open the native folder picker.");
      return;
    }

    completed = true;
    const message = String(error?.message || error);
    console.warn("Folio could not select workspace", error);
    setStatus(`Could not connect folder. ${message}`);
    postResult({ ok: false, error: message });
  } finally {
    if (!completed) {
      selecting = false;
      selectButton.disabled = false;
    }
  }
}

function isUserActivationError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "").toLowerCase();
  return name === "SecurityError" || message.includes("user activation") || message.includes("user gesture");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function postResult(payload) {
  const message = {
    type: "FOLIO_WORKSPACE_PICKER_RESULT",
    requestId,
    ...payload
  };

  try {
    window.opener?.postMessage(message, "*");
  } catch (error) {
    console.warn("Folio workspace picker could not notify opener", error);
  }
}

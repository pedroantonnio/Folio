const DB_NAME = "folio-db";
const DB_VERSION = 1;
const STORE_NAME = "handles";
export const LEGACY_WORKSPACE_KEY = "workspace-directory";

export function openFolioDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWorkspaceHandle(handle, key = LEGACY_WORKSPACE_KEY) {
  if (!key || typeof key !== "string") throw new Error("Missing workspace key.");
  const db = await openFolioDb();
  await txDone(db, "readwrite", (store) => store.put(handle, key));
  db.close();
}

export async function getWorkspaceHandle(key = LEGACY_WORKSPACE_KEY) {
  if (!key || typeof key !== "string") return null;
  const db = await openFolioDb();
  const value = await txDone(db, "readonly", (store) => store.get(key));
  db.close();
  return value || null;
}

export async function clearWorkspaceHandle(key = LEGACY_WORKSPACE_KEY) {
  if (!key || typeof key !== "string") return;
  const db = await openFolioDb();
  await txDone(db, "readwrite", (store) => store.delete(key));
  db.close();
}

function txDone(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);
    let requestResult;

    request.onsuccess = () => {
      requestResult = request.result;
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(requestResult);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const DB_NAME = "web-note-router";
const STORE_NAME = "handles";
const KEY = "vault";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(handle) {
  const db = await openDatabase();
  await transactionPromise(db, "readwrite", (store) => store.put(handle, KEY));
  db.close();
}

export async function getDirectoryHandle() {
  const db = await openDatabase();
  const handle = await transactionPromise(db, "readonly", (store) => store.get(KEY));
  db.close();
  return handle;
}

function transactionPromise(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function ensureWritePermission(handle, request = false) {
  if (!handle) return false;
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") return true;
  return request && await handle.requestPermission(options) === "granted";
}

export async function appendToMarkdown(rootHandle, relativePath, content) {
  const parts = relativePath.split("/");
  const fileName = parts.pop();
  let directory = rootHandle;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const file = await fileHandle.getFile();
  const writable = await fileHandle.createWritable({ keepExistingData: true });
  await writable.seek(file.size);
  await writable.write(content);
  await writable.close();
}

export async function writeBinaryFile(rootHandle, relativePath, bytes) {
  const parts = relativePath.split("/");
  const fileName = parts.pop();
  let directory = rootHandle;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

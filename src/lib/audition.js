const DB_NAME = "voice-cast-studio-owner-files";
const STORE_NAME = "handles";
const AUDITION_FOLDER_KEY = "audition-image-folder";

const openHandleDatabase = () => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error("このブラウザーでは保存先フォルダーを記憶できません。"));
    return;
  }
  const request = globalThis.indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("保存先情報を開けませんでした。"));
});

const withHandleStore = async (mode, callback) => {
  const database = await openHandleDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = callback(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("保存先情報を更新できませんでした。"));
    });
  } finally {
    database.close();
  }
};

const getSavedDirectoryHandle = async () => {
  try {
    return await withHandleStore("readonly", (store) => store.get(AUDITION_FOLDER_KEY));
  } catch {
    return null;
  }
};

const putSavedDirectoryHandle = (handle) => withHandleStore(
  "readwrite",
  (store) => store.put(handle, AUDITION_FOLDER_KEY)
);

const ensureDirectoryPermission = async (handle, request = false) => {
  if (!handle) return false;
  const options = { mode: "readwrite" };
  if (await handle.queryPermission?.(options) === "granted") return true;
  if (!request) return false;
  return await handle.requestPermission?.(options) === "granted";
};

const decodeBase64File = ({ base64 = "", mimeType = "image/png" }) => {
  const normalized = String(base64 || "").replace(/^data:[^;]+;base64,/, "");
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
};

export const canChooseAuditionImageFolder = () => typeof globalThis.showDirectoryPicker === "function";

export const getAuditionImageFolderStatus = async () => {
  const handle = await getSavedDirectoryHandle();
  return {
    supported: canChooseAuditionImageFolder(),
    selected: Boolean(handle),
    permitted: await ensureDirectoryPermission(handle),
    name: handle?.name || ""
  };
};

export const chooseAuditionImageFolder = async () => {
  if (!canChooseAuditionImageFolder()) {
    throw new Error("このブラウザーではフォルダー指定に対応していません。Chromeで開いてください。");
  }
  const handle = await globalThis.showDirectoryPicker({ mode: "readwrite", id: "voice-cast-studio-audition-images" });
  if (!await ensureDirectoryPermission(handle, true)) throw new Error("保存先フォルダーへの書き込みが許可されませんでした。");
  await putSavedDirectoryHandle(handle);
  return { selected: true, permitted: true, name: handle.name };
};

export const saveAuditionImageFiles = async (files = []) => {
  const handle = await getSavedDirectoryHandle();
  if (!handle) return { saved: false, reason: "not-selected" };
  if (!await ensureDirectoryPermission(handle, true)) return { saved: false, reason: "permission-denied" };
  for (const file of files) {
    if (!file?.fileName || !file?.base64) continue;
    const fileHandle = await handle.getFileHandle(file.fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(decodeBase64File(file));
    await writable.close();
  }
  return { saved: true, folderName: handle.name };
};

export const downloadAuditionImageFiles = (files = []) => {
  files.forEach((file, index) => {
    if (!file?.fileName || !file?.base64) return;
    const href = URL.createObjectURL(decodeBase64File(file));
    globalThis.setTimeout(() => {
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = file.fileName;
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(href), 1000);
    }, index * 180);
  });
};

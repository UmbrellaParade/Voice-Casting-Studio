const BACKUP_DIRECTORY_DB_NAME = "voice-cast-studio-backup-directories";
const BACKUP_DIRECTORY_STORE = "directory-handles";
const BACKUP_DIRECTORY_DB_VERSION = 1;

export const PRODUCTION_BACKUP_DESTINATIONS = Object.freeze({
  pc: "pc",
  drive: "drive"
});

const openBackupDirectoryDb = () => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error("このブラウザでは保存先フォルダーを記憶できません。"));
    return;
  }
  const request = globalThis.indexedDB.open(BACKUP_DIRECTORY_DB_NAME, BACKUP_DIRECTORY_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(BACKUP_DIRECTORY_STORE)) db.createObjectStore(BACKUP_DIRECTORY_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("保存先フォルダーを記憶できませんでした。"));
});

const runDirectoryStoreRequest = async (mode, operation) => {
  const db = await openBackupDirectoryDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(BACKUP_DIRECTORY_STORE, mode);
      const request = operation(transaction.objectStore(BACKUP_DIRECTORY_STORE));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("保存先フォルダーを読み書きできませんでした。"));
      transaction.onabort = () => reject(transaction.error || new Error("保存先フォルダーの保存を中断しました。"));
    });
  } finally {
    db.close();
  }
};

export const canUseProductionBackupDirectories = () => (
  typeof globalThis.showDirectoryPicker === "function" && Boolean(globalThis.indexedDB)
);

export const loadProductionBackupDirectory = async (destination) => {
  if (!globalThis.indexedDB) return null;
  try {
    return await runDirectoryStoreRequest("readonly", (store) => store.get(String(destination || "")));
  } catch {
    return null;
  }
};

export const rememberProductionBackupDirectory = async (destination, handle) => {
  if (!handle) throw new Error("保存先フォルダーが選択されていません。");
  await runDirectoryStoreRequest("readwrite", (store) => store.put(handle, String(destination || "")));
  return handle;
};

export const chooseProductionBackupDirectory = async (destination, startIn = null) => {
  if (typeof globalThis.showDirectoryPicker !== "function") {
    throw new Error("フォルダーへの直接保存はPC版のChromeまたはEdgeで利用できます。");
  }
  const options = {
    id: `voice-cast-studio-backup-${String(destination || "folder")}`,
    mode: "readwrite"
  };
  if (startIn) options.startIn = startIn;
  const handle = await globalThis.showDirectoryPicker(options);
  await rememberProductionBackupDirectory(destination, handle);
  return handle;
};

export const ensureProductionBackupDirectoryPermission = async (handle) => {
  if (!handle) return false;
  const options = { mode: "readwrite" };
  if (typeof handle.queryPermission === "function") {
    const current = await handle.queryPermission(options);
    if (current === "granted") return true;
  }
  if (typeof handle.requestPermission === "function") {
    return (await handle.requestPermission(options)) === "granted";
  }
  return true;
};

const formatLocalTimestamp = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

export const makeProductionBackupFileName = (date = new Date()) => (
  `voice-cast-studio-backup_${formatLocalTimestamp(date)}.json`
);

export const buildProductionBackupJson = (data = {}) => JSON.stringify(data, null, 2);

export const writeProductionBackupFile = async (handle, fileName, content) => {
  if (!handle) throw new Error("保存先フォルダーが未設定です。");
  if (!(await ensureProductionBackupDirectoryPermission(handle))) {
    throw new Error(`${handle.name || "保存先"}への書き込みが許可されていません。`);
  }
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(new Blob([content], { type: "application/json;charset=utf-8" }));
  } finally {
    await writable.close();
  }
  return { fileName, folderName: String(handle.name || "保存先") };
};

export const saveProductionBackupToDirectory = async ({
  data,
  handle,
  date = new Date()
} = {}) => {
  const fileName = makeProductionBackupFileName(date);
  const content = buildProductionBackupJson(data);
  return writeProductionBackupFile(handle, fileName, content);
};

export const saveProductionBackupCopies = async ({
  data,
  pcHandle,
  driveHandle,
  date = new Date()
} = {}) => {
  const fileName = makeProductionBackupFileName(date);
  const content = buildProductionBackupJson(data);
  const destinations = [
    { key: PRODUCTION_BACKUP_DESTINATIONS.pc, label: "PC", handle: pcHandle },
    { key: PRODUCTION_BACKUP_DESTINATIONS.drive, label: "Google Drive", handle: driveHandle }
  ];
  const results = [];
  for (const destination of destinations) {
    if (!destination.handle) {
      results.push({ ...destination, ok: false, error: "保存先が未設定です。" });
      continue;
    }
    try {
      const saved = await writeProductionBackupFile(destination.handle, fileName, content);
      results.push({ ...destination, ...saved, ok: true });
    } catch (error) {
      results.push({ ...destination, ok: false, error: String(error?.message || error) });
    }
  }
  return {
    fileName,
    results,
    ok: results.every((result) => result.ok)
  };
};

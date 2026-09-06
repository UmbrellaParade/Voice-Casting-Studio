import { postToGasEndpoint } from "./gas.js";
import { makeGasPublishedProject } from "./gas-workspace.js";

const CONNECTION_KEY = "voice-casting-studio:gas-owner-connection:v1";
export const OWNER_RECOVERY_KEY = "voice-casting-studio:gas-owner-recovery:v1";

export function readGasOwnerConfiguration(settings = {}, storage = globalThis.localStorage) {
  try {
    const stored = JSON.parse(storage?.getItem(CONNECTION_KEY) || "null");
    if (stored?.endpointUrl && stored?.token) return stored;
  } catch { /* Existing workspace settings are the migration source. */ }
  const endpointUrl = settings.recordingEndpointUrl || settings.responseEndpointUrl || "";
  return endpointUrl && settings.responseSyncToken ? { endpointUrl, token: settings.responseSyncToken,
    folderUrl: settings.recordingDriveFolderUrl || settings.responseDriveFolderUrl || "" } : null;
}

export function validateGasOwnerConfiguration(config) {
  const endpoint = new URL(String(config.endpointUrl || "").trim());
  if (endpoint.origin !== "https://script.google.com" || !/^\/macros\/s\/[\w-]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
    throw new Error("Apps ScriptのWebアプリURL（末尾が /exec）を入力してください。");
  }
  const token = String(config.token || "").trim();
  if (token.length < 16) throw new Error("GASに設定した16文字以上の同期トークンを入力してください。");
  const value = { endpointUrl: endpoint.href, folderUrl: String(config.folderUrl || "").trim(), token };
  return value;
}

export function saveGasOwnerConfiguration(config, storage = globalThis.localStorage) {
  const value = validateGasOwnerConfiguration(config);
  storage.setItem(CONNECTION_KEY, JSON.stringify(value));
  return value;
}

export const prepareGasOwnerData = (data) => ({ ...data,
  settings: Object.fromEntries(Object.entries(data.settings || {}).filter(([key]) => !["responseSyncToken", "openAiApiKey", "elevenLabsApiKey"].includes(key))),
  recordingProjects: (data.recordingProjects || []).map((project) => ({ ...project,
    recordingLineIndex: makeGasPublishedProject(project, data.studioConcept).recordingLineIndex,
    studioConcept: data.studioConcept, recordingProtocol: 2 }))
});

export function createGasOwnerConnection(configuration, { post = postToGasEndpoint, seed = () => null, storage = globalThis.localStorage } = {}) {
  if (!configuration?.endpointUrl || !configuration.token) return null;
  let configurationError = null;
  try { configuration = validateGasOwnerConfiguration(configuration); }
  catch (error) { configurationError = error; }
  let queue = Promise.resolve();
  let version = null;
  let conflicted = false;
  const runtime = { mode: "gas", owner: true, canManage: true, canEditScript: true,
    siteName: "Voice Cast Studio", currentUser: { id: 1, name: "制作オーナー" } };
  const request = (operation, payload = {}) => {
    const pending = queue.catch(() => undefined).then(async () => {
      if (configurationError) throw configurationError;
      const result = await post(configuration.endpointUrl, { ...payload, action: "ownerRequest", operation, token: configuration.token,
        ...(["saveWorkspace", "createAuditionForm", "verifyAuditionForm", "generateAuditionCandidate", "finishAuditionImage"].includes(operation) ? { version } : {}) });
      if (Number.isInteger(result.version)) version = result.version;
      return result;
    });
    queue = pending;
    return pending;
  };
  const hydrate = (result) => ({ ...result, data: result.data ? { ...result.data,
    settings: { ...result.data.settings, responseSyncToken: configuration.token, recordingEndpointUrl: configuration.endpointUrl,
      recordingDriveFolderUrl: result.data.settings?.recordingDriveFolderUrl || configuration.folderUrl } } : null });
  const save = async (data) => {
    if (version === null) throw new Error("共有データの読み込みが完了していません。");
    if (conflicted) throw new Error("別の画面との変更の競合を解決するため、最新データを読み直してください。");
    try { return hydrate(await request("saveWorkspace", { data: prepareGasOwnerData(data) })); }
    catch (error) {
      if (error.code === "workspace_conflict") conflicted = true;
      try { storage?.setItem(OWNER_RECOVERY_KEY, JSON.stringify({ data: prepareGasOwnerData(data), savedAt: new Date().toISOString() })); } catch { /* UI still reports the unsaved state. */ }
      throw error;
    }
  };
  return { runtime, configuration, request, save,
    async load() {
      let result = await request("loadWorkspace");
      if (Number(result.protocolVersion) < 3) throw new Error("GASの管理機能を更新してください。最新版の統合Code.gsが必要です。");
      conflicted = false;
      if (!result.data) {
        const data = seed();
        if (data) result = await save(data);
      }
      return hydrate(result);
    },
    pollProgress: () => request("getOwnerProgress")
  };
}

export async function normalizeAuditionCandidate(result) {
  const image = new Image();
  image.src = `data:${result.mimeType || "image/png"};base64,${result.imageBase64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const ratio = canvas.width / canvas.height;
  let width = image.naturalWidth;
  let height = width / ratio;
  if (height > image.naturalHeight) { height = image.naturalHeight; width = height * ratio; }
  canvas.getContext("2d").drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").split(",")[1];
}

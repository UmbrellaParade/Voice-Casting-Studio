const RECORDING_UI_STORAGE_KEY = "voice-casting-studio:recording-ui:v1";
const RECORDING_STUDIO_TABS = new Set(["board", "script", "cast"]);

export const DEFAULT_RECORDING_BOARD_UI_STATE = Object.freeze({
  selectedChapterId: "",
  selectedSceneId: "",
  selectedCharacterIds: [],
  mode: "assignment",
  includeContext: true,
  query: "",
  statusFilter: "すべて"
});

const resolveStorage = (storage) => {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

const readStoredUi = (storage) => {
  try {
    const raw = resolveStorage(storage)?.getItem(RECORDING_UI_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeStoredUi = (value, storage) => {
  try {
    resolveStorage(storage)?.setItem(RECORDING_UI_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const normalizeRecordingBoardUiState = (value = {}) => ({
  selectedChapterId: String(value.selectedChapterId || ""),
  selectedSceneId: String(value.selectedSceneId || ""),
  selectedCharacterIds: [...new Set(
    (Array.isArray(value.selectedCharacterIds) ? value.selectedCharacterIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  )],
  mode: value.mode === "dialogue" ? "dialogue" : "assignment",
  includeContext: value.includeContext !== false,
  query: String(value.query || "").slice(0, 500),
  statusFilter: String(value.statusFilter || DEFAULT_RECORDING_BOARD_UI_STATE.statusFilter)
});

export const readRecordingBoardUiState = (projectId, storage) => {
  const stored = readStoredUi(storage);
  return normalizeRecordingBoardUiState(stored.boards?.[String(projectId || "")] || {});
};

export const saveRecordingBoardUiState = (projectId, value, storage) => {
  const id = String(projectId || "").trim();
  if (!id) return false;
  const stored = readStoredUi(storage);
  return writeStoredUi({
    ...stored,
    boards: {
      ...(stored.boards && typeof stored.boards === "object" ? stored.boards : {}),
      [id]: normalizeRecordingBoardUiState(value)
    }
  }, storage);
};

export const readRecordingStudioTab = (storage) => {
  const tab = String(readStoredUi(storage).tab || "");
  return RECORDING_STUDIO_TABS.has(tab) ? tab : "board";
};

export const saveRecordingStudioTab = (tab, storage) => {
  const nextTab = RECORDING_STUDIO_TABS.has(tab) ? tab : "board";
  return writeStoredUi({ ...readStoredUi(storage), tab: nextTab }, storage);
};

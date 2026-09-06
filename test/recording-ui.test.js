import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRecordingBoardUiState,
  readRecordingBoardUiState,
  readRecordingStudioTab,
  saveRecordingBoardUiState,
  saveRecordingStudioTab
} from "../src/lib/recording-ui.js";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value))
  };
};

test("normalizes the last recording board interaction", () => {
  assert.deepEqual(normalizeRecordingBoardUiState({
    selectedChapterId: "chapter_2",
    selectedSceneId: "scene_4",
    selectedCharacterIds: ["amemori", "amemori", "vel"],
    mode: "dialogue",
    includeContext: false,
    query: "確認したいセリフ",
    statusFilter: "収録済み"
  }), {
    selectedChapterId: "chapter_2",
    selectedSceneId: "scene_4",
    selectedCharacterIds: ["amemori", "vel"],
    mode: "dialogue",
    includeContext: false,
    query: "確認したいセリフ",
    statusFilter: "収録済み"
  });
});

test("restores recording board controls separately for each project", () => {
  const storage = createStorage();
  saveRecordingStudioTab("cast", storage);
  saveRecordingBoardUiState("project_a", {
    selectedChapterId: "chapter_a",
    selectedCharacterIds: ["vel"],
    includeContext: false
  }, storage);
  saveRecordingBoardUiState("project_b", {
    selectedChapterId: "chapter_b",
    selectedCharacterIds: ["amemori"],
    includeContext: true
  }, storage);

  assert.equal(readRecordingStudioTab(storage), "cast");
  assert.deepEqual(readRecordingBoardUiState("project_a", storage).selectedCharacterIds, ["vel"]);
  assert.equal(readRecordingBoardUiState("project_a", storage).includeContext, false);
  assert.deepEqual(readRecordingBoardUiState("project_b", storage).selectedCharacterIds, ["amemori"]);
  assert.equal(readRecordingBoardUiState("project_b", storage).selectedChapterId, "chapter_b");
});

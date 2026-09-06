import * as wordpress from "./wordpress.js";
import { createGasWorkspaceConnection, getGasShareReference } from "./gas-workspace.js";

const gas = createGasWorkspaceConnection(getGasShareReference());
export const getWorkspaceRuntime = () => wordpress.getWordPressRuntime() || gas?.runtime || null;
const useGas = () => !wordpress.getWordPressRuntime() && Boolean(gas);
export const loadWorkspace = () => useGas() ? gas.load() : wordpress.loadWordPressWorkspace();
export const saveWorkspace = (data) => {
  if (useGas()) throw new Error("声優用URLでは台本全体を変更できません。");
  return wordpress.saveWordPressWorkspace(data);
};
export const updateRecordingLine = (payload) => useGas() ? gas.updateLine(payload) : wordpress.updateWordPressRecordingLine(payload);
export const updateRecordingLines = (payload) => useGas() ? gas.updateLines(payload) : wordpress.updateWordPressRecordingLines(payload);
export const createQuestion = (payload) => useGas() ? gas.createQuestion(payload) : wordpress.createWordPressQuestion(payload);
export const resolveQuestion = (payload) => useGas() ? gas.resolveQuestion(payload) : wordpress.resolveWordPressQuestion(payload);

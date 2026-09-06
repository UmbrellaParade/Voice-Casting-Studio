import * as wordpress from "./wordpress.js";
import { createGasWorkspaceConnection, getGasShareReference } from "./gas-workspace.js";
import { createGasOwnerConnection, readGasOwnerConfiguration } from "./gas-owner.js";

const gas = createGasWorkspaceConnection(getGasShareReference());
let owner = null;
export const initializeGasOwnerWorkspace = (settings, seed) => {
  if (wordpress.getWordPressRuntime() || gas) return;
  owner = createGasOwnerConnection(readGasOwnerConfiguration(settings), { seed });
};
export const getGasOwnerConnection = () => !wordpress.getWordPressRuntime() && !gas ? owner : null;
export const getWorkspaceRuntime = () => wordpress.getWordPressRuntime() || gas?.runtime || owner?.runtime || null;
const useGas = () => !wordpress.getWordPressRuntime() && Boolean(gas);
export const loadWorkspace = () => useGas() ? gas.load() : owner ? owner.load() : wordpress.loadWordPressWorkspace();
export const saveWorkspace = (data) => {
  if (useGas()) throw new Error("声優用URLでは台本全体を変更できません。");
  if (owner) return owner.save(data);
  return wordpress.saveWordPressWorkspace(data);
};
export const updateRecordingLine = (payload) => useGas() ? gas.updateLine(payload) : wordpress.updateWordPressRecordingLine(payload);
export const updateRecordingLines = (payload) => useGas() ? gas.updateLines(payload) : wordpress.updateWordPressRecordingLines(payload);
export const createQuestion = (payload) => useGas() ? gas.createQuestion(payload) : wordpress.createWordPressQuestion(payload);
export const resolveQuestion = (payload) => useGas() ? gas.resolveQuestion(payload) : wordpress.resolveWordPressQuestion(payload);

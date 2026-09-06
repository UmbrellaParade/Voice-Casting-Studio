import * as wordpress from "./wordpress.js";
import { getGasOwnerConnection, getWorkspaceRuntime } from "./workspace.js";
import { normalizeAuditionCandidate } from "./gas-owner.js";
import { makeRecordingShareUrl } from "./recording.js";

export { getWorkspaceRuntime as getWordPressRuntime };
const call = (operation, fallback, payload = {}) => {
  const owner = getGasOwnerConnection();
  if (owner) return owner.request(operation, payload);
  if (getWorkspaceRuntime()?.mode === "gas") return Promise.reject(new Error("この操作は制作オーナー専用です。"));
  return fallback();
};
export const getWordPressAuditionAutomationSettings = () => call("getAuditionSettings", wordpress.getWordPressAuditionAutomationSettings);
export const saveWordPressAuditionAutomationSettings = (settings) => call("saveAuditionSettings", () => wordpress.saveWordPressAuditionAutomationSettings(settings), { settings });
export const verifyWordPressAuditionForm = (payload) => call("verifyAuditionForm", () => wordpress.verifyWordPressAuditionForm(payload), payload);
export const listWordPressAuditionApplicants = (payload) => call("listAuditionApplicants", () => wordpress.listWordPressAuditionApplicants(payload), payload);
export const getWordPressElevenLabsSettings = () => call("getElevenLabsSettings", wordpress.getWordPressElevenLabsSettings);
export const saveWordPressElevenLabsSettings = (settings) => call("saveElevenLabsSettings", () => wordpress.saveWordPressElevenLabsSettings(settings), { settings });
export const generateWordPressElevenLabsSound = (payload) => call("generateElevenLabsSound", () => wordpress.generateWordPressElevenLabsSound(payload), payload);
export const researchWordPressAccent = wordpress.researchWordPressAccent;
export async function createWordPressAuditionForm(payload) {
  const owner = getGasOwnerConnection();
  if (!owner) return call("createAuditionForm", () => wordpress.createWordPressAuditionForm(payload), payload);
  if (!payload.step || payload.step === "form") return owner.request("createAuditionForm", payload);
  const candidate = await owner.request("generateAuditionCandidate", payload);
  const imageBase64 = await normalizeAuditionCandidate(candidate);
  return owner.request("finishAuditionImage", { ...payload, imageBase64 });
}
export const uploadWordPressImage = async (file) => {
  if (!getGasOwnerConnection()) return call("uploadImage", () => wordpress.uploadWordPressImage(file));
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
  return call("uploadImage", () => wordpress.uploadWordPressImage(file), { dataUrl, fileName: file.name });
};
export const makeWordPressMemberShareUrl = (payload) => {
  const owner = getGasOwnerConnection();
  return owner ? makeRecordingShareUrl({ ...payload, endpointUrl: owner.configuration.endpointUrl,
    driveFolderUrl: owner.configuration.folderUrl }) : wordpress.makeWordPressMemberShareUrl(payload);
};

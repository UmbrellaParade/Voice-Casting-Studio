import { getFromGasEndpoint, loadAppConfig, postToGasEndpoint } from "./gas.js";
import { getRecordingDisplayProject, getShareableRecordingProject, readRecordingShareReference } from "./recording.js";

export const GAS_WORKSPACE_PROTOCOL = 2;

export const makeGasPublishedProject = (project, studioConcept) => {
  const shared = getShareableRecordingProject(project);
  return {
    ...shared,
    ...(studioConcept ? { studioConcept } : {}),
    recordingProtocol: GAS_WORKSPACE_PROTOCOL,
    // Only an authenticated owner can publish this index. Actor requests never define ownership.
    recordingLineIndex: Object.fromEntries(getRecordingDisplayProject(project).lines
      .filter((line) => line.derivedFromManualBody)
      .map((line) => [line.id, {
        id: line.id, sourceLineId: line.sourceLineId, characterId: line.characterId,
        chapterId: line.chapterId, sceneId: line.sceneId, kind: line.kind,
        performanceType: line.performanceType
      }]))
  };
};

export const gasProjectSignature = (project) => JSON.stringify({
  ...project, sharedAt: "", updatedAt: "", syncRevision: 0
});

export const createGasWorkspaceConnection = (reference, transport = { get: getFromGasEndpoint, post: postToGasEndpoint, config: loadAppConfig }) => {
  if (!reference) return null;
  let endpointUrl = reference.endpointUrl || "";
  let folder = reference.driveFolderUrl || "";
  let queue = Promise.resolve();
  let latestProject = null;
  let latestRevision = -1;
  const runtime = {
    mode: "gas", canManage: false, canEditScript: false, siteName: "Voice Cast Studio",
    currentUser: { id: 0, name: "声優メンバー", castMemberId: reference.memberId },
    shareAccess: reference, editableCharacterIds: []
  };
  const ready = async () => {
    if (!endpointUrl) {
      const config = await transport.config(import.meta.env?.BASE_URL || "/Voice-Casting-Studio/");
      endpointUrl = config.recordingEndpointUrl || config.formEndpointUrl || "";
      folder ||= config.recordingDriveFolderUrl || "";
    }
    if (!endpointUrl) throw new Error("共有先が設定されていません。制作オーナーから最新の共有URLを受け取ってください。");
  };
  const accept = (result) => {
    if (Number(result.protocolVersion) < GAS_WORKSPACE_PROTOCOL || !result.protocolVersion) {
      throw new Error("GAS受信口の更新が必要です。制作オーナーが最新版のCode.gsを再デプロイしてから、共有を更新してください。");
    }
    const revision = Number(result.project?.syncRevision ?? result.revision ?? 0);
    if (result.project && revision >= latestRevision) {
      latestProject = result.project;
      latestRevision = revision;
    }
    if (result.viewer) {
      runtime.currentUser = { id: 0, name: result.viewer.actorName, castMemberId: result.viewer.id };
      runtime.editableCharacterIds = result.viewer.characterIds || [];
    }
    const currentLine = (line) => !line ? line : latestProject?.derivedLineProgress?.[line.id]
      || latestProject?.lines?.find((item) => item.id === line.id) || line;
    return { ...result, project: latestProject || result.project,
      line: currentLine(result.line),
      ...(result.lines ? { lines: result.lines.map(currentLine) } : {}),
      ...(result.question ? { question: latestProject?.questions?.find((item) => item.id === result.question.id) || result.question } : {})
    };
  };
  const request = (action, payload = {}) => {
    const run = async () => {
      await ready();
      if (payload.projectId && payload.projectId !== reference.projectId) throw new Error("共有対象の作品と一致しません。");
      return accept(await transport.post(endpointUrl, {
        ...payload, action, projectId: reference.projectId, memberId: reference.memberId,
        accessKey: reference.accessKey, driveFolderUrl: folder
      }));
    };
    const pending = queue.catch(() => undefined).then(run);
    queue = pending;
    return pending;
  };
  return {
    runtime,
    async load() {
      await queue.catch(() => undefined);
      await ready();
      const result = accept(await transport.get(endpointUrl, {
        action: "getRecordingProject", projectId: reference.projectId, memberId: reference.memberId,
        key: reference.accessKey, folder
      }));
      return {
        data: { episodes: [], forms: [], responses: [], tracks: [], settings: {},
          recordingProjects: [result.project], studioConcept: result.project.studioConcept },
        version: latestRevision, users: [], currentUser: runtime.currentUser, canManage: false, canEditScript: false
      };
    },
    updateLine: (payload) => request("updateRecordingLine", payload),
    updateLines: (payload) => request("updateRecordingLines", payload),
    createQuestion: (payload) => request("createRecordingQuestion", payload),
    resolveQuestion: (payload) => request("resolveRecordingQuestion", payload)
  };
};

export const getGasShareReference = () => readRecordingShareReference();

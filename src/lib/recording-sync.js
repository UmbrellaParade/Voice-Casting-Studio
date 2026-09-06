export const RECORDING_PROGRESS_FIELDS = [
  "actorStatus", "reviewStatus", "recordingUrl", "recordingFileName",
  "actorNote", "directorNote", "retakeAnnotations"
];

export const normalizeProgressTimes = (value = {}) => Object.fromEntries(
  RECORDING_PROGRESS_FIELDS.filter((key) => typeof value?.[key] === "string")
    .map((key) => [key, value[key]])
);

export const stampProgressPatch = (previous = {}, patch = {}) => {
  const at = patch.updatedAt || new Date().toISOString();
  const times = Object.fromEntries(RECORDING_PROGRESS_FIELDS.map((key) => [
    key, previous.fieldUpdatedAt?.[key] || previous.updatedAt || ""
  ]));
  for (const key of RECORDING_PROGRESS_FIELDS) {
    if (Object.hasOwn(patch, key)) times[key] = patch.fieldUpdatedAt?.[key] || at;
  }
  return { ...patch, fieldUpdatedAt: times };
};

// Merge each field independently: an actor's checkbox must not undo a newer director note.
export const mergeRecordingProgress = (local = {}, remote = {}) => {
  const result = { ...local, fieldUpdatedAt: { ...normalizeProgressTimes(local.fieldUpdatedAt) } };
  for (const key of RECORDING_PROGRESS_FIELDS) {
    if (!Object.hasOwn(remote, key)) continue;
    const localAt = local.fieldUpdatedAt?.[key] || local.updatedAt || "";
    const remoteAt = remote.fieldUpdatedAt?.[key] || remote.updatedAt || "";
    if (Object.hasOwn(local, key) && localAt > remoteAt) continue;
    result[key] = remote[key];
    result.fieldUpdatedAt[key] = remoteAt;
  }
  result.updatedAt = [local.updatedAt || "", remote.updatedAt || ""].sort().at(-1);
  return result;
};

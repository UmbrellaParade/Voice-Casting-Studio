// Private per-installation services. Never include secrets in owner workspace JSON.
const VCS_OWNER_PROTOCOL = 3;
const VCS_OWNER_FILE_PROPERTY = "VCS_OWNER_WORKSPACE_FILE";
const VCS_OWNER_SETTINGS_PROPERTY = "VCS_OWNER_INTEGRATIONS";

function vcsOwnerError_(code, message, data) {
  const error = new Error(message);
  error.code = code;
  error.data = data || {};
  throw error;
}

function vcsOwnerProperties_() { return PropertiesService.getScriptProperties(); }
function vcsOwnerSettings_() {
  return JSON.parse(vcsOwnerProperties_().getProperty(VCS_OWNER_SETTINGS_PROPERTY) || "{}");
}
function vcsOwnerIntegrationValue_(key) { return String(vcsOwnerSettings_()[key] || ""); }
function vcsOwnerSecret_(key) { return vcsOwnerProperties_().getProperty("VCS_SECRET_" + key) || ""; }

function vcsReadOwnerWorkspace_() {
  const id = vcsOwnerProperties_().getProperty(VCS_OWNER_FILE_PROPERTY);
  if (!id) return { revision: 0, data: null };
  const file = DriveApp.getFileById(id);
  // Fail closed if somebody moves/shares this private file outside the application.
  if (file.getSharingAccess() !== DriveApp.Access.PRIVATE || file.getViewers().length || file.getEditors().length) {
    vcsOwnerError_("private_workspace_shared", "管理データのファイルが共有されています。Google Driveで所有者のみの非公開に戻してください。");
  }
  const workspace = JSON.parse(file.getBlob().getDataAsString());
  if (!Number.isInteger(workspace.revision) || !workspace.data) {
    vcsOwnerError_("workspace_invalid", "管理データを読み取れません。バックアップを確認してください。");
  }
  return workspace;
}

function vcsWriteOwnerWorkspace_(workspace) {
  const properties = vcsOwnerProperties_();
  const id = properties.getProperty(VCS_OWNER_FILE_PROPERTY);
  const content = JSON.stringify(workspace);
  if (content.length > 30 * 1024 * 1024) vcsOwnerError_("workspace_too_large", "制作データが大きすぎます。画像はDriveのURLで登録してください。");
  if (id) DriveApp.getFileById(id).setContent(content);
  else {
    // Created in the executing owner's My Drive, never in the publicly shared root.
    const file = DriveApp.createFile("Voice Cast Studio - private workspace.json", content, MimeType.PLAIN_TEXT);
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    properties.setProperty(VCS_OWNER_FILE_PROPERTY, file.getId());
  }
}

function vcsOwnerMergeSharedProgress_(data, publish) {
  const settings = data.settings || {};
  const folder = settings.recordingDriveFolderUrl || settings.responseDriveFolderUrl;
  const shared = (data.recordingProjects || []).filter((project) => project.sharedAt);
  if (!shared.length) return data;
  const root = getRootFolder(folder);
  data.recordingProjects = (data.recordingProjects || []).map((project) => {
    if (!project.sharedAt) return project;
    let existing = null;
    const files = getOrCreateFolder(root, RECORDING_PROJECTS_DIR).getFilesByName(project.id + ".json");
    if (files.hasNext()) existing = readRecordingProject(root, project.id);
    const merged = existing ? vcsMergePublishedProgress(project, existing) : project;
    if (publish) {
      const sharedProject = sanitizeRecordingProject(merged);
      sharedProject.castMembers = merged.castMembers || [];
      sharedProject.recordingLineIndex = merged.recordingLineIndex || {};
      const stored = normalizeRecordingProjectForStorage(sharedProject);
      stored.recordingProtocol = 2;
      stored.syncRevision = Number(existing && existing.syncRevision || 0) + 1;
      writeRecordingProject(root, stored);
      return Object.assign({}, merged, { castMembers: stored.castMembers, syncRevision: stored.syncRevision });
    }
    return merged;
  });
  return data;
}

function vcsOwnerWorkspaceResult_(workspace) {
  return { ok: true, protocolVersion: VCS_OWNER_PROTOCOL, version: workspace.revision,
    data: workspace.data, canManage: true, canEditScript: true, users: [],
    currentUser: { id: 1, name: "制作オーナー" } };
}

function vcsOwnerSaveWorkspace_(request) {
  return vcsWithRecordingLock(function () {
    const current = vcsReadOwnerWorkspace_();
    if (Number(request.version) !== current.revision) {
      vcsOwnerError_("workspace_conflict", "別の画面で制作データが更新されました。入力内容はこのPCに退避しました。最新データを読み直してください。", { version: current.revision });
    }
    const data = JSON.parse(JSON.stringify(request.data || {}));
    if (!Array.isArray(data.recordingProjects) || !data.settings) vcsOwnerError_("workspace_invalid", "制作データの形式が正しくありません。");
    delete data.settings.responseSyncToken;
    delete data.settings.openAiApiKey;
    delete data.settings.elevenLabsApiKey;
    const projects = new Set();
    data.recordingProjects.forEach(function (project) {
      if (!/^[\w-]+$/.test(project.id || "") || projects.has(project.id)) vcsOwnerError_("project_invalid", "作品IDが不正または重複しています。");
      projects.add(project.id);
      const previous = ((current.data || {}).recordingProjects || []).find(function (item) { return item.id === project.id; });
      if (previous) {
        const incoming = project.auditionRoleProgress || [];
        (previous.auditionRoleProgress || []).forEach(function (progress) {
          const index = incoming.findIndex(function (item) { return item.characterId === progress.characterId; });
          if (index < 0) incoming.push(progress);
          else if (String(progress.updatedAt || "") > String(incoming[index].updatedAt || "")) incoming[index] = progress;
        });
        project.auditionRoleProgress = incoming;
      }
    });
    vcsOwnerMergeSharedProgress_(data, true);
    const workspace = { revision: current.revision + 1, data: data, updatedAt: new Date().toISOString() };
    vcsWriteOwnerWorkspace_(workspace);
    return vcsOwnerWorkspaceResult_(workspace);
  });
}

function vcsOwnerSafeSettings_() {
  const settings = vcsOwnerSettings_();
  return { ok: true, protocolVersion: VCS_OWNER_PROTOCOL,
    hasOpenAiKey: Boolean(vcsOwnerSecret_("openai")),
    appsScriptConfigured: Boolean(settings.templateFormId && settings.formsFolderId && settings.imageFolderId),
    model: settings.imageModel || "gpt-image-2", auditModel: settings.auditModel || "gpt-5.6-luna",
    maxImageAttempts: 3, headerSize: "1600x400", socialSize: "1792x1008", headerThemeNeedsManualSelection: true,
    templateFormUrl: settings.templateFormId ? "https://docs.google.com/forms/d/" + settings.templateFormId + "/edit" : "",
    formsFolderUrl: settings.formsFolderId ? "https://drive.google.com/drive/folders/" + settings.formsFolderId : "",
    imageFolderUrl: settings.imageFolderId ? "https://drive.google.com/drive/folders/" + settings.imageFolderId : "",
    logoUrl: settings.logoUrl || "", audiobookUrl: settings.audiobookUrl || "", updatedAt: settings.updatedAt || "" };
}

function vcsOwnerSaveSettings_(request) {
  return vcsWithRecordingLock(function () {
    const settings = vcsOwnerSettings_();
    const values = request.settings || {};
    if (values.openAiApiKey && !/^sk-[\w-]{20,}$/.test(String(values.openAiApiKey).trim())) vcsOwnerError_("openai_key_invalid", "OpenAI APIキーの形式を確認してください。");
    const ids = { templateFormUrl: "templateFormId", formsFolderUrl: "formsFolderId", imageFolderUrl: "imageFolderId" };
    Object.keys(ids).forEach(function (key) {
      if (!(key in values)) return;
      const raw = String(values[key] || "").trim();
      const match = key === "templateFormUrl" ? raw.match(/^https:\/\/docs\.google\.com\/forms\/d\/([\w-]+)\/edit/) : raw.match(/^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/);
      if (!match) vcsOwnerError_("integration_url_invalid", "フォームの編集URL・DriveフォルダーURLを確認してください。");
      if (key === "templateFormUrl") FormApp.openById(match[1]);
      else DriveApp.getFolderById(match[1]).getName();
      settings[ids[key]] = match[1];
    });
    ["logoUrl", "audiobookUrl"].forEach(function (key) {
      if (key in values) {
        const value = String(values[key] || "").trim();
        if (value && !/^https:\/\/[^\s]+$/.test(value)) vcsOwnerError_("integration_url_invalid", "httpsのURLを入力してください。");
        settings[key] = value;
      }
    });
    const properties = vcsOwnerProperties_();
    if (values.clearOpenAiApiKey) properties.deleteProperty("VCS_SECRET_openai");
    if (values.openAiApiKey) properties.setProperty("VCS_SECRET_openai", String(values.openAiApiKey).trim());
    settings.updatedAt = new Date().toISOString();
    properties.setProperty(VCS_OWNER_SETTINGS_PROPERTY, JSON.stringify(settings));
    return vcsOwnerSafeSettings_();
  });
}

function vcsOwnerProviderJson_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({}, options, { muteHttpExceptions: true, followRedirects: false }));
  let result;
  try { result = JSON.parse(response.getContentText()); } catch (error) { result = null; }
  const status = response.getResponseCode();
  if (status < 200 || status >= 300 || !result) {
    vcsOwnerError_("provider_error", status === 401 ? "APIキーを確認してください。" : status === 403 ? "APIキーの権限を確認してください。" : status === 429 ? "APIの利用上限に達しました。残量をご確認ください。" : "外部サービスの処理に失敗しました。", { status: status });
  }
  return result;
}

function vcsOwnerElevenSubscription_(key) {
  return vcsOwnerProviderJson_("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
}

function vcsOwnerElevenSettings_(refresh) {
  const key = vcsOwnerSecret_("elevenlabs");
  let stats = JSON.parse(vcsOwnerProperties_().getProperty("VCS_ELEVEN_STATS") || "{}");
  let warning = "";
  if (key && refresh) {
    try {
      const subscription = vcsOwnerElevenSubscription_(key);
      const reset = subscription.next_character_count_reset_unix || null;
      if (stats.nextResetAt && reset !== stats.nextResetAt) { stats.toolGenerationCount = 0; stats.toolCreditsSpent = 0; }
      stats = Object.assign(stats, { connected: true, tier: subscription.tier, status: subscription.status,
        creditsUsed: subscription.credit_count ?? subscription.character_count ?? null,
        creditLimit: subscription.credit_limit ?? subscription.character_limit ?? null,
        nextResetAt: reset, checkedAt: new Date().toISOString() });
      vcsOwnerProperties_().setProperty("VCS_ELEVEN_STATS", JSON.stringify(stats));
    } catch (error) { warning = error.message; stats.connected = false; }
  }
  return Object.assign({}, stats, { ok: true, hasApiKey: Boolean(key), connected: Boolean(key && stats.connected),
    warning: warning, model: "eleven_text_to_sound_v2", outputFormat: "mp3_44100_128" });
}

function vcsOwnerSaveElevenSettings_(request) {
  const values = request.settings || {};
  const key = String(values.apiKey || "").trim();
  if (key && (key.length < 20 || key.length > 256 || /\s/.test(key))) vcsOwnerError_("elevenlabs_key_invalid", "ElevenLabs APIキーの形式を確認してください。");
  if (key) vcsOwnerElevenSubscription_(key);
  vcsWithRecordingLock(function () {
    const properties = vcsOwnerProperties_();
    if (values.clearApiKey) { properties.deleteProperty("VCS_SECRET_elevenlabs"); properties.deleteProperty("VCS_ELEVEN_STATS"); }
    if (key) {
      if (key !== vcsOwnerSecret_("elevenlabs")) properties.deleteProperty("VCS_ELEVEN_STATS");
      properties.setProperty("VCS_SECRET_elevenlabs", key);
    }
  });
  return vcsOwnerElevenSettings_(true);
}

function vcsOwnerWithLease_(id, callback) {
  const key = "VCS_LEASE_" + id;
  const lease = Utilities.getUuid();
  vcsWithRecordingLock(function () {
    const previous = JSON.parse(vcsOwnerProperties_().getProperty(key) || "{}");
    if (previous.until > Date.now()) vcsOwnerError_("operation_in_progress", "同じ処理を実行中です。しばらくお待ちください。");
    vcsOwnerProperties_().setProperty(key, JSON.stringify({ id: lease, until: Date.now() + 360000 }));
  });
  try { return callback(); } finally {
    vcsWithRecordingLock(function () {
      const current = JSON.parse(vcsOwnerProperties_().getProperty(key) || "{}");
      if (current.id === lease) vcsOwnerProperties_().deleteProperty(key);
    });
  }
}

function vcsOwnerGenerateEleven_(request) {
  if (request.confirmed !== true) vcsOwnerError_("generation_confirmation_required", "クレジットを使用する生成操作を確認してください。");
  const prompt = String(request.prompt || "").trim();
  if (!prompt || Array.from(prompt).length > 450) vcsOwnerError_("prompt_invalid", "プロンプトは450文字以内で入力してください。");
  const key = vcsOwnerSecret_("elevenlabs");
  if (!key) vcsOwnerError_("elevenlabs_key_required", "このオーナーのElevenLabs APIキーを登録してください。");
  return vcsOwnerWithLease_("elevenlabs", function () {
    const duration = Math.max(0.5, Math.min(30, Number(request.durationSeconds) || 5));
    const influence = Number(request.promptInfluence);
    const response = UrlFetchApp.fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
      method: "post", contentType: "application/json", headers: { "xi-api-key": key },
      muteHttpExceptions: true, followRedirects: false,
      payload: JSON.stringify({ text: prompt, duration_seconds: duration, prompt_influence: Number.isFinite(influence) ? Math.max(0, Math.min(1, influence)) : 0.3,
        loop: Boolean(request.loop), model_id: "eleven_text_to_sound_v2" })
    });
    const status = response.getResponseCode();
    if (status < 200 || status >= 300) vcsOwnerError_("elevenlabs_error", status === 429 ? "ElevenLabsの利用枠に達しました。" : "効果音を生成できませんでした。APIキーと権限を確認してください。", { status: status });
    const blob = response.getBlob();
    if (!/^audio\//.test(blob.getContentType()) && blob.getContentType() !== "application/octet-stream") vcsOwnerError_("audio_invalid", "音声データを受け取れませんでした。");
    if (blob.getBytes().length > 8 * 1024 * 1024) vcsOwnerError_("audio_too_large", "音声データの上限を超えました。");
    const headers = response.getAllHeaders();
    const cost = Number(headers["character-cost"] || headers["x-character-cost"] || 0);
    const stats = JSON.parse(vcsOwnerProperties_().getProperty("VCS_ELEVEN_STATS") || "{}");
    stats.toolGenerationCount = Number(stats.toolGenerationCount || 0) + 1;
    stats.toolCreditsSpent = Number(stats.toolCreditsSpent || 0) + cost;
    vcsOwnerProperties_().setProperty("VCS_ELEVEN_STATS", JSON.stringify(stats));
    return { ok: true, audioBase64: Utilities.base64Encode(blob.getBytes()), mimeType: "audio/mpeg",
      fileName: sanitizeName(request.fileName || request.name || "sound-effect", "sound-effect").replace(/\.mp3$/i, "") + ".mp3",
      durationSeconds: duration, creditsUsed: cost, generatedAt: new Date().toISOString(), settings: vcsOwnerElevenSettings_(true) };
  });
}

function vcsHandleOwnerRequest(request) {
  // Also authenticate here so direct invocations cannot bypass the public router.
  requireToken(request.token);
  if (["createAuditionForm", "verifyAuditionForm", "generateAuditionCandidate", "finishAuditionImage"].includes(request.operation)) {
    if (Number(request.version) !== vcsReadOwnerWorkspace_().revision) vcsOwnerError_("workspace_conflict", "別の画面で更新されています。最新の制作データを読み直してください。");
  }
  switch (request.operation) {
    case "getOwnerProgress": return vcsWithRecordingLock(function () {
      const workspace = vcsReadOwnerWorkspace_();
      if (!workspace.data) return { ok: true, projects: [] };
      vcsOwnerMergeSharedProgress_(workspace.data, false);
      return { ok: true, projects: (workspace.data.recordingProjects || []).map(sanitizeRecordingProject) };
    });
    case "loadWorkspace": return vcsWithRecordingLock(function () {
      const workspace = vcsReadOwnerWorkspace_();
      if (workspace.data) vcsOwnerMergeSharedProgress_(workspace.data, false);
      return vcsOwnerWorkspaceResult_(workspace);
    });
    case "saveWorkspace": return vcsOwnerSaveWorkspace_(request);
    case "getAuditionSettings": return vcsOwnerSafeSettings_();
    case "saveAuditionSettings": return vcsOwnerSaveSettings_(request);
    case "getElevenLabsSettings": return vcsOwnerElevenSettings_(true);
    case "saveElevenLabsSettings": return vcsOwnerSaveElevenSettings_(request);
    case "generateElevenLabsSound": return vcsOwnerGenerateEleven_(request);
    case "createAuditionForm": return vcsOwnerCreateAudition_(request);
    case "generateAuditionCandidate": return vcsOwnerGenerateAuditionCandidate_(request);
    case "finishAuditionImage": return vcsOwnerFinishAuditionImage_(request);
    case "verifyAuditionForm": return vcsOwnerCreateAudition_(Object.assign({}, request, { verifyOnly: true }));
    case "listAuditionApplicants": return vcsOwnerListApplicants_(request);
    case "uploadImage": return vcsOwnerUploadImage_(request);
    default: vcsOwnerError_("owner_operation_unknown", "未対応の管理操作です。");
  }
}
function authorizeVoiceCastStudio() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  if (info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
    console.log(info.getAuthorizationUrl());
    return;
  }
  console.log("Voice Cast Studio: required Google permissions are granted.");
}

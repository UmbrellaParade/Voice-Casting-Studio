// Voice Casting Studio 受信口（Google Apps Script）
//
// この1本のWebアプリで以下を担当します。
//   1. 共有フォームからの回答受信（doPost action=submitResponse）
//      - 回答JSONを _responses/ に保存
//      - 音源/画像の添付を募集企画またはフォーム別フォルダーに実ファイルとして保存
//      - スプレッドシート「回答ログ」に1行追記
//   2. ツールの「新着回答を同期」への回答一覧配信（doGet action=listResponses）
//   3. 短いURLフォーム定義の公開/配信（doPost action=publishForm / doGet action=getForm）
//   4. サムネPNGのDrive保存（doPost action=saveThumbnails）
//   5. 台本収録ボードの公開・進捗同期・録音提出
//
// セットアップ手順は docs/google-drive-response-endpoint.md を参照。

// 回答保存先のGoogle DriveフォルダーID（既定値）。
// ツールの設定「回答保存先Google DriveフォルダーURL」を入れると、そちらが優先される。
const FOLDER_ID = "";

// ツールの設定画面「回答同期トークン」と同じ文字列にする（好きな合言葉でOK）
const SECRET_TOKEN = "ここを好きな合言葉に変更";

// このサイズ以下の画像（ゲストアイコンなど）は、Drive保存に加えて回答JSONにも残す。
// サムネ合成でそのまま使えるようにするため。音源はDrive保存のみ。
const INLINE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const RESPONSES_DIR = "_responses";
const FORMS_DIR = "_forms";
const THUMBNAILS_DIR = "サムネ";
const RECORDING_PROJECTS_DIR = "_recording_projects";
const RECORDING_UPLOADS_DIR = "収録提出";
const LOG_SHEET_NAME = "回答ログ";

function jsonOutput(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || (payload.response ? "submitResponse" : payload.type === "thumbnail_bundle" ? "saveThumbnails" : "");
    if (action === "submitResponse") return handleSubmitResponse(payload);
    if (action === "publishForm") {
      requireToken(payload.token);
      return handlePublishForm(payload);
    }
    if (action === "saveThumbnails") {
      requireToken(payload.token);
      return handleSaveThumbnails(payload);
    }
    if (action === "publishRecordingProject") {
      requireToken(payload.token);
      return handlePublishRecordingProject(payload);
    }
    if (action === "updateRecordingLine") return handleUpdateRecordingLine(payload);
    if (action === "updateRecordingLines") return handleUpdateRecordingLines(payload);
    if (action === "createRecordingQuestion") return handleRecordingQuestion(payload, false);
    if (action === "resolveRecordingQuestion") return handleRecordingQuestion(payload, true);
    return jsonOutput({ ok: false, error: "未対応のactionです: " + action });
  } catch (error) {
    return jsonOutput({ ok: false, error: errorMessage(error) });
  }
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || "ping";
    if (action === "ping") return jsonOutput({ ok: true, now: new Date().toISOString() });
    if (action === "getForm") return handleGetForm(params);
    if (action === "submissionStatus") return handleSubmissionStatus(params);
    if (action === "listResponses") {
      requireToken(params.token);
      return handleListResponses(params);
    }
    if (action === "getRecordingProject") return handleGetRecordingProject(params);
    return jsonOutput({ ok: false, error: "未対応のactionです: " + action });
  } catch (error) {
    return jsonOutput({ ok: false, error: errorMessage(error) });
  }
}

function errorMessage(error) {
  return String(error && error.message ? error.message : error);
}

function requireToken(token) {
  if (!SECRET_TOKEN || SECRET_TOKEN.indexOf("ここを") === 0) {
    throw new Error("Apps Script側のSECRET_TOKENが未設定です。Code.gsのSECRET_TOKENを合言葉に変更してください。");
  }
  if (String(token || "") !== SECRET_TOKEN) {
    throw new Error("トークンが一致しません。ツール設定の「回答同期トークン」を確認してください。");
  }
}

function getRootFolder(folderRef) {
  const raw = String(folderRef || "").trim();
  if (raw) {
    // DriveフォルダーURL（.../folders/{ID}）でも生のIDでも受け付ける
    const idMatch = raw.match(/[-\w]{25,}/);
    if (idMatch) {
      try {
        return DriveApp.getFolderById(idMatch[0]);
      } catch (error) {
        throw new Error("指定のDriveフォルダーを開けません。URLと共有設定を確認してください: " + raw);
      }
    }
  }
  if (!FOLDER_ID) {
    throw new Error("保存先Driveフォルダーが未設定です。ツール設定のDriveフォルダーURL、またはCode.gsのFOLDER_IDを設定してください。");
  }
  return DriveApp.getFolderById(FOLDER_ID);
}

function getOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function sanitizeName(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|#\[\]]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Utilities.newBlob(Utilities.base64Decode(match[2]), match[1]);
}

function nowStamp() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd-HHmmss");
}

function todayDateString() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
}

function normalizeSubmissionLimit(value) {
  const limit = Math.floor(Number(value || 0));
  return isFinite(limit) && limit > 0 ? limit : 0;
}

function countSubmittedResponses(root, formId, periodId) {
  const targetFormId = String(formId || "").trim();
  const targetPeriodId = String(periodId || "").trim();
  if (!targetFormId) return 0;
  const responsesFolder = getOrCreateFolder(root, RESPONSES_DIR);
  const files = responsesFolder.getFiles();
  let count = 0;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().slice(-5) !== ".json") continue;
    try {
      const payload = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
      const response = payload.response || {};
      if (String(response.formId || "") !== targetFormId) continue;
      if (targetPeriodId && String(response.periodId || "") !== targetPeriodId) continue;
      count += 1;
    } catch (error) {
      // 壊れたJSONは件数確認から除外
    }
  }
  return count;
}

function enforceSubmissionAvailability(root, payload) {
  const form = payload.form || {};
  const period = payload.period || {};
  const response = payload.response || {};
  const today = todayDateString();
  const dateRules = [
    { label: "フォーム受付期間", startDate: form.receptionStartDate || "", endDate: form.receptionEndDate || "" },
    { label: "応募期間", startDate: period.startDate || "", endDate: period.endDate || "" }
  ];
  for (let i = 0; i < dateRules.length; i += 1) {
    const rule = dateRules[i];
    if (rule.startDate && today < rule.startDate) {
      throw new Error(rule.label + "の開始前です。");
    }
    if (rule.endDate && today > rule.endDate) {
      throw new Error(rule.label + "は終了しています。");
    }
  }

  const limit = normalizeSubmissionLimit(form.submissionLimit);
  if (!limit) return;
  const formId = response.formId || form.id || "";
  const periodId = response.periodId || period.id || "";
  const count = countSubmittedResponses(root, formId, periodId);
  if (count >= limit) {
    throw new Error("応募数の上限に達しています。");
  }
}

// ---- 回答受信 ----

function handleSubmitResponse(payload) {
  const root = getRootFolder(payload.driveFolderUrl || (payload.submission && payload.submission.driveFolderUrl));
  const response = payload.response || {};
  enforceSubmissionAvailability(root, payload);
  const stamp = nowStamp();
  const respondent = sanitizeName(response.respondent, "回答者");
  const projectLabel = sanitizeName(
    (payload.episode && (payload.episode.title || payload.episode.date)) ||
      (payload.form && payload.form.name) ||
      response.episodeId ||
      response.formId ||
      "未分類",
    "未分類"
  );
  const attachmentsFolder = getOrCreateFolder(root, projectLabel);
  const savedFiles = [];
  const savedCache = {}; // 同じ添付がresponse.attachmentsとrawAnswersの両方に入っているため二重保存を防ぐ

  const processAttachment = function (attachment) {
    if (!attachment || !attachment.dataUrl) return attachment;
    const cacheKey = (attachment.fileName || "") + ":" + (attachment.size || 0);
    let saved = savedCache[cacheKey];
    if (!saved) {
      const blob = decodeDataUrl(attachment.dataUrl);
      if (!blob) return attachment;
      const fileName = stamp + "_" + respondent + "_" + sanitizeName(attachment.fileName, "attachment");
      blob.setName(fileName);
      const file = attachmentsFolder.createFile(blob);
      saved = { fileName: fileName, driveUrl: file.getUrl(), driveFileId: file.getId() };
      savedCache[cacheKey] = saved;
      savedFiles.push({ fileName: fileName, url: saved.driveUrl });
    }
    const isSmallImage =
      String(attachment.mimeType || "").indexOf("image/") === 0 &&
      Number(attachment.size || 0) <= INLINE_IMAGE_MAX_BYTES;
    const next = {};
    for (const key in attachment) next[key] = attachment[key];
    next.driveUrl = saved.driveUrl;
    next.driveFileId = saved.driveFileId;
    // 音源などの大きいデータはDrive本体を正とし、JSONからbase64を外して軽くする
    if (!isSmallImage) delete next.dataUrl;
    return next;
  };

  if (Array.isArray(response.attachments)) {
    response.attachments = response.attachments.map(processAttachment);
  }
  if (Array.isArray(response.recordings)) {
    response.recordings = response.recordings.map(processAttachment);
  }
  if (Array.isArray(payload.rawAnswers)) {
    payload.rawAnswers = payload.rawAnswers.map(function (answer) {
      if (!answer) return answer;
      if (answer.attachment) answer.attachment = processAttachment(answer.attachment);
      if (answer.track && answer.track.audio) answer.track.audio = processAttachment(answer.track.audio);
      return answer;
    });
  }

  const responsesFolder = getOrCreateFolder(root, RESPONSES_DIR);
  const jsonName = stamp + "_" + respondent + ".json";
  responsesFolder.createFile(jsonName, JSON.stringify(payload, null, 2), "application/json");

  appendLogRow(root, [
    new Date(),
    response.respondent || "",
    response.formId || "",
    response.episodeId || "",
    response.periodId || "",
    savedFiles.length,
    jsonName
  ]);

  return jsonOutput({ ok: true, savedAs: jsonName, savedFiles: savedFiles, now: new Date().toISOString() });
}

function appendLogRow(root, row) {
  try {
    const files = root.getFilesByName(LOG_SHEET_NAME);
    let spreadsheet;
    if (files.hasNext()) {
      spreadsheet = SpreadsheetApp.open(files.next());
    } else {
      spreadsheet = SpreadsheetApp.create(LOG_SHEET_NAME);
      DriveApp.getFileById(spreadsheet.getId()).moveTo(root);
      spreadsheet.getActiveSheet().appendRow(["受信日時", "回答者", "フォームID", "募集企画ID", "受付設定ID", "添付数", "JSONファイル"]);
    }
    spreadsheet.getActiveSheet().appendRow(row);
  } catch (error) {
    // ログ追記の失敗で回答受信全体を失敗にしない
  }
}

function handleSubmissionStatus(params) {
  const formId = String(params.formId || "").trim();
  if (!formId) throw new Error("formIdがありません。");
  const root = getRootFolder(params.folder);
  const periodId = String(params.periodId || "").trim();
  return jsonOutput({
    ok: true,
    count: countSubmittedResponses(root, formId, periodId),
    now: new Date().toISOString()
  });
}

// ---- 回答一覧配信（ツールの「新着回答を同期」） ----

function handleListResponses(params) {
  const root = getRootFolder(params.folder);
  const responsesFolder = getOrCreateFolder(root, RESPONSES_DIR);
  const since = params.since ? new Date(params.since) : null;
  const items = [];
  const files = responsesFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().slice(-5) !== ".json") continue;
    if (since && file.getDateCreated() <= since) continue;
    try {
      items.push({ name: file.getName(), created: file.getDateCreated(), payload: JSON.parse(file.getBlob().getDataAsString("UTF-8")) });
    } catch (error) {
      // 壊れたJSONはスキップ
    }
  }
  items.sort(function (a, b) {
    return a.created - b.created;
  });
  return jsonOutput({
    ok: true,
    now: new Date().toISOString(),
    responses: items.map(function (item) {
      return item.payload;
    })
  });
}

// ---- フォーム定義の公開/配信（短いURL） ----

function handlePublishForm(payload) {
  const slug = sanitizeName(payload.slug, "");
  if (!slug) throw new Error("slugがありません。");
  if (!payload.payload || !payload.payload.form) throw new Error("フォーム定義がありません。");
  const root = getRootFolder();
  const formsFolder = getOrCreateFolder(root, FORMS_DIR);
  const fileName = slug + ".json";
  const content = JSON.stringify(payload.payload, null, 2);
  const existing = formsFolder.getFilesByName(fileName);
  if (existing.hasNext()) {
    existing.next().setContent(content);
  } else {
    formsFolder.createFile(fileName, content, "application/json");
  }
  return jsonOutput({ ok: true, slug: slug, now: new Date().toISOString() });
}

function handleGetForm(params) {
  const slug = sanitizeName(params.slug, "");
  if (!slug) throw new Error("slugがありません。");
  const root = getRootFolder();
  const formsFolder = getOrCreateFolder(root, FORMS_DIR);
  const files = formsFolder.getFilesByName(slug + ".json");
  if (!files.hasNext()) throw new Error("このslugのフォームは公開されていません: " + slug);
  const payload = JSON.parse(files.next().getBlob().getDataAsString("UTF-8"));
  return jsonOutput({ ok: true, payload: payload });
}

// ---- 台本収録ボード ----

function getRecordingProjectFile(root, projectId) {
  const safeId = sanitizeName(projectId, "");
  if (!safeId) throw new Error("収録プロジェクトIDがありません。");
  const folder = getOrCreateFolder(root, RECORDING_PROJECTS_DIR);
  const files = folder.getFilesByName(safeId + ".json");
  if (!files.hasNext()) throw new Error("共有された収録プロジェクトが見つかりません。管理者に共有更新を依頼してください。");
  return files.next();
}

function readRecordingProject(root, projectId) {
  return JSON.parse(getRecordingProjectFile(root, projectId).getBlob().getDataAsString("UTF-8"));
}

function writeRecordingProject(root, project) {
  const safeId = sanitizeName(project.id, "");
  if (!safeId) throw new Error("収録プロジェクトIDがありません。");
  const folder = getOrCreateFolder(root, RECORDING_PROJECTS_DIR);
  const fileName = safeId + ".json";
  const content = JSON.stringify(project, null, 2);
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(fileName, content, "application/json");
  }
}

function findRecordingViewer(project, memberId, accessKey) {
  if (!memberId || !accessKey) throw new Error("共有URLの認証情報がありません。");
  const members = Array.isArray(project.castMembers) ? project.castMembers : [];
  const viewer = members.filter(function (member) {
    return String(member.id || "") === String(memberId || "") &&
      String(member.accessKey || "") === String(accessKey || "");
  })[0];
  if (!viewer) throw new Error("共有URLが無効か、アクセスキーが更新されています。管理者から最新URLを受け取ってください。");
  return viewer;
}

function sanitizeRecordingProject(project) {
  const copy = {};
  ["id", "episodeId", "title", "description", "scriptVersion", "status", "recordingDeadline", "recordingDeadlineTime",
    "releaseDate", "releaseTime", "editingStatus", "characters", "recordingFolderOrder", "castMembers", "lines",
    "derivedLineProgress", "materials", "requiredMaterials", "dismissedRequiredMaterialKeys", "materialSourceSites",
    "requiredMaterialFolderUrl", "requiredMaterialChapterFolders", "questions", "deletedQuestionIds", "tasks", "sharedLinks", "sharedLinkOrder",
    "announcements", "scheduleItems", "deadlineItems", "studioConcept", "sharedAt", "updatedAt", "syncRevision"
  ].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(project, key)) copy[key] = JSON.parse(JSON.stringify(project[key]));
  });
  copy.castMembers = (copy.castMembers || []).map(function (member) {
    return {
      id: member.id || "",
      actorName: member.actorName || "",
      contactName: member.contactName || "",
      contactHonorific: member.contactHonorific || "さん",
      socialUrl: member.socialUrl || "",
      characterIds: member.characterIds || []
    };
  });
  return copy;
}

function sanitizeRecordingViewer(viewer) {
  return {
    id: viewer.id || "",
    actorName: viewer.actorName || "",
    characterIds: viewer.characterIds || []
  };
}

function normalizeRecordingProjectForStorage(project) {
  if (!project || !project.id) throw new Error("収録プロジェクトがありません。");
  const copy = JSON.parse(JSON.stringify(project));
  copy.characters = Array.isArray(copy.characters) ? copy.characters : [];
  copy.castMembers = (Array.isArray(copy.castMembers) ? copy.castMembers : []).map(function (member) {
    const next = member || {};
    if (!next.accessKey) next.accessKey = Utilities.getUuid().replace(/-/g, "");
    next.characterIds = Array.isArray(next.characterIds) ? next.characterIds : [];
    return next;
  });
  copy.lines = Array.isArray(copy.lines) ? copy.lines : [];
  copy.updatedAt = new Date().toISOString();
  return copy;
}

function mergeExistingRecordingProgress(incoming, existing) {
  if (!existing || !Array.isArray(existing.lines)) return incoming;
  const existingById = {};
  existing.lines.forEach(function (line) {
    existingById[line.id] = line;
  });
  incoming.lines = incoming.lines.map(function (line) {
    const saved = existingById[line.id];
    if (!saved) return line;
    return Object.assign({}, line, {
      actorStatus: saved.actorStatus || line.actorStatus,
      reviewStatus: saved.reviewStatus || line.reviewStatus,
      recordingUrl: saved.recordingUrl || line.recordingUrl,
      recordingFileName: saved.recordingFileName || line.recordingFileName,
      actorNote: saved.actorNote || line.actorNote,
      directorNote: saved.directorNote || line.directorNote,
      updatedAt: saved.updatedAt || line.updatedAt
    });
  });
  return incoming;
}

const VCS_PROGRESS_FIELDS = ["actorStatus", "reviewStatus", "recordingUrl", "recordingFileName", "actorNote", "directorNote", "retakeAnnotations"];

function vcsWithRecordingLock(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error("別の保存処理が進行中です。少し待って再試行してください。");
  try { return callback(); } finally { lock.releaseLock(); }
}

function vcsMergeProgress(incoming, existing) {
  const result = Object.assign({}, incoming);
  result.fieldUpdatedAt = Object.assign({}, incoming.fieldUpdatedAt || {});
  VCS_PROGRESS_FIELDS.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(existing, key)) return;
    const incomingAt = (incoming.fieldUpdatedAt || {})[key] || incoming.updatedAt || "";
    const existingAt = (existing.fieldUpdatedAt || {})[key] || existing.updatedAt || "";
    if (Object.prototype.hasOwnProperty.call(incoming, key) && incomingAt > existingAt) return;
    result[key] = existing[key];
    result.fieldUpdatedAt[key] = existingAt;
  });
  result.updatedAt = [incoming.updatedAt || "", existing.updatedAt || ""].sort().pop();
  return result;
}

function vcsMergePublishedProgress(incoming, existing) {
  const oldLines = {};
  (existing.lines || []).forEach(function (line) { oldLines[line.id] = line; });
  incoming.lines = (incoming.lines || []).map(function (line) { return oldLines[line.id] ? vcsMergeProgress(line, oldLines[line.id]) : line; });
  const progress = Object.assign({}, incoming.derivedLineProgress || {});
  Object.keys(existing.derivedLineProgress || {}).forEach(function (id) {
    if (!Object.prototype.hasOwnProperty.call(incoming.recordingLineIndex || {}, id)) return;
    progress[id] = vcsMergeProgress(progress[id] || existing.derivedLineProgress[id], existing.derivedLineProgress[id]);
  });
  incoming.derivedLineProgress = progress;
  const questions = {};
  const deleted = {};
  (incoming.deletedQuestionIds || []).concat(existing.deletedQuestionIds || []).forEach(function (id) { deleted[id] = true; });
  (incoming.questions || []).forEach(function (question) { questions[question.id] = question; });
  (existing.questions || []).forEach(function (question) {
    if (!questions[question.id] || String(question.updatedAt || "") >= String(questions[question.id].updatedAt || "")) questions[question.id] = question;
  });
  incoming.questions = Object.keys(questions).filter(function (id) { return !deleted[id]; }).map(function (id) { return questions[id]; });
  incoming.deletedQuestionIds = Object.keys(deleted);
  return incoming;
}

function handlePublishRecordingProject(payload) {
  requireToken(payload.token);
  return vcsWithRecordingLock(function () {
    const root = getRootFolder(payload.driveFolderUrl);
    let project = normalizeRecordingProjectForStorage(payload.project);
    if (project.recordingProtocol !== 2 || !project.recordingLineIndex) throw new Error("最新版のツールから共有を更新してください。");
    const sourceIds = {};
    project.lines.forEach(function (line) { if (line.manualBody) sourceIds[line.id] = true; });
    const characterIds = project.characters.map(function (character) { return character.id; });
    const index = {};
    Object.keys(project.recordingLineIndex).forEach(function (id) {
      const line = project.recordingLineIndex[id] || {};
      if (id.indexOf("derived_line_") !== 0 || !sourceIds[line.sourceLineId]) throw new Error("章本文のセリフ対応表が不正です。台本を確認してください。");
      if (line.characterId && characterIds.indexOf(line.characterId) < 0) throw new Error("セリフの担当役が見つかりません。");
      index[id] = { id: id, sourceLineId: line.sourceLineId, characterId: line.characterId || "", kind: line.kind,
        chapterId: line.chapterId, sceneId: line.sceneId, performanceType: line.performanceType, derivedFromManualBody: true };
    });
    project.recordingLineIndex = index;
    // A missing file is a first publication; parsing/access errors must not overwrite existing data.
    const directory = getOrCreateFolder(root, RECORDING_PROJECTS_DIR);
    const files = directory.getFilesByName(sanitizeName(project.id, "") + ".json");
    let existing = null;
    if (files.hasNext()) existing = JSON.parse(files.next().getBlob().getDataAsString("UTF-8"));
    if (existing) project = vcsMergePublishedProgress(project, existing);
    project.syncRevision = Number(existing && existing.syncRevision || 0) + 1;
    project.sharedAt = new Date().toISOString();
    project.updatedAt = project.sharedAt;
    writeRecordingProject(root, project);
    return jsonOutput({ ok: true, protocolVersion: 2, projectId: project.id, project: sanitizeRecordingProject(project), now: project.sharedAt });
  });
}

function vcsResolveStoredLine(project, lineId) {
  const stored = (project.lines || []).filter(function (line) { return line.id === lineId; })[0];
  if (stored && !stored.manualBody) return { line: stored, derived: false };
  const index = project.recordingLineIndex || {};
  if (!Object.prototype.hasOwnProperty.call(index, lineId)) throw new Error("セリフの共有情報がありません。制作オーナーが共有内容を更新してください。");
  const context = index[lineId];
  const line = Object.assign({ actorStatus: "未収録", reviewStatus: "未確認", actorNote: "", directorNote: "" },
    (project.derivedLineProgress || {})[lineId] || {}, context);
  return { line: line, derived: true };
}

function vcsRecordingIdentity(project, payload) {
  if (payload.token) { requireToken(payload.token); return null; }
  return findRecordingViewer(project, payload.memberId, payload.accessKey);
}

function vcsApplyRecordingPatch(project, resolved, patch, viewer, now) {
  const line = resolved.line;
  if (viewer && (viewer.characterIds || []).indexOf(line.characterId) < 0) throw new Error("このセリフは担当外のため変更できません。");
  const allowed = viewer ? ["actorStatus", "recordingUrl", "recordingFileName", "actorNote"] : VCS_PROGRESS_FIELDS;
  const times = {};
  VCS_PROGRESS_FIELDS.forEach(function (key) { times[key] = (line.fieldUpdatedAt || {})[key] || line.updatedAt || ""; });
  allowed.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
    if (key === "actorStatus" && ["未収録", "収録済み", "再提出済み"].indexOf(patch[key]) < 0) throw new Error("収録状態が不正です。");
    if (key === "reviewStatus" && ["未確認", "確認中", "OK", "リテイク", "保留"].indexOf(patch[key]) < 0) throw new Error("確認状態が不正です。");
    line[key] = key === "retakeAnnotations" ? (Array.isArray(patch[key]) ? patch[key].slice(0, 20) : []) : String(patch[key] == null ? "" : patch[key]).slice(0, 12000);
    times[key] = now;
  });
  line.fieldUpdatedAt = times;
  line.updatedAt = now;
  if (resolved.derived) {
    project.derivedLineProgress = project.derivedLineProgress || {};
    project.derivedLineProgress[line.id] = line;
  }
  return line;
}

function handleUpdateRecordingLine(payload) {
  return handleUpdateRecordingLines(Object.assign({}, payload, { updates: [{ lineId: payload.lineId, patch: payload.patch || {} }] }));
}

function handleUpdateRecordingLines(payload) {
  return vcsWithRecordingLock(function () {
    const root = getRootFolder(payload.driveFolderUrl);
    const project = readRecordingProject(root, payload.projectId);
    const viewer = vcsRecordingIdentity(project, payload);
    const updates = payload.updates;
    if (!Array.isArray(updates) || !updates.length || updates.length > 2000) throw new Error("更新するセリフ数が不正です。");
    const now = new Date().toISOString();
    const lines = updates.map(function (update) {
      return vcsApplyRecordingPatch(project, vcsResolveStoredLine(project, String(update.lineId || "")),
        update.patch || { actorStatus: payload.actorStatus }, viewer, now);
    });
    project.syncRevision = Number(project.syncRevision || 0) + 1;
    project.updatedAt = now;
    writeRecordingProject(root, project);
    return jsonOutput({ ok: true, protocolVersion: 2, line: lines[0], lines: lines, count: lines.length,
      project: sanitizeRecordingProject(project), viewer: viewer ? sanitizeRecordingViewer(viewer) : null, now: now });
  });
}

function handleRecordingQuestion(payload, resolve) {
  return vcsWithRecordingLock(function () {
    const root = getRootFolder(payload.driveFolderUrl);
    const project = readRecordingProject(root, payload.projectId);
    const viewer = vcsRecordingIdentity(project, payload);
    if (!viewer) throw new Error("質問者の共有URLから操作してください。");
    project.questions = Array.isArray(project.questions) ? project.questions : [];
    const now = new Date().toISOString();
    let question;
    if (resolve) {
      question = project.questions.filter(function (item) { return item.id === payload.questionId; })[0];
      if (!question || question.castMemberId !== viewer.id || question.status !== "回答済み" || !String(question.answer || "").trim()) throw new Error("回答済みの質問は質問者だけが解決にできます。");
      question.status = "解決済み";
      question.updatedAt = now;
    } else {
      const body = String(payload.body || "").trim();
      if (!body || body.length > 12000) throw new Error("質問は1〜12000文字で入力してください。");
      const parent = payload.parentQuestionId ? project.questions.filter(function (item) { return item.id === payload.parentQuestionId; })[0] : null;
      if (payload.parentQuestionId && (!parent || parent.castMemberId !== viewer.id)) throw new Error("元の質問が見つからないか質問者が異なります。");
      const line = payload.lineId ? vcsResolveStoredLine(project, payload.lineId).line : null;
      question = { id: "question_" + Utilities.getUuid(), body: body, authorName: viewer.actorName,
        castMemberId: viewer.id, wpUserId: 0, lineId: line ? line.id : "", characterId: line ? line.characterId : "",
        parentQuestionId: parent ? parent.id : "", answer: "", status: "未回答", createdAt: now, updatedAt: now };
      project.questions.unshift(question);
    }
    project.syncRevision = Number(project.syncRevision || 0) + 1;
    project.updatedAt = now;
    writeRecordingProject(root, project);
    return jsonOutput({ ok: true, protocolVersion: 2, question: question, project: sanitizeRecordingProject(project), viewer: sanitizeRecordingViewer(viewer), now: now });
  });
}

function handleLegacyPublishRecordingProject(payload) {
  const root = getRootFolder(payload.driveFolderUrl);
  let project = normalizeRecordingProjectForStorage(payload.project);
  try {
    project = mergeExistingRecordingProgress(project, readRecordingProject(root, project.id));
  } catch (error) {
    // 初回公開時は既存ファイルがないため、そのまま新規作成する
  }
  project.sharedAt = new Date().toISOString();
  project.updatedAt = project.sharedAt;
  writeRecordingProject(root, project);
  return jsonOutput({ ok: true, projectId: project.id, now: project.sharedAt });
}

function handleGetRecordingProject(params) {
  const root = getRootFolder(params.folder);
  const project = readRecordingProject(root, params.projectId);
  let viewer = null;
  if (params.token) {
    requireToken(params.token);
  } else {
    viewer = findRecordingViewer(project, params.memberId, params.key);
  }
  return jsonOutput({
    ok: true,
    protocolVersion: 2,
    project: sanitizeRecordingProject(project),
    viewer: viewer ? sanitizeRecordingViewer(viewer) : null,
    now: new Date().toISOString()
  });
}

function saveRecordingAttachment(root, project, viewer, line, attachment) {
  if (!attachment || !attachment.dataUrl) return null;
  const maxBytes = 25 * 1024 * 1024;
  if (Number(attachment.size || 0) > maxBytes) {
    throw new Error("録音ファイルは25MB以下にしてください。大きい場合はDrive共有URLを使ってください。");
  }
  const mimeType = String(attachment.mimeType || "");
  if (mimeType && mimeType.indexOf("audio/") !== 0) {
    throw new Error("録音ファイルはMP3、WAV、M4Aなどの音声形式にしてください。");
  }
  const blob = decodeDataUrl(attachment.dataUrl);
  if (!blob) throw new Error("録音ファイルを読み取れませんでした。");
  const uploads = getOrCreateFolder(root, RECORDING_UPLOADS_DIR);
  const projectFolder = getOrCreateFolder(uploads, sanitizeName(project.title || project.id, "収録プロジェクト"));
  const character = (project.characters || []).filter(function (item) {
    return item.id === line.characterId;
  })[0];
  const owner = viewer ? viewer.actorName : character && character.name;
  const ownerFolder = getOrCreateFolder(projectFolder, sanitizeName(owner, "提出録音"));
  const fileName = nowStamp() + "_" + sanitizeName(attachment.fileName, "recording");
  blob.setName(fileName);
  const file = ownerFolder.createFile(blob);
  return { url: file.getUrl(), fileName: fileName };
}

function handleLegacyUpdateRecordingLine(payload) {
  const root = getRootFolder(payload.driveFolderUrl);
  const project = readRecordingProject(root, payload.projectId);
  const lines = Array.isArray(project.lines) ? project.lines : [];
  const line = lines.filter(function (item) {
    return String(item.id || "") === String(payload.lineId || "");
  })[0];
  if (!line) throw new Error("対象のセリフが見つかりません。");

  let viewer = null;
  let isAdmin = false;
  if (payload.token) {
    requireToken(payload.token);
    isAdmin = true;
  } else {
    viewer = findRecordingViewer(project, payload.memberId, payload.accessKey);
    if ((viewer.characterIds || []).indexOf(line.characterId) < 0) {
      throw new Error("このセリフは担当外のため変更できません。");
    }
  }

  const patch = payload.patch || {};
  const allowedActorFields = ["actorStatus", "recordingUrl", "recordingFileName", "actorNote"];
  const allowedAdminFields = allowedActorFields.concat(["reviewStatus", "directorNote", "retakeAnnotations"]);
  const allowed = isAdmin ? allowedAdminFields : allowedActorFields;
  allowed.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
    if (key === "retakeAnnotations") {
      line[key] = (Array.isArray(patch[key]) ? patch[key] : []).slice(0, 20).map(function (instruction, index) {
        const item = instruction || {};
        return {
          id: String(item.id || "retake_instruction_" + (index + 1)),
          quote: String(item.quote || "").slice(0, 500),
          start: Number.isFinite(Number(item.start)) ? Number(item.start) : -1,
          end: Number.isFinite(Number(item.end)) ? Number(item.end) : -1,
          category: String(item.category || "その他").slice(0, 40),
          instruction: String(item.instruction || "").slice(0, 2000),
          reading: String(item.reading || "").slice(0, 160),
          accentType: item.accentType === null ? null : Number(item.accentType || 0),
          createdAt: String(item.createdAt || ""),
          updatedAt: String(item.updatedAt || "")
        };
      });
      return;
    }
    line[key] = String(patch[key] || "");
  });

  const validActorStatuses = ["未収録", "収録済み", "再提出済み"];
  const validReviewStatuses = ["未確認", "確認中", "OK", "リテイク", "保留"];
  if (validActorStatuses.indexOf(line.actorStatus) < 0) line.actorStatus = "未収録";
  if (validReviewStatuses.indexOf(line.reviewStatus) < 0) line.reviewStatus = "未確認";

  const savedAttachment = saveRecordingAttachment(root, project, viewer, line, payload.recordingAttachment);
  if (savedAttachment) {
    line.recordingUrl = savedAttachment.url;
    line.recordingFileName = savedAttachment.fileName;
    line.actorStatus = line.reviewStatus === "リテイク" ? "再提出済み" : "収録済み";
  }

  line.updatedAt = new Date().toISOString();
  project.updatedAt = line.updatedAt;
  writeRecordingProject(root, project);
  return jsonOutput({
    ok: true,
    project: sanitizeRecordingProject(project),
    viewer: viewer ? sanitizeRecordingViewer(viewer) : null,
    savedRecording: savedAttachment,
    now: line.updatedAt
  });
}

// ---- サムネPNG保存 ----

function handleSaveThumbnails(payload) {
  const root = getRootFolder(payload.driveFolderUrl);
  const folder = getOrCreateFolder(root, THUMBNAILS_DIR);
  const stamp = nowStamp();
  const prefix = sanitizeName(payload.episodeDate || "", "") || stamp;
  const savedFiles = [];
  (payload.images || []).forEach(function (image, index) {
    const blob = decodeDataUrl(image.dataUrl);
    if (!blob) return;
    const fileName = prefix + "_" + sanitizeName(image.fileName, "thumbnail-" + (index + 1) + ".png");
    blob.setName(fileName);
    const file = folder.createFile(blob);
    savedFiles.push({ fileName: fileName, url: file.getUrl() });
  });
  if (!savedFiles.length) throw new Error("保存できる画像がありませんでした。");
  return jsonOutput({ ok: true, savedFiles: savedFiles, now: new Date().toISOString() });
}

// Voice Casting Studio 受信口（Google Apps Script）
//
// この1本のWebアプリで以下を担当します。
//   1. 公開フォームからの応募受信（doPost action=submitResponse）
//      - 応募JSONを _responses/ に保存
//      - 録音物/画像を募集フォルダーに実ファイルとして保存
//      - スプレッドシート「応募ログ」に1行追記
//   2. ツールの「新着応募を同期」への応募一覧配信（doGet action=listResponses）
//   3. 短いURLフォーム定義の公開/配信（doPost action=publishForm / doGet action=getForm）
//   4. 公開フォーム側の応募数確認（doGet action=submissionStatus）

// 既定の回答保存先Google DriveフォルダーID。
// ツール側でDriveフォルダーURLを指定した場合は、そちらが優先されます。
const FOLDER_ID = "ここに既定のGoogle DriveフォルダーIDを入れる";

// ツールの設定画面「回答同期トークン」と同じ文字列にします。
const SECRET_TOKEN = "ここを好きな合言葉に変更";

const INLINE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const RESPONSES_DIR = "_responses";
const FORMS_DIR = "_forms";
const LOG_SHEET_NAME = "応募ログ";

function jsonOutput(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || (payload.response ? "submitResponse" : "");
    if (action === "submitResponse") return handleSubmitResponse(payload);
    if (action === "publishForm") {
      requireToken(payload.token);
      return handlePublishForm(payload);
    }
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
    const idMatch = raw.match(/[-\w]{25,}/);
    if (idMatch) {
      try {
        return DriveApp.getFolderById(idMatch[0]);
      } catch (error) {
        throw new Error("指定のDriveフォルダーを開けません。URLと共有設定を確認してください: " + raw);
      }
    }
  }
  if (!FOLDER_ID || FOLDER_ID.indexOf("ここに") === 0) {
    throw new Error("Apps Script側のFOLDER_IDが未設定です。既定のDriveフォルダーIDを入れてください。");
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
      // 壊れたJSONは件数確認から除外します。
    }
  }
  return count;
}

function enforceSubmissionAvailability(root, payload) {
  const form = payload.form || {};
  const period = payload.period || {};
  const response = payload.response || {};
  if (form.status && form.status !== "受付中") throw new Error("フォームは現在受付中ではありません。");
  if (period.status && period.status !== "受付中") throw new Error("応募期間は現在受付中ではありません。");

  const today = todayDateString();
  const dateRules = [
    { label: "フォーム受付期間", startDate: form.receptionStartDate || "", endDate: form.receptionEndDate || "" },
    { label: "応募期間", startDate: period.startDate || "", endDate: period.endDate || "" }
  ];
  for (let i = 0; i < dateRules.length; i += 1) {
    const rule = dateRules[i];
    if (rule.startDate && today < rule.startDate) throw new Error(rule.label + "の開始前です。");
    if (rule.endDate && today > rule.endDate) throw new Error(rule.label + "は終了しています。");
  }

  const limit = normalizeSubmissionLimit(form.submissionLimit);
  if (!limit) return;
  const count = countSubmittedResponses(root, response.formId || form.id || "", response.periodId || period.id || "");
  if (count >= limit) throw new Error("応募数の上限に達しています。");
}

function handleSubmitResponse(payload) {
  const root = getRootFolder(payload.driveFolderUrl || (payload.submission && payload.submission.driveFolderUrl));
  enforceSubmissionAvailability(root, payload);

  const response = payload.response || {};
  const period = payload.period || {};
  const form = payload.form || {};
  const stamp = nowStamp();
  const respondent = sanitizeName(response.respondent, "応募者");
  const folderLabel = sanitizeName(period.title || form.name || "未分類", "未分類");
  const attachmentsFolder = getOrCreateFolder(root, folderLabel);
  const savedFiles = [];
  const savedCache = {};

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
    if (!isSmallImage) delete next.dataUrl;
    return next;
  };

  if (Array.isArray(response.attachments)) {
    response.attachments = response.attachments.map(processAttachment);
  }
  if (Array.isArray(payload.rawAnswers)) {
    payload.rawAnswers = payload.rawAnswers.map(function (answer) {
      if (!answer) return answer;
      if (answer.attachment) answer.attachment = processAttachment(answer.attachment);
      return answer;
    });
  }

  const responsesFolder = getOrCreateFolder(root, RESPONSES_DIR);
  const jsonName = stamp + "_" + respondent + ".json";
  responsesFolder.createFile(jsonName, JSON.stringify(payload, null, 2), "application/json");

  appendLogRow(root, [
    new Date(),
    response.respondent || "",
    form.name || response.formId || "",
    period.title || response.periodId || "",
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
      spreadsheet.getActiveSheet().appendRow(["受信日時", "応募者", "フォーム", "応募期間", "添付数", "JSONファイル"]);
    }
    spreadsheet.getActiveSheet().appendRow(row);
  } catch (error) {
    // ログ追記の失敗で応募受信全体を失敗にしません。
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
      // 壊れたJSONはスキップします。
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

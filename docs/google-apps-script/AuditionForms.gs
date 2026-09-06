/**
 * Standalone Apps Script web app for Voice Cast Studio audition forms.
 *
 * Before deployment, replace the secret placeholder below. Deploy as a web
 * app that executes as the owner and can be accessed by anyone. The shared
 * secret is still required for every request.
 */
const VCS_AUDITION_SECRET = "__VCS_AUDITION_SECRET__";
const VCS_AUDITION_TEMPLATE_FORM_ID = "1-xfkPZchzQDyAjJUVcfxODw8Cjd61pHaqkv1UyLWSkY";
const VCS_AUDITION_FORMS_FOLDER_ID = "1LR58DIiMLNu5BaOEVBvYwQrxC9ffDudS";
const VCS_AUDITION_IMAGE_FOLDER_ID = "11uxFA2aHVaKv99sRq7yXJKiR5blVn_s9";
const VCS_AUDITION_TIME_ZONE = "Asia/Tokyo";
const VCS_AUDITION_DEADLINE_PROPERTY_PREFIX = "VCS_AUDITION_DEADLINE_";
const VCS_AUDITION_DEADLINE_TRIGGER_HANDLER = "vcsCloseExpiredAuditionForms";
const VCS_AUDITION_EARLY_CLOSING_NOTICE = "※応募状況により、予定より早く募集を締め切る場合があります。";
const VCS_AUDITION_CLOSED_MESSAGE = "このオーディションの応募受付は終了しました。ご応募ありがとうございました。";

const VCS_AUDITION_CONSENT_TITLE = "今回ご提出いただく収録音声を、ボイスドラマ本編に加え、同作品をアニメ化する際にも使用することに同意いただけますか？";
const VCS_AUDITION_CONSENT_CHOICE = "上記の内容を確認し、使用に同意します";
const VCS_AUDITION_NAME_TITLE = "お名前（SNS名）をご記入ください";
const VCS_AUDITION_X_TITLE = "Xのアカウントをお書きください";
const VCS_AUDITION_FOLLOW_TITLE = "べるぼのアカウントのフォローをお願いします。";
const VCS_AUDITION_FOLLOW_CHOICE = "フォローしました";
const VCS_AUDITION_UPLOAD_TITLE = "こちらから音声データを提出してください。";
const VCS_AUDITION_AUDIOBOOK_URL = "https://youtu.be/Dt5xU3rGed8";
const VCS_AUDITION_AUDIOBOOK_NOTICE = [
  "【参考オーディオブック】",
  "作品全体の物語や世界観を知っていただくための参考として、オーディオブックをお聴きいただけます。",
  VCS_AUDITION_AUDIOBOOK_URL,
  "※今回募集する役は、オーディオブックには登場しない、または登場がごくわずかな場合があります。演技見本ではなく、物語の参考としてご利用ください。",
  "※視聴は必須ではありません。ボイスドラマ版は、この物語をもとに新しい登場人物・場面・セリフを加え、脚本を加筆・再構成するため、オーディオブックと内容は完全に同じではありません。"
].join("\n");

function doPost(event) {
  try {
    const request = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    if (!request.secret || request.secret !== VCS_AUDITION_SECRET) {
      return vcsJsonResponse_({ ok: false, error: "Unauthorized" });
    }
    if (request.action === "lookupAuditionForm" || request.action === "verifyAuditionForm") {
      return vcsJsonResponse_(vcsLookupAuditionForm_(request));
    }
    if (request.action === "createAuditionForm") {
      return vcsJsonResponse_(vcsCreateAuditionForm_(request));
    }
    if (request.action === "replaceAuditionImages") {
      return vcsJsonResponse_(vcsReplaceAuditionImages_(request));
    }
    if (request.action === "saveAuditionImage") {
      return vcsJsonResponse_(vcsSaveAuditionImage_(request));
    }
    if (request.action === "listAuditionApplicants") {
      return vcsJsonResponse_(vcsListAuditionApplicants_(request));
    }
    return vcsJsonResponse_({ ok: false, error: "Unsupported action" });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return vcsJsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function vcsGetAuditionNames_(request) {
  const roleName = String(request.roleName || "").trim();
  const roleDescription = String(request.roleDescription || "").trim().slice(0, 700);
  const requestKey = String(request.requestKey || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const rawAuditionDeadline = String(request.auditionDeadline || "").trim();
  const auditionDeadline = vcsNormalizeAuditionDeadline_(rawAuditionDeadline);
  if (!roleName || !requestKey) throw new Error("Role name and request key are required.");
  if (rawAuditionDeadline && !auditionDeadline) {
    throw new Error("応募締め切り日時が正しくありません。日付と時刻を確認してください。");
  }
  return {
    roleName,
    roleDescription,
    requestKey,
    auditionDeadline,
    formName: `「${roleName}」役オーディション応募フォーム`,
    headerName: `${roleName}_Googleフォームヘッダー_1600x400.png`,
    socialName: `${roleName}_SNS_16x9.png`
  };
}

function vcsNormalizeXProfileUrl_(value) {
  const source = String(value || "").trim().replace(/^\s+|\s+$/g, "");
  if (!source) return "";
  const handleMatch = source.match(/^@([A-Za-z0-9_]{1,15})$/);
  if (handleMatch) return `https://x.com/${handleMatch[1]}`;
  const bareHandleMatch = source.match(/^([A-Za-z0-9_]{1,15})$/);
  if (bareHandleMatch) return `https://x.com/${bareHandleMatch[1]}`;
  const urlMatch = source.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i);
  return urlMatch ? `https://x.com/${urlMatch[1]}` : source;
}

function vcsAuditionResponseValue_(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join("、");
  return String(value == null ? "" : value).trim();
}

function vcsGetAuditionResponseId_(response, formId, submittedAt, name, socialInput) {
  try {
    const responseId = String(response.getId() || "").trim();
    if (responseId) return responseId;
  } catch (error) {
    // Older responses may not expose an id. The stable fallback keeps imports idempotent.
  }
  const identity = [formId, submittedAt, name, socialInput].join("|");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, identity, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "").slice(0, 32);
}

function vcsExtractAuditionApplicant_(response, role, formId) {
  let name = "";
  let socialInput = "";
  const itemResponses = response.getItemResponses();
  itemResponses.forEach((itemResponse) => {
    const item = itemResponse.getItem();
    const title = vcsItemTitle_(item);
    const value = vcsAuditionResponseValue_(itemResponse.getResponse());
    if (!name && (title === VCS_AUDITION_NAME_TITLE || /(?:お名前|SNS名)/u.test(title))) name = value;
    if (!socialInput && (title === VCS_AUDITION_X_TITLE || /(?:^|[^A-Za-z])X(?:の|\s)*(?:アカウント|ID)/iu.test(title))) socialInput = value;
  });
  if (!name) return null;
  let submittedAt = "";
  try {
    const timestamp = response.getTimestamp();
    submittedAt = timestamp && typeof timestamp.toISOString === "function" ? timestamp.toISOString() : String(timestamp || "");
  } catch (error) {
    submittedAt = "";
  }
  return {
    responseId: vcsGetAuditionResponseId_(response, formId, submittedAt, name, socialInput),
    formId,
    sourceCharacterId: String(role.characterId || role.sourceCharacterId || ""),
    sourceRoleName: String(role.roleName || ""),
    name,
    socialInput,
    socialUrl: vcsNormalizeXProfileUrl_(socialInput),
    submittedAt
  };
}

function vcsListAuditionApplicants_(request) {
  const roles = Array.isArray(request.roles) ? request.roles : [];
  const properties = PropertiesService.getScriptProperties();
  const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
  const applicants = [];
  const roleSummaries = [];

  roles.forEach((role) => {
    const names = vcsGetAuditionNames_(role);
    const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
    const stored = properties.getProperty(propertyKey);
    const storedResult = stored ? vcsCleanStoredResult_(JSON.parse(stored)) : {};
    const requestedFormId = String(role.formId || "").trim();
    const formFile = vcsGetFileById_(requestedFormId)
      || vcsGetFileById_(storedResult.formId)
      || vcsFindFile_(formsFolder, names.formName);
    if (!formFile) {
      roleSummaries.push({
        characterId: String(role.characterId || ""),
        roleName: names.roleName,
        formId: "",
        responseCount: 0,
        found: false
      });
      return;
    }
    const form = FormApp.openById(formFile.getId());
    const responses = form.getResponses();
    responses.forEach((response) => {
      const applicant = vcsExtractAuditionApplicant_(response, role, form.getId());
      if (applicant) applicants.push(applicant);
    });
    roleSummaries.push({
      characterId: String(role.characterId || ""),
      roleName: names.roleName,
      formId: form.getId(),
      responseCount: responses.length,
      found: true
    });
  });

  return {
    ok: true,
    applicants,
    roleSummaries,
    importedAt: new Date().toISOString()
  };
}

function vcsAuditionFormDescription_(names) {
  const introduction = `「${names.roleName}」役オーディションに応募される方は、このフォームからお願いします。`;
  const deadlineState = vcsGetAuditionDeadlineState_(names.auditionDeadline);
  return [
    introduction,
    names.roleDescription ? `【募集する役】\n${names.roleDescription}` : "",
    deadlineState.configured
      ? `【応募締め切り】\n${deadlineState.label}\n${VCS_AUDITION_EARLY_CLOSING_NOTICE}`
      : "",
    VCS_AUDITION_AUDIOBOOK_NOTICE
  ].filter(Boolean).join("\n\n");
}

function vcsNormalizeAuditionDeadline_(value) {
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const normalized = `${match[1]}T${match[2]}`;
  try {
    const parsed = Utilities.parseDate(normalized.replace("T", " "), VCS_AUDITION_TIME_ZONE, "yyyy-MM-dd HH:mm");
    return Utilities.formatDate(parsed, VCS_AUDITION_TIME_ZONE, "yyyy-MM-dd'T'HH:mm") === normalized
      ? normalized
      : "";
  } catch (error) {
    return "";
  }
}

function vcsGetAuditionDeadlineState_(value, now) {
  const normalized = vcsNormalizeAuditionDeadline_(value);
  if (!normalized) {
    return {
      configured: false,
      value: "",
      label: "",
      atMs: null,
      expired: false,
      shouldAcceptResponses: true,
      automationReady: false
    };
  }
  const date = Utilities.parseDate(normalized.replace("T", " "), VCS_AUDITION_TIME_ZONE, "yyyy-MM-dd HH:mm");
  const nowMs = now instanceof Date ? now.getTime() : Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const expired = date.getTime() <= nowMs;
  return {
    configured: true,
    value: normalized,
    label: Utilities.formatDate(date, VCS_AUDITION_TIME_ZONE, "yyyy年M月d日 HH:mm"),
    atMs: date.getTime(),
    expired,
    shouldAcceptResponses: !expired,
    automationReady: false
  };
}

function vcsAuditionDeadlinePropertyKey_(formId) {
  return `${VCS_AUDITION_DEADLINE_PROPERTY_PREFIX}${formId}`;
}

function vcsEnsureAuditionDeadlineTrigger_() {
  const existing = ScriptApp.getProjectTriggers().find(
    (trigger) => trigger.getHandlerFunction() === VCS_AUDITION_DEADLINE_TRIGGER_HANDLER
  );
  if (existing) return existing;
  return ScriptApp.newTrigger(VCS_AUDITION_DEADLINE_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();
}

function vcsStoreAuditionDeadline_(form, names, deadlineState) {
  const properties = PropertiesService.getScriptProperties();
  const propertyKey = vcsAuditionDeadlinePropertyKey_(form.getId());
  if (!deadlineState.configured) {
    properties.deleteProperty(propertyKey);
    return false;
  }
  properties.setProperty(propertyKey, JSON.stringify({
    formId: form.getId(),
    requestKey: String(names.requestKey || ""),
    roleName: String(names.roleName || ""),
    auditionDeadline: deadlineState.value,
    deadlineAt: deadlineState.atMs,
    updatedAt: new Date().toISOString()
  }));
  if (!deadlineState.expired) vcsEnsureAuditionDeadlineTrigger_();
  return true;
}

function vcsApplyAuditionDeadline_(form, names) {
  const deadlineState = vcsGetAuditionDeadlineState_(names.auditionDeadline);
  form.setAcceptingResponses(deadlineState.shouldAcceptResponses);
  if (typeof form.setCustomClosedFormMessage === "function") {
    try {
      form.setCustomClosedFormMessage(VCS_AUDITION_CLOSED_MESSAGE);
    } catch (error) {
      console.warn(`Could not set the audition closed message for ${form.getId()}: ${error}`);
    }
  }
  deadlineState.automationReady = vcsStoreAuditionDeadline_(form, names, deadlineState);
  return deadlineState;
}

function vcsCloseExpiredAuditionForms() {
  const properties = PropertiesService.getScriptProperties();
  const entries = properties.getProperties();
  const now = Date.now();
  let checked = 0;
  let closed = 0;
  Object.keys(entries).forEach((propertyKey) => {
    if (!propertyKey.startsWith(VCS_AUDITION_DEADLINE_PROPERTY_PREFIX)) return;
    let entry;
    try {
      entry = JSON.parse(entries[propertyKey]);
    } catch (error) {
      properties.deleteProperty(propertyKey);
      return;
    }
    if (!entry || !entry.formId || !Number.isFinite(Number(entry.deadlineAt))) {
      properties.deleteProperty(propertyKey);
      return;
    }
    checked += 1;
    if (entry.closedAt || Number(entry.deadlineAt) > now) return;
    try {
      const form = FormApp.openById(entry.formId);
      if (typeof form.setPublished === "function") form.setPublished(true);
      form.setAcceptingResponses(false);
      if (typeof form.setCustomClosedFormMessage === "function") {
        try {
          form.setCustomClosedFormMessage(VCS_AUDITION_CLOSED_MESSAGE);
        } catch (error) {
          console.warn(`Could not set the audition closed message for ${entry.formId}: ${error}`);
        }
      }
      entry.closedAt = new Date(now).toISOString();
      properties.setProperty(propertyKey, JSON.stringify(entry));
      closed += 1;
    } catch (error) {
      console.error(`Could not close audition form ${entry.formId}: ${error}`);
    }
  });
  return { checked, closed, checkedAt: new Date(now).toISOString() };
}

function vcsInstallAuditionDeadlineAutomation() {
  vcsEnsureAuditionDeadlineTrigger_();
  return vcsCloseExpiredAuditionForms();
}

function vcsExpectedAuditionItems_() {
  return [
    { title: VCS_AUDITION_CONSENT_TITLE, type: FormApp.ItemType.MULTIPLE_CHOICE },
    { title: VCS_AUDITION_NAME_TITLE, type: FormApp.ItemType.TEXT },
    { title: VCS_AUDITION_X_TITLE, type: FormApp.ItemType.TEXT },
    { title: VCS_AUDITION_FOLLOW_TITLE, type: FormApp.ItemType.CHECKBOX },
    { title: VCS_AUDITION_UPLOAD_TITLE, type: FormApp.ItemType.FILE_UPLOAD }
  ];
}

function vcsFindFile_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

function vcsGetFileById_(fileId) {
  if (!fileId) return null;
  try {
    return DriveApp.getFileById(fileId);
  } catch (error) {
    return null;
  }
}

function vcsRenameFile_(file, name) {
  if (file && file.getName() !== name) file.setName(name);
  return file;
}

function vcsItemTitle_(item) {
  try {
    return String(item.getTitle() || "").trim();
  } catch (error) {
    return "";
  }
}

function vcsChoiceValues_(item) {
  return item.getChoices().map((choice) => String(choice.getValue() || ""));
}

function vcsSameValues_(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function vcsNormalizeAuditionForm_(form) {
  const repaired = [];
  const allItems = form.getItems();
  const consentItems = allItems.filter((item) => vcsItemTitle_(item) === VCS_AUDITION_CONSENT_TITLE);
  if (consentItems.length === 1 && consentItems[0].getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
    const consent = consentItems[0].asMultipleChoiceItem();
    if (!vcsSameValues_(vcsChoiceValues_(consent), [VCS_AUDITION_CONSENT_CHOICE])) {
      consent.setChoiceValues([VCS_AUDITION_CONSENT_CHOICE]);
      repaired.push("consentChoices");
    }
    if (!consent.isRequired()) {
      consent.setRequired(true);
      repaired.push("consentRequired");
    }
  }

  const followItems = allItems.filter((item) => vcsItemTitle_(item) === VCS_AUDITION_FOLLOW_TITLE);
  if (followItems.length === 1 && followItems[0].getType() === FormApp.ItemType.CHECKBOX) {
    const follow = followItems[0].asCheckboxItem();
    if (!vcsSameValues_(vcsChoiceValues_(follow), [VCS_AUDITION_FOLLOW_CHOICE])) {
      follow.setChoiceValues([VCS_AUDITION_FOLLOW_CHOICE]);
      repaired.push("followChoices");
    }
    if (!follow.isRequired()) {
      follow.setRequired(true);
      repaired.push("followRequired");
    }
  }

  const uploadItems = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  const upload = uploadItems.find((item) => vcsItemTitle_(item) === VCS_AUDITION_UPLOAD_TITLE) || uploadItems[0];
  if (upload) {
    if (vcsItemTitle_(upload) !== VCS_AUDITION_UPLOAD_TITLE) {
      upload.setTitle(VCS_AUDITION_UPLOAD_TITLE);
      repaired.push("uploadTitle");
    }
    uploadItems.filter((item) => item.getId() !== upload.getId()).forEach((item) => {
      form.deleteItem(item);
      repaired.push("duplicateUploadRemoved");
    });
  }
  return repaired;
}

function vcsValidateAuditionForm_(form, names, repaired, options) {
  const validationOptions = options || {};
  const deadlineState = validationOptions.deadlineState || vcsGetAuditionDeadlineState_(names.auditionDeadline);
  const errors = [];
  const items = form.getItems();
  const expectedItems = vcsExpectedAuditionItems_().map((expected) => {
    const matches = items.filter((item) => item.getType() === expected.type && vcsItemTitle_(item) === expected.title);
    if (matches.length !== 1) {
      errors.push(`「${expected.title}」が${matches.length}件です（1件必要）。`);
    }
    return { title: expected.title, count: matches.length };
  });

  const fileUploadItems = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  if (fileUploadItems.length !== 1) {
    errors.push(`音声アップロード欄が${fileUploadItems.length}件です（1件必要）。`);
  }

  const consent = items.find((item) => item.getType() === FormApp.ItemType.MULTIPLE_CHOICE && vcsItemTitle_(item) === VCS_AUDITION_CONSENT_TITLE);
  const consentChoices = consent ? vcsChoiceValues_(consent.asMultipleChoiceItem()) : [];
  if (consent && !vcsSameValues_(consentChoices, [VCS_AUDITION_CONSENT_CHOICE])) {
    errors.push("音声使用の同意欄に不要な選択肢があります。");
  }

  const titleMatches = form.getTitle() === names.formName;
  if (!titleMatches) errors.push("フォーム名が役名と一致していません。");
  const expectedDescription = vcsAuditionFormDescription_(names);
  const descriptionMatches = !names.roleName || form.getDescription() === expectedDescription;
  const audiobookReferenceIncluded = form.getDescription().includes(VCS_AUDITION_AUDIOBOOK_URL);
  if (!descriptionMatches) errors.push("フォーム説明に募集する役と参考オーディオブックの案内が反映されていません。");

  let responderUrl = "";
  let acceptingResponses = false;
  let published = null;
  try { responderUrl = form.getPublishedUrl() || ""; } catch (error) { /* checked below */ }
  try { acceptingResponses = form.isAcceptingResponses(); } catch (error) { /* checked below */ }
  try { published = typeof form.isPublished === "function" ? form.isPublished() : null; } catch (error) { published = null; }
  if (!validationOptions.skipAvailability) {
    if (!responderUrl) errors.push("応募者用URLを取得できません。");
    if (deadlineState.shouldAcceptResponses && !acceptingResponses) errors.push("回答受付が開始されていません。");
    if (!deadlineState.shouldAcceptResponses && acceptingResponses) errors.push("締め切りを過ぎていますが、回答受付が終了していません。");
    if (published === false) errors.push("フォームが公開されていません。");
  }

  return {
    passed: errors.length === 0,
    errors,
    repaired: repaired || [],
    expectedItems,
    fileUploadItems: fileUploadItems.length,
    consentChoices,
    titleMatches,
    descriptionMatches,
    audiobookReferenceIncluded,
    responderUrlPresent: Boolean(responderUrl),
    acceptingResponses,
    published,
    auditionDeadline: deadlineState.value,
    auditionDeadlineLabel: deadlineState.label,
    deadlineConfigured: deadlineState.configured,
    deadlineExpired: deadlineState.expired,
    deadlineAutomationReady: deadlineState.automationReady,
    manualHeaderCheckRequired: true,
    manualUploadFolderCheckRequired: true,
    checkedAt: new Date().toISOString()
  };
}

function vcsRequireValidAuditionForm_(validation) {
  if (!validation.passed) {
    throw new Error(`Googleフォームの自動検査に失敗しました: ${validation.errors.join(" / ")}`);
  }
}

function vcsPrepareAuditionForm_(form, formFile, names) {
  vcsRenameFile_(formFile, names.formName);
  form.setTitle(names.formName);
  form.setDescription(vcsAuditionFormDescription_(names));
  form.setPublished(true);
  const deadlineState = vcsApplyAuditionDeadline_(form, names);
  const repaired = vcsNormalizeAuditionForm_(form);
  const validation = vcsValidateAuditionForm_(form, names, repaired, { deadlineState });
  vcsRequireValidAuditionForm_(validation);
  return validation;
}

function vcsCleanStoredResult_(storedResult) {
  const result = Object.assign({}, storedResult || {});
  const itemId = Number(result.formHeaderImageItemId);
  if (result.formId && Number.isFinite(itemId) && itemId > 0) {
    try {
      const form = FormApp.openById(result.formId);
      const item = form.getItemById(itemId);
      if (item && item.getType() === FormApp.ItemType.IMAGE) form.deleteItem(item);
    } catch (error) {
      console.warn(`Could not remove the legacy form-body header image: ${error}`);
    }
  }
  delete result.formHeaderImageItemId;
  delete result.formHeaderImageAttached;
  return result;
}

function vcsFindImageFile_(imageFolder, legacyFolder, fileName) {
  const current = vcsFindFile_(imageFolder, fileName);
  if (current) return current;
  const legacy = vcsFindFile_(legacyFolder, fileName);
  if (!legacy) return null;
  legacy.moveTo(imageFolder);
  return legacy;
}

function vcsResolveImageFile_(storedResult, storedKey, imageFolder, legacyFolder, fileName) {
  const storedFile = vcsGetFileById_(storedResult && storedResult[storedKey]);
  if (storedFile) {
    storedFile.moveTo(imageFolder);
    return vcsRenameFile_(storedFile, fileName);
  }
  return vcsFindImageFile_(imageFolder, legacyFolder, fileName);
}

function vcsValidateImageFiles_(headerFile, socialFile) {
  if (!headerFile || headerFile.getSize() <= 0) throw new Error("Googleフォーム用ヘッダー画像がDriveに保存されていません。");
  if (!socialFile || socialFile.getSize() <= 0) throw new Error("SNS用画像がDriveに保存されていません。");
}

function vcsValidateImageFile_(file, label) {
  if (!file || file.getSize() <= 0) throw new Error(`${label}がDriveに保存されていません。`);
}

function vcsBuildAuditionResult_(form, headerFile, socialFile, recovered, validation) {
  const formId = form.getId();
  let formEditUrl = `https://docs.google.com/forms/d/${formId}/edit`;
  let formResponderUrl = "";
  try { formEditUrl = form.getEditUrl() || formEditUrl; } catch (error) { console.warn(error); }
  try { formResponderUrl = form.getPublishedUrl() || ""; } catch (error) { console.warn(error); }

  return {
    ok: true,
    found: true,
    recovered: Boolean(recovered),
    formId,
    formEditUrl,
    formResponderUrl,
    headerImageFileId: headerFile ? headerFile.getId() : "",
    headerImageUrl: headerFile ? `https://drive.google.com/file/d/${headerFile.getId()}/view` : "",
    socialImageFileId: socialFile ? socialFile.getId() : "",
    socialImageUrl: socialFile ? `https://drive.google.com/file/d/${socialFile.getId()}/view` : "",
    imagesComplete: Boolean(headerFile && socialFile),
    fileUploadItems: validation.fileUploadItems,
    auditionDeadline: validation.auditionDeadline,
    deadlineAutomationReady: validation.deadlineAutomationReady,
    formValidation: validation,
    createdAt: new Date().toISOString()
  };
}

function vcsLookupAuditionForm_(request) {
  const names = vcsGetAuditionNames_(request);
  const properties = PropertiesService.getScriptProperties();
  const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
  const stored = properties.getProperty(propertyKey);
  const storedResult = stored ? vcsCleanStoredResult_(JSON.parse(stored)) : {};
  const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
  const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
  const formFile = vcsGetFileById_(storedResult.formId) || vcsFindFile_(formsFolder, names.formName);
  const headerFile = vcsResolveImageFile_(storedResult, "headerImageFileId", imageFolder, formsFolder, names.headerName);
  const socialFile = vcsResolveImageFile_(storedResult, "socialImageFileId", imageFolder, formsFolder, names.socialName);
  if (!formFile) return { ok: true, found: false };

  const form = FormApp.openById(formFile.getId());
  const validation = vcsPrepareAuditionForm_(form, formFile, names);
  if (headerFile) vcsValidateImageFile_(headerFile, "Googleフォーム用ヘッダー画像");
  if (socialFile) vcsValidateImageFile_(socialFile, "SNS用画像");
  const result = vcsBuildAuditionResult_(form, headerFile, socialFile, true, validation);
  properties.setProperty(propertyKey, JSON.stringify(result));
  return result;
}

function vcsCreateAuditionForm_(request) {
  const names = vcsGetAuditionNames_(request);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
    const stored = properties.getProperty(propertyKey);
    const storedResult = stored ? vcsCleanStoredResult_(JSON.parse(stored)) : {};
    const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
    const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
    const copiedFile = vcsGetFileById_(storedResult.formId)
      || vcsFindFile_(formsFolder, names.formName)
      || DriveApp.getFileById(VCS_AUDITION_TEMPLATE_FORM_ID).makeCopy(names.formName, formsFolder);
    const form = FormApp.openById(copiedFile.getId());
    const validation = vcsPrepareAuditionForm_(form, copiedFile, names);
    const headerFile = vcsResolveImageFile_(storedResult, "headerImageFileId", imageFolder, formsFolder, names.headerName)
      || (request.headerImage && request.headerImage.base64
        ? vcsSaveImage_(imageFolder, request.headerImage, names.headerName)
        : null);
    const socialFile = vcsResolveImageFile_(storedResult, "socialImageFileId", imageFolder, formsFolder, names.socialName)
      || (request.socialImage && request.socialImage.base64
        ? vcsSaveImage_(imageFolder, request.socialImage, names.socialName)
        : null);
    if (headerFile) vcsValidateImageFile_(headerFile, "Googleフォーム用ヘッダー画像");
    if (socialFile) vcsValidateImageFile_(socialFile, "SNS用画像");
    const result = vcsBuildAuditionResult_(form, headerFile, socialFile, false, validation);
    properties.setProperty(propertyKey, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function vcsImageBlob_(image, fileName) {
  const base64 = String(image && image.base64 ? image.base64 : "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) throw new Error(`${fileName} is missing.`);
  const mimeType = String(image.mimeType || "image/png");
  return Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
}

function vcsListFiles_(folder, fileName) {
  const files = [];
  const iterator = folder.getFilesByName(fileName);
  while (iterator.hasNext()) files.push(iterator.next());
  return files;
}

function vcsSaveImage_(folder, image, fileName) {
  const existing = vcsFindFile_(folder, fileName);
  if (existing) return existing;
  return folder.createFile(vcsImageBlob_(image, fileName));
}

function vcsSaveAuditionImage_(request) {
  const names = vcsGetAuditionNames_(request);
  const assetType = String(request.assetType || "");
  if (assetType !== "header" && assetType !== "social") {
    throw new Error("Image asset type must be header or social.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
    const stored = properties.getProperty(propertyKey);
    const storedResult = stored ? vcsCleanStoredResult_(JSON.parse(stored)) : {};
    const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
    const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
    const formFile = vcsGetFileById_(storedResult.formId) || vcsFindFile_(formsFolder, names.formName);
    if (!formFile) throw new Error(`${names.formName} was not found.`);

    const fileName = assetType === "header" ? names.headerName : names.socialName;
    const storedKey = assetType === "header" ? "headerImageFileId" : "socialImageFileId";
    const oldFiles = vcsListFiles_(imageFolder, fileName);
    const storedFile = vcsGetFileById_(storedResult[storedKey]);
    if (storedFile && !oldFiles.some((file) => file.getId() === storedFile.getId())) oldFiles.push(storedFile);

    const newFile = imageFolder.createFile(vcsImageBlob_(request.image, fileName));
    const trashedOldFiles = [];
    try {
      vcsValidateImageFile_(newFile, assetType === "header" ? "Googleフォーム用ヘッダー画像" : "SNS用画像");
      oldFiles.forEach((file) => {
        if (file.getId() === newFile.getId()) return;
        file.setTrashed(true);
        trashedOldFiles.push(file);
      });

      const headerFile = assetType === "header"
        ? newFile
        : vcsResolveImageFile_(storedResult, "headerImageFileId", imageFolder, formsFolder, names.headerName);
      const socialFile = assetType === "social"
        ? newFile
        : vcsResolveImageFile_(storedResult, "socialImageFileId", imageFolder, formsFolder, names.socialName);
      const form = FormApp.openById(formFile.getId());
      const validation = vcsPrepareAuditionForm_(form, formFile, names);
      const result = vcsBuildAuditionResult_(form, headerFile, socialFile, false, validation);
      result.imagesReplaced = oldFiles.length > 0;
      result.updatedAssetType = assetType;
      result.createdAt = storedResult.createdAt || result.createdAt;
      properties.setProperty(propertyKey, JSON.stringify(result));
      return result;
    } catch (error) {
      trashedOldFiles.forEach((file) => {
        try { file.setTrashed(false); } catch (restoreError) { console.error(restoreError); }
      });
      try { newFile.setTrashed(true); } catch (cleanupError) { console.error(cleanupError); }
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function vcsReplaceAuditionImages_(request) {
  const names = vcsGetAuditionNames_(request);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
    const stored = properties.getProperty(propertyKey);
    const storedResult = stored ? vcsCleanStoredResult_(JSON.parse(stored)) : {};
    const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
    const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
    const formFile = vcsGetFileById_(storedResult.formId) || vcsFindFile_(formsFolder, names.formName);
    if (!formFile) throw new Error(`${names.formName} was not found.`);

    const oldHeaderFiles = vcsListFiles_(imageFolder, names.headerName);
    const oldSocialFiles = vcsListFiles_(imageFolder, names.socialName);
    [storedResult.headerImageFileId, storedResult.socialImageFileId].forEach((fileId) => {
      const file = vcsGetFileById_(fileId);
      if (file && !oldHeaderFiles.concat(oldSocialFiles).some((candidate) => candidate.getId() === file.getId())) {
        if (fileId === storedResult.headerImageFileId) oldHeaderFiles.push(file);
        else oldSocialFiles.push(file);
      }
    });

    const newFiles = [];
    const trashedOldFiles = [];
    try {
      const headerFile = imageFolder.createFile(vcsImageBlob_(request.headerImage, names.headerName));
      newFiles.push(headerFile);
      const socialFile = imageFolder.createFile(vcsImageBlob_(request.socialImage, names.socialName));
      newFiles.push(socialFile);
      vcsValidateImageFiles_(headerFile, socialFile);

      oldHeaderFiles.concat(oldSocialFiles).forEach((file) => {
        if (newFiles.some((candidate) => candidate.getId() === file.getId())) return;
        file.setTrashed(true);
        trashedOldFiles.push(file);
      });

      const form = FormApp.openById(formFile.getId());
      const validation = vcsPrepareAuditionForm_(form, formFile, names);
      const result = vcsBuildAuditionResult_(form, headerFile, socialFile, false, validation);
      result.imagesReplaced = true;
      properties.setProperty(propertyKey, JSON.stringify(result));
      return result;
    } catch (error) {
      trashedOldFiles.forEach((file) => {
        try { file.setTrashed(false); } catch (restoreError) { console.error(restoreError); }
      });
      newFiles.forEach((file) => {
        try { file.setTrashed(true); } catch (cleanupError) { console.error(cleanupError); }
      });
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function vcsRepairAuditionTemplate() {
  const form = FormApp.openById(VCS_AUDITION_TEMPLATE_FORM_ID);
  const names = { formName: form.getTitle() };
  const repaired = vcsNormalizeAuditionForm_(form);
  const validation = vcsValidateAuditionForm_(form, names, repaired, { skipAvailability: true });
  vcsRequireValidAuditionForm_(validation);
  console.log(JSON.stringify(validation));
  return validation;
}

function vcsJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

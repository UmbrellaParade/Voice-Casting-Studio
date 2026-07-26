/**
 * Standalone Apps Script web app for Voice Cast Studio audition forms.
 *
 * Before deployment, replace the three placeholder values below. Deploy as a
 * web app that executes as the owner and can be accessed by anyone. The shared
 * secret is still required for every request.
 */
const VCS_AUDITION_SECRET = "__VCS_AUDITION_SECRET__";
const VCS_AUDITION_TEMPLATE_FORM_ID = "1-xfkPZchzQDyAjJUVcfxODw8Cjd61pHaqkv1UyLWSkY";
const VCS_AUDITION_FOLDER_ID = "1LR58DIiMLNu5BaOEVBvYwQrxC9ffDudS";

function doPost(event) {
  try {
    const request = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    if (!request.secret || request.secret !== VCS_AUDITION_SECRET) {
      return vcsJsonResponse_({ ok: false, error: "Unauthorized" });
    }
    if (request.action === "lookupAuditionForm") {
      return vcsJsonResponse_(vcsLookupAuditionForm_(request));
    }
    if (request.action === "createAuditionForm") {
      return vcsJsonResponse_(vcsCreateAuditionForm_(request));
    }
    return vcsJsonResponse_({ ok: false, error: "Unsupported action" });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return vcsJsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function vcsGetAuditionNames_(request) {
  const roleName = String(request.roleName || "").trim();
  const requestKey = String(request.requestKey || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!roleName || !requestKey) throw new Error("Role name and request key are required.");
  return {
    roleName,
    requestKey,
    formName: `「${roleName}」役オーディション応募フォーム`,
    headerName: `${roleName}_Googleフォームヘッダー_1600x400.png`,
    socialName: `${roleName}_SNS_16x9.png`
  };
}

function vcsFindFile_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

function vcsRefreshFileUploadItems_(form) {
  const uploadItems = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  uploadItems.forEach((item) => {
    const originalIndex = item.getIndex();
    const replacement = item.duplicate();
    form.moveItem(replacement, originalIndex);
    form.deleteItem(item);
  });
  return uploadItems.length;
}

function vcsBuildAuditionResult_(form, headerFile, socialFile, recovered) {
  const formId = form.getId();
  let formEditUrl = `https://docs.google.com/forms/d/${formId}/edit`;
  let formResponderUrl = "";
  try {
    formEditUrl = form.getEditUrl() || formEditUrl;
  } catch (error) {
    console.warn(`Could not read the form edit URL: ${error}`);
  }
  try {
    formResponderUrl = form.getPublishedUrl() || "";
  } catch (error) {
    console.warn(`Could not read the form responder URL: ${error}`);
  }

  return {
    ok: true,
    found: true,
    recovered: Boolean(recovered),
    formId,
    formEditUrl,
    formResponderUrl,
    headerImageFileId: headerFile.getId(),
    headerImageUrl: `https://drive.google.com/file/d/${headerFile.getId()}/view`,
    socialImageFileId: socialFile.getId(),
    socialImageUrl: `https://drive.google.com/file/d/${socialFile.getId()}/view`,
    createdAt: new Date().toISOString()
  };
}

function vcsLookupAuditionForm_(request) {
  const names = vcsGetAuditionNames_(request);
  const properties = PropertiesService.getScriptProperties();
  const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
  const stored = properties.getProperty(propertyKey);
  if (stored) return Object.assign({ found: true }, JSON.parse(stored));

  const folder = DriveApp.getFolderById(VCS_AUDITION_FOLDER_ID);
  const formFile = vcsFindFile_(folder, names.formName);
  const headerFile = vcsFindFile_(folder, names.headerName);
  const socialFile = vcsFindFile_(folder, names.socialName);
  if (!formFile || !headerFile || !socialFile) return { ok: true, found: false };

  const form = FormApp.openById(formFile.getId());
  const refreshedUploadItems = vcsRefreshFileUploadItems_(form);
  const result = vcsBuildAuditionResult_(form, headerFile, socialFile, true);
  result.refreshedUploadItems = refreshedUploadItems;
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
    if (stored) return JSON.parse(stored);

    const folder = DriveApp.getFolderById(VCS_AUDITION_FOLDER_ID);
    const copiedFile = vcsFindFile_(folder, names.formName)
      || DriveApp.getFileById(VCS_AUDITION_TEMPLATE_FORM_ID).makeCopy(names.formName, folder);
    const form = FormApp.openById(copiedFile.getId());
    form.setTitle(names.formName);
    form.setDescription(`『${names.roleName}』役オーディションに応募される方は、このフォームからお願いします。`);
    const refreshedUploadItems = vcsRefreshFileUploadItems_(form);
    form.setPublished(true);
    form.setAcceptingResponses(true);

    const headerFile = vcsSaveImage_(folder, request.headerImage, names.headerName);
    const socialFile = vcsSaveImage_(folder, request.socialImage, names.socialName);
    const result = vcsBuildAuditionResult_(form, headerFile, socialFile, false);
    result.refreshedUploadItems = refreshedUploadItems;
    properties.setProperty(propertyKey, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function vcsSaveImage_(folder, image, fileName) {
  const existing = vcsFindFile_(folder, fileName);
  if (existing) return existing;
  const base64 = String(image && image.base64 ? image.base64 : "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) throw new Error(`${fileName} is missing.`);
  const mimeType = String(image.mimeType || "image/png");
  return folder.createFile(Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName));
}

function vcsJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

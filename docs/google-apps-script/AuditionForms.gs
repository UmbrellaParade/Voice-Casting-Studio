/**
 * Standalone Apps Script web app for Voice Cast Studio audition forms.
 *
 * Before deployment, replace the three placeholder values below. Deploy as a
 * web app that executes as the owner and can be accessed by anyone. The shared
 * secret is still required for every request.
 */
const VCS_AUDITION_SECRET = "__VCS_AUDITION_SECRET__";
const VCS_AUDITION_TEMPLATE_FORM_ID = "1-xfkPZchzQDyAjJUVcfxODw8Cjd61pHaqkv1UyLWSkY";
const VCS_AUDITION_FORMS_FOLDER_ID = "1LR58DIiMLNu5BaOEVBvYwQrxC9ffDudS";
const VCS_AUDITION_IMAGE_FOLDER_ID = "11uxFA2aHVaKv99sRq7yXJKiR5blVn_s9";

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
    if (request.action === "replaceAuditionImages") {
      return vcsJsonResponse_(vcsReplaceAuditionImages_(request));
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

function vcsCountFileUploadItems_(form) {
  return form.getItems(FormApp.ItemType.FILE_UPLOAD).length;
}

function vcsCleanStoredResult_(storedResult) {
  const result = Object.assign({}, storedResult || {});
  const itemId = Number(result.formHeaderImageItemId);
  if (result.formId && Number.isFinite(itemId) && itemId > 0) {
    try {
      const form = FormApp.openById(result.formId);
      const item = form.getItemById(itemId);
      if (item && item.getType() === FormApp.ItemType.IMAGE) form.deleteItem(item);
      result.fileUploadItems = vcsCountFileUploadItems_(form);
    } catch (error) {
      console.warn(`Could not remove the legacy form-body header image: ${error}`);
    }
  }
  delete result.formHeaderImageItemId;
  delete result.formHeaderImageAttached;
  try {
    const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
    [result.headerImageFileId, result.socialImageFileId].filter(Boolean).forEach((fileId) => {
      DriveApp.getFileById(fileId).moveTo(imageFolder);
    });
  } catch (error) {
    console.warn(`Could not move a stored audition image: ${error}`);
  }
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
  if (stored) {
    const storedResult = vcsCleanStoredResult_(JSON.parse(stored));
    properties.setProperty(propertyKey, JSON.stringify(storedResult));
    return Object.assign({ found: true }, storedResult);
  }

  const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
  const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
  const formFile = vcsFindFile_(formsFolder, names.formName);
  const headerFile = vcsFindImageFile_(imageFolder, formsFolder, names.headerName);
  const socialFile = vcsFindImageFile_(imageFolder, formsFolder, names.socialName);
  if (!formFile || !headerFile || !socialFile) return { ok: true, found: false };

  const form = FormApp.openById(formFile.getId());
  const fileUploadItems = vcsCountFileUploadItems_(form);
  const result = vcsBuildAuditionResult_(form, headerFile, socialFile, true);
  result.fileUploadItems = fileUploadItems;
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
    if (stored) {
      const storedResult = vcsCleanStoredResult_(JSON.parse(stored));
      properties.setProperty(propertyKey, JSON.stringify(storedResult));
      return storedResult;
    }

    const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
    const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
    const copiedFile = vcsFindFile_(formsFolder, names.formName)
      || DriveApp.getFileById(VCS_AUDITION_TEMPLATE_FORM_ID).makeCopy(names.formName, formsFolder);
    const form = FormApp.openById(copiedFile.getId());
    form.setTitle(names.formName);
    form.setDescription(`「${names.roleName}」役オーディションに応募される方は、このフォームからお願いします。`);
    const fileUploadItems = vcsCountFileUploadItems_(form);
    form.setPublished(true);
    form.setAcceptingResponses(true);

    const headerFile = vcsSaveImage_(imageFolder, request.headerImage, names.headerName);
    const socialFile = vcsSaveImage_(imageFolder, request.socialImage, names.socialName);
    const result = vcsBuildAuditionResult_(form, headerFile, socialFile, false);
    result.fileUploadItems = fileUploadItems;
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

function vcsReplaceAuditionImages_(request) {
  const names = vcsGetAuditionNames_(request);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const formsFolder = DriveApp.getFolderById(VCS_AUDITION_FORMS_FOLDER_ID);
    const imageFolder = DriveApp.getFolderById(VCS_AUDITION_IMAGE_FOLDER_ID);
    const formFile = vcsFindFile_(formsFolder, names.formName);
    if (!formFile) throw new Error(`${names.formName} was not found.`);

    const oldHeaderFiles = vcsListFiles_(imageFolder, names.headerName);
    const oldSocialFiles = vcsListFiles_(imageFolder, names.socialName);
    const newFiles = [];
    const trashedOldFiles = [];
    try {
      const headerFile = imageFolder.createFile(vcsImageBlob_(request.headerImage, names.headerName));
      newFiles.push(headerFile);
      const socialFile = imageFolder.createFile(vcsImageBlob_(request.socialImage, names.socialName));
      newFiles.push(socialFile);

      oldHeaderFiles.concat(oldSocialFiles).forEach((file) => {
        file.setTrashed(true);
        trashedOldFiles.push(file);
      });

      const form = FormApp.openById(formFile.getId());
      const result = vcsBuildAuditionResult_(form, headerFile, socialFile, false);
      result.fileUploadItems = vcsCountFileUploadItems_(form);
      result.imagesReplaced = true;
      const propertyKey = `VCS_AUDITION_RESULT_${names.requestKey}`;
      PropertiesService.getScriptProperties().setProperty(propertyKey, JSON.stringify(result));
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

function vcsJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

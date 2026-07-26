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
    if (request.action !== "createAuditionForm") {
      return vcsJsonResponse_({ ok: false, error: "Unsupported action" });
    }
    return vcsJsonResponse_(vcsCreateAuditionForm_(request));
  } catch (error) {
    return vcsJsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function vcsCreateAuditionForm_(request) {
  const roleName = String(request.roleName || "").trim();
  const requestKey = String(request.requestKey || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!roleName || !requestKey) throw new Error("Role name and request key are required.");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const stored = properties.getProperty(`VCS_AUDITION_RESULT_${requestKey}`);
    if (stored) return JSON.parse(stored);

    const folder = DriveApp.getFolderById(VCS_AUDITION_FOLDER_ID);
    const formName = `「${roleName}」役オーディション応募フォーム`;
    const copiedFile = DriveApp.getFileById(VCS_AUDITION_TEMPLATE_FORM_ID).makeCopy(formName, folder);
    const form = FormApp.openById(copiedFile.getId());
    form.setTitle(formName);
    form.setDescription(`『${roleName}』役オーディションに応募される方は、このフォームからお願いします。`);
    form.setPublished(true);
    form.setAcceptingResponses(true);

    const headerFile = vcsSaveImage_(folder, request.headerImage, `${roleName}_Googleフォームヘッダー_1600x400.png`);
    const socialFile = vcsSaveImage_(folder, request.socialImage, `${roleName}_SNS_16x9.png`);
    const result = {
      ok: true,
      formId: form.getId(),
      formEditUrl: form.getEditUrl(),
      formResponderUrl: form.getPublishedUrl(),
      headerImageFileId: headerFile.getId(),
      headerImageUrl: headerFile.getUrl(),
      socialImageFileId: socialFile.getId(),
      socialImageUrl: socialFile.getUrl(),
      createdAt: new Date().toISOString()
    };
    properties.setProperty(`VCS_AUDITION_RESULT_${requestKey}`, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function vcsSaveImage_(folder, image, fileName) {
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

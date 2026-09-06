function vcsOwnerRole_(request) {
  const workspace = vcsReadOwnerWorkspace_();
  const project = ((workspace.data || {}).recordingProjects || []).find(function (item) { return item.id === request.projectId; });
  const character = project && (project.characters || []).find(function (item) { return item.id === request.characterId; });
  if (!character) vcsOwnerError_("character_missing", "作品とキャラクターを保存してから作成してください。");
  const progress = (project.auditionRoleProgress || []).find(function (item) { return item.characterId === character.id; }) || {};
  const fullName = String(character.name || "").trim();
  const name = fullName.replace(/(?:\s*(?:\([^()]*\)|（[^（）]*）))+\s*$/u, "").trim() || fullName;
  const roleMatch = fullName.match(/[（(]([^（）()]+)[）)]\s*$/u);
  const digest = Utilities.computeHmacSha256Signature(project.id + "|" + character.id, SECRET_TOKEN);
  const requestKey = digest.map(function (byte) { return ((byte + 256) % 256).toString(16).padStart(2, "0"); }).join("").slice(0, 48);
  return { project: project, character: character, progress: progress, requestKey: requestKey,
    names: { requestKey: requestKey, roleName: name, projectTitle: project.title || "Voice Cast Studio",
      roleDescription: String(progress.auditionRoleSummary || (roleMatch ? roleMatch[1] : "")).slice(0, 700),
      auditionDeadline: request.auditionDeadline || progress.auditionDeadline || "" } };
}

function vcsOwnerRequireAudition_() {
  if (!vcsOwnerSafeSettings_().appsScriptConfigured) vcsOwnerError_("audition_setup_required", "見本フォーム・フォーム保管フォルダー・画像保管フォルダーを登録してください。");
}

function vcsOwnerStoreAudition_(request, google, audit) {
  return vcsWithRecordingLock(function () {
    const workspace = vcsReadOwnerWorkspace_();
    if (Number(request.version) !== workspace.revision) vcsOwnerError_("workspace_conflict", "作成中に別の画面から更新されました。最新データを読み直して再試行してください。作成済みフォームは再利用します。");
    const project = workspace.data.recordingProjects.find(function (item) { return item.id === request.projectId; });
    if (!project || !project.characters.some(function (item) { return item.id === request.characterId; })) vcsOwnerError_("character_missing", "作成中にキャラクターが変更されました。");
    const items = project.auditionRoleProgress || [];
    const index = items.findIndex(function (item) { return item.characterId === request.characterId; });
    const previous = index >= 0 ? items[index] : {};
    const validation = google.formValidation || {};
    const progress = Object.assign({}, previous, { characterId: request.characterId,
      formEditUrl: google.formEditUrl || previous.formEditUrl || "",
      formResponderUrl: google.formResponderUrl || previous.formResponderUrl || "",
      headerImageUrl: google.headerImageUrl || previous.headerImageUrl || "",
      socialImageUrl: google.socialImageUrl || previous.socialImageUrl || "",
      formStructureVerified: Boolean(validation.passed), formValidation: validation,
      headerApplied: google.updatedAssetType === "header" ? false : Boolean(previous.headerApplied),
      uploadVerified: Boolean(previous.uploadVerified), recruitmentStarted: Boolean(previous.recruitmentStarted),
      createdAt: previous.createdAt || google.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    progress.formCreated = Boolean(validation.passed && progress.formEditUrl && progress.formResponderUrl);
    if (audit) {
      progress.imageAudit = Object.assign({}, previous.imageAudit || {}, { [request.step]: audit, maxAttempts: 3 });
      progress.imageAudit.passed = Boolean(progress.imageAudit.header?.passed && progress.imageAudit.social?.passed);
    }
    if (index < 0) items.push(progress); else items[index] = progress;
    project.auditionRoleProgress = items;
    workspace.revision++;
    vcsWriteOwnerWorkspace_(workspace);
    return { ok: true, version: workspace.revision, progress: progress, imageAudit: progress.imageAudit || {},
      recovered: Boolean(google.recovered), headerThemeNeedsManualSelection: true, uploadFolderNeedsManualVerification: true,
      imagesStoredInGoogleDrive: Boolean(progress.headerImageUrl && progress.socialImageUrl) };
  });
}

function vcsOwnerCreateAudition_(request) {
  vcsOwnerRequireAudition_();
  const role = vcsOwnerRole_(request);
  return vcsOwnerWithLease_("form_" + role.requestKey, function () {
    let result = vcsLookupAuditionForm_(role.names);
    if (!result.found && request.verifyOnly) vcsOwnerError_("form_missing", "検査するフォームがありません。");
    if (!result.found) result = vcsCreateAuditionForm_(role.names);
    return vcsOwnerStoreAudition_(request, result);
  });
}

function vcsOwnerListApplicants_(request) {
  vcsOwnerRequireAudition_();
  const workspace = vcsReadOwnerWorkspace_();
  const project = ((workspace.data || {}).recordingProjects || []).find(function (item) { return item.id === request.projectId; });
  if (!project) vcsOwnerError_("project_missing", "作品がありません。");
  const roles = (project.characters || []).map(function (character) {
    const role = vcsOwnerRole_({ projectId: project.id, characterId: character.id });
    return Object.assign({}, role.names, { characterId: character.id, formEditUrl: role.progress.formEditUrl || "" });
  });
  return vcsListAuditionApplicants_({ roles: roles });
}

function vcsOwnerReadImage_(source) {
  const data = String(source || "");
  let blob = decodeDataUrl(data);
  if (!blob) {
    // Read Drive files as the owner; external references are fetched without credentials.
    const match = data.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|thumbnail\?id=)([\w-]+)/);
    if (match) blob = DriveApp.getFileById(match[1]).getBlob();
    else {
      if (!/^https:\/\/[^\s/@]+(?:\/|$)/.test(data)) vcsOwnerError_("image_url_invalid", "キャラクター画像またはロゴ画像を登録してください。");
      const response = UrlFetchApp.fetch(data, { muteHttpExceptions: true, followRedirects: false });
      if (response.getResponseCode() !== 200) vcsOwnerError_("image_fetch_failed", "参照画像を取得できませんでした。Driveの画像URLを確認してください。");
      blob = response.getBlob();
    }
  }
  if (!/^image\/(png|jpeg|webp)$/.test(blob.getContentType()) || !blob.getBytes().length || blob.getBytes().length > 12 * 1024 * 1024) vcsOwnerError_("image_invalid", "参照画像は12MB以内のPNG・JPEG・WebPを使用してください。");
  return blob;
}

function vcsOwnerMultipart_(fields, images) {
  const boundary = "----VCS" + Utilities.getUuid().replace(/-/g, "");
  let bytes = [];
  const append = function (value) { bytes = bytes.concat(Utilities.newBlob(value).getBytes()); };
  Object.keys(fields).forEach(function (name) { append("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + fields[name] + "\r\n"); });
  images.forEach(function (blob, index) {
    append("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"reference-" + index + ".png\"\r\nContent-Type: " + blob.getContentType() + "\r\n\r\n");
    bytes = bytes.concat(blob.getBytes()); append("\r\n");
  });
  append("--" + boundary + "--\r\n");
  return { bytes: bytes, contentType: "multipart/form-data; boundary=" + boundary };
}

function vcsOwnerGenerateAuditionCandidate_(request) {
  vcsOwnerRequireAudition_();
  const key = vcsOwnerSecret_("openai");
  if (!key) vcsOwnerError_("openai_key_required", "このオーナーのOpenAI APIキーを登録してください。");
  if (!["header", "social"].includes(request.step)) vcsOwnerError_("image_step_invalid", "画像種別が不正です。");
  const role = vcsOwnerRole_(request);
  const settings = vcsOwnerSettings_();
  if (!role.progress.formEditUrl) vcsOwnerError_("form_missing", "先にGoogleフォームを作成してください。");
  if (!settings.logoUrl) vcsOwnerError_("logo_required", "この作品のロゴ画像URLを登録してください。");
  const images = [vcsOwnerReadImage_(role.character.imageUrl), vcsOwnerReadImage_(settings.logoUrl)];
  const title = "「" + role.names.roleName + "」役オーディション";
  const header = request.step === "header";
  const layout = header
    ? "Canvas 1600x544, center-cropped to 1600x400 by removing 72 pixels from top/bottom. Background only in y=0..125 and y=455..543. Character face in x=60..620,y=135..445; complete logo in x=720..1450,y=145..265; title in x=720..1450,y=295..430. Use smaller lettering and multiple lines as needed."
    : "Canvas 1792x1008, 16:9. Show the character prominently. Keep the entire logo, face and every title glyph at least 100 pixels away from all edges. Use smaller lettering and multiple lines as needed.";
  const prompt = "Create polished Japanese voice-actor audition artwork. Reference 1 is the official character; preserve face, hairstyle, outfit, colors and identity. Reference 2 is the official project logo; preserve lettering and proportions. No other characters, logos, watermarks or pseudo-text. Exact title: " + title + ". Project: " + role.names.projectTitle + ". Role: " + role.names.roleDescription + ". Character notes: " + String(role.character.profile || "").slice(0, 700) + ". " + layout + " Correction from previous preflight: " + String(request.feedback || "").slice(0, 900);
  return vcsOwnerWithLease_("image_" + role.requestKey + "_" + request.step, function () {
    const multipart = vcsOwnerMultipart_({ model: settings.imageModel || "gpt-image-2", prompt: prompt, size: header ? "1600x544" : "1792x1008", quality: "medium", output_format: "png" }, images);
    const result = vcsOwnerProviderJson_("https://api.openai.com/v1/images/edits", { method: "post", headers: { Authorization: "Bearer " + key }, contentType: multipart.contentType, payload: multipart.bytes });
    const base64 = result.data?.[0]?.b64_json;
    if (!base64) vcsOwnerError_("image_empty", "画像生成結果を受け取れませんでした。");
    return { ok: true, imageBase64: base64, mimeType: "image/png", width: header ? 1600 : 1792, height: header ? 400 : 1008 };
  });
}

function vcsOwnerAuditImage_(base64, title, header) {
  const settings = vcsOwnerSettings_();
  const prompt = "Inspect this FINAL " + (header ? "1600x400 Google Forms header" : "1792x1008 16:9 artwork") + ". Exact required title: " + title + ". Pass only if every Japanese character exactly matches (spaces/line breaks may differ), every title glyph and complete reference logo are fully visible, title/complete logo have comfortable margins on ALL FOUR edges, entire face is visible, and no unrelated text/watermark exists. Minor hair tips/clothing edge cropping is acceptable. When uncertain fail. Return JSON only: {\"passed\":false,\"titleExact\":false,\"titleFullyVisible\":false,\"safeMargins\":false,\"logoFullyVisible\":false,\"characterVisible\":false,\"noUnrelatedText\":false,\"detectedTitle\":\"\",\"issues\":[],\"correction\":\"\"}";
  const response = vcsOwnerProviderJson_("https://api.openai.com/v1/responses", { method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + vcsOwnerSecret_("openai") }, payload: JSON.stringify({
    model: settings.auditModel || "gpt-5.6-luna", store: false, max_output_tokens: 1000, reasoning: { effort: "low" }, text: { verbosity: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: "data:image/png;base64," + base64, detail: "original" }] }]
  }) });
  const text = (response.output || []).flatMap(function (item) { return item.content || []; }).filter(function (item) { return item.type === "output_text"; }).map(function (item) { return item.text; }).join("");
  let audit;
  try { audit = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch (error) { vcsOwnerError_("image_audit_invalid", "画像監査の結果を読み取れませんでした。"); }
  const exact = String(audit.detectedTitle || "").replace(/\s/g, "") === title.replace(/\s/g, "");
  audit.passed = exact && ["passed", "titleExact", "titleFullyVisible", "safeMargins", "logoFullyVisible", "characterVisible", "noUnrelatedText"].every(function (field) { return audit[field] === true; });
  audit.checkedAt = new Date().toISOString();
  return audit;
}

function vcsOwnerPngSize_(bytes) {
  if (bytes.length < 24 || bytes.slice(0, 8).map(function (b) { return (b + 256) % 256; }).join(",") !== "137,80,78,71,13,10,26,10") vcsOwnerError_("png_invalid", "PNG画像を読み取れませんでした。");
  const integer = function (offset) { return bytes.slice(offset, offset + 4).reduce(function (n, b) { return n * 256 + ((b + 256) % 256); }, 0); };
  return { width: integer(16), height: integer(20) };
}

function vcsOwnerFinishAuditionImage_(request) {
  vcsOwnerRequireAudition_();
  if (!vcsOwnerSecret_("openai")) vcsOwnerError_("openai_key_required", "このオーナーのOpenAI APIキーを登録してください。");
  if (!["header", "social"].includes(request.step)) vcsOwnerError_("image_step_invalid", "画像種別が不正です。");
  const role = vcsOwnerRole_(request);
  const bytes = Utilities.base64Decode(String(request.imageBase64 || ""));
  if (bytes.length > 12 * 1024 * 1024) vcsOwnerError_("image_too_large", "画像が大きすぎます。");
  const size = vcsOwnerPngSize_(bytes);
  const header = request.step === "header";
  if (size.width !== (header ? 1600 : 1792) || size.height !== (header ? 400 : 1008)) vcsOwnerError_("image_size_invalid", "画像の寸法が正しくありません。");
  return vcsOwnerWithLease_("audit_" + role.requestKey + "_" + request.step, function () {
    const audit = vcsOwnerAuditImage_(request.imageBase64, "「" + role.names.roleName + "」役オーディション", header);
    if (!audit.passed) vcsOwnerError_("vcs_audition_image_audit_failed", "画像監査に合格しなかったため、Driveには保存しませんでした。", { audit: audit });
    const google = vcsSaveAuditionImage_(Object.assign({}, role.names, { assetType: request.step, image: { base64: request.imageBase64, mimeType: "image/png" } }));
    return vcsOwnerStoreAudition_(request, google, { passed: true, attempts: Math.max(1, Math.min(3, Number(request.attempt) || 1)), checkedAt: audit.checkedAt });
  });
}

function vcsOwnerUploadImage_(request) {
  const blob = vcsOwnerReadImage_(request.dataUrl);
  const workspace = vcsReadOwnerWorkspace_();
  const settings = workspace.data?.settings || {};
  const root = getRootFolder(settings.recordingDriveFolderUrl || settings.responseDriveFolderUrl);
  const file = getOrCreateFolder(root, "_character_images").createFile(blob.setName(sanitizeName(request.fileName, "character.png")));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600", fileId: file.getId() };
}

// Distribution uses the installer's template, including its question titles/types.
function vcsOwnerExpectedAuditionItems_() {
  return FormApp.openById(vcsOwnerIntegrationValue_("templateFormId")).getItems().filter(function (item) {
    return ![FormApp.ItemType.IMAGE, FormApp.ItemType.PAGE_BREAK, FormApp.ItemType.SECTION_HEADER, FormApp.ItemType.VIDEO].includes(item.getType());
  }).map(function (item) { return { title: item.getType() === FormApp.ItemType.FILE_UPLOAD ? VCS_AUDITION_UPLOAD_TITLE : item.getTitle(), type: item.getType() }; });
}

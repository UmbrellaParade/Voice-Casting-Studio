import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const HOST = "127.0.0.1";
const PORT = 43127;
const PROFILE_DIR = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "VoiceCastStudio", "audition-finisher-profile");
const SOCIAL_IMAGE_DIR = join(PROFILE_DIR, "social-images");
const COPY_IMAGE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "copy-image.ps1");
const execFileAsync = promisify(execFile);
const ALLOWED_ORIGINS = [
  /^https:\/\/voice-cast-studio\.bellbo13\.com$/u,
  /^https:\/\/umbrellaparade\.github\.io$/u,
  /^http:\/\/localhost(?::\d+)?$/u,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/u
];
const EXTRA_ALLOWED_ORIGINS = String(process.env.VCS_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);

let browserContextPromise = null;
let activeFinish = Promise.resolve();
let lastRunState = {
  stage: "idle",
  updatedAt: new Date().toISOString()
};

const updateRunState = (stage, details = {}) => {
  lastRunState = {
    stage,
    ...details,
    updatedAt: new Date().toISOString()
  };
};

const isAllowedOrigin = (origin) => !origin || ALLOWED_ORIGINS.some((pattern) => pattern.test(origin)) || EXTRA_ALLOWED_ORIGINS.includes(origin);

const setCorsHeaders = (response, origin) => {
  if (origin && isAllowedOrigin(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
};

const sendJson = (response, status, payload, origin = "") => {
  setCorsHeaders(response, origin);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const readJson = (request) => new Promise((resolve, reject) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 32_768) reject(new Error("Request is too large."));
  });
  request.on("end", () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error("Request JSON is invalid."));
    }
  });
  request.on("error", reject);
});

const waitForVisible = async (locator, timeout = 5000) => {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
};

const getPageSummary = async (page) => ({
  pageUrl: page.url(),
  pageTitle: await page.title().catch(() => ""),
  pageText: (await page.locator("body").innerText().catch(() => "")).replace(/\s+/gu, " ").trim().slice(0, 500)
});

const findFirstVisible = async (locators, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
};

const findFirstAttached = async (locators, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.count().catch(() => 0)) return locator.first();
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
};

const assertEditorReady = async (page, formEditUrl = "") => {
  const themeLocators = [
    page.getByRole("button", { name: "テーマをカスタマイズ", exact: true }),
    page.getByRole("button", { name: "Customize theme", exact: true }),
    page.locator('button[aria-label*="テーマをカスタマイズ"]'),
    page.locator('button[aria-label*="Customize theme"]')
  ];
  const themeButton = await findFirstVisible(themeLocators, 45000);
  if (themeButton) return themeButton;

  const summary = await getPageSummary(page);
  const needsLogin = page.url().includes("accounts.google.com")
    || /ログイン|Sign in|Choose an account|アカウントを選択/u.test(summary.pageText);
  const needsAccess = page.url().includes("edit_requested=true")
    || /アクセス権が必要|編集権限をリクエスト|You need access|Request (?:edit )?access|権限が必要/u.test(summary.pageText);
  const error = new Error(
    needsLogin
      ? "開いたPC仕上げ用ChromeでGoogleにログインし、ログイン後にもう一度ボタンを押してください。初回だけ必要です。"
      : needsAccess
        ? "PC仕上げ用ChromeのGoogleアカウントには、このフォームを編集する権限がありません。フォーム所有者のアカウントでログインしてください。"
        : `Googleフォームの編集画面を読み込めませんでした（${summary.pageTitle || summary.pageUrl}）。PC仕上げ用Chromeの画面を確認して、もう一度お試しください。`
  );
  if (needsLogin || needsAccess) {
    error.code = "google_login_required";
    const returnUrl = formEditUrl || page.url();
    const chooserUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(returnUrl)}`;
    await page.goto(chooserUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.bringToFront().catch(() => {});
    error.pageSummary = await getPageSummary(page);
  } else {
    error.pageSummary = summary;
  }
  throw error;
};

const getBrowserContext = async () => {
  if (!browserContextPromise) {
    await mkdir(PROFILE_DIR, { recursive: true });
    const launchPromise = chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      viewport: null,
      locale: "ja-JP",
      args: ["--start-maximized"]
    }).then((context) => {
      context.on("close", () => {
        if (browserContextPromise === launchPromise) browserContextPromise = null;
      });
      return context;
    }).catch((error) => {
      if (browserContextPromise === launchPromise) browserContextPromise = null;
      throw error;
    });
    browserContextPromise = launchPromise;
  }
  return browserContextPromise;
};

const assertGoogleUrl = (value, type) => {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !url.pathname.includes("/forms/")) {
    throw new Error(`${type}のGoogleフォームURLが正しくありません。`);
  }
  return url.href;
};

const getGoogleDriveFileId = (value) => {
  const source = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]{10,}$/u.test(source)) return source;
  let url;
  try {
    url = new URL(source);
  } catch {
    return "";
  }
  if (!/(?:^|\.)drive\.google\.com$/u.test(url.hostname)) return "";
  const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/u);
  return String(pathMatch?.[1] || url.searchParams.get("id") || "").trim();
};

const makeSafeImageFileName = (value) => {
  const normalized = String(value || "SNS_image.png")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_")
    .trim()
    .slice(0, 140);
  return /\.(?:png|jpe?g|webp)$/iu.test(normalized) ? normalized : `${normalized || "SNS_image"}.png`;
};

const isSupportedImage = (buffer) => {
  if (!buffer || buffer.length < 12) return false;
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return png || jpeg || webp;
};

const isXLoginPage = (summary = {}) => (
  /Xにログイン|Xへログイン|Sign in to X|Log in to X|電話番号で続ける|Googleで続ける|メールアドレスまたはユーザー名/u.test(String(summary.pageText || ""))
  || /\/login|\/onboarding\/|\/i\/flow\/login|[?&]mode=login/u.test(String(summary.pageUrl || ""))
);

const buildXPostIntentUrl = (postText) => {
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", postText);
  return url.href;
};

const getXPage = async (context) => {
  const existingPage = context.pages().find((page) => {
    try {
      return new URL(page.url()).hostname.endsWith("x.com");
    } catch {
      return false;
    }
  });
  return existingPage || context.newPage();
};

const openXLogin = async () => {
  const context = await getBrowserContext();
  const page = await getXPage(context);
  updateRunState("opening_x_login");
  await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.bringToFront();
  const summary = await getPageSummary(page);
  const composerInput = await findFirstAttached([
    page.locator('input[data-testid="fileInput"]'),
    page.locator('input[type="file"][accept*="image"]')
  ], 5000);
  const loginRequired = !composerInput || isXLoginPage(summary);
  updateRunState(loginRequired ? "x_login_required" : "x_login_ready", summary);
  return {
    ok: true,
    loginRequired,
    pageUrl: page.url()
  };
};

const downloadSocialImage = async (fileId, fileName) => {
  await mkdir(SOCIAL_IMAGE_DIR, { recursive: true });
  const filePath = join(SOCIAL_IMAGE_DIR, makeSafeImageFileName(fileName));
  const downloadUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2400`;
  const response = await fetch(downloadUrl, { redirect: "follow" });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !isSupportedImage(buffer)) {
    throw new Error("DriveからSNS画像を取得できませんでした。画像の共有URLとアクセス権を確認してください。");
  }
  await writeFile(filePath, buffer);
  return filePath;
};

const copyImageToClipboard = async (imagePath) => {
  if (process.platform !== "win32") throw new Error("画像のクリップボードコピーはWindowsでのみ利用できます。");
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      COPY_IMAGE_SCRIPT,
      "-ImagePath",
      imagePath
    ], { timeout: 20000, windowsHide: true });
  } catch {
    throw new Error("SNS画像をクリップボードへコピーできませんでした。もう一度お試しください。");
  }
};

const prepareXPost = async (payload) => {
  const postText = String(payload.postText || "").trim();
  const socialImageFileId = getGoogleDriveFileId(payload.socialImageFileId || payload.socialImageUrl);
  if (!postText) throw new Error("SNS募集文がありません。先に募集文を作成してください。");
  if (!socialImageFileId) throw new Error("生成済みSNS画像のDrive URLが正しくありません。");

  updateRunState("downloading_social_image", { socialImageFileId });
  const imagePath = await downloadSocialImage(socialImageFileId, payload.socialImageFileName);

  let imageCopied = false;
  try {
    updateRunState("copying_social_image", { imagePath });
    await copyImageToClipboard(imagePath);
    imageCopied = true;
  } catch {
    // Direct file attachment below is the primary path. Clipboard copy is only a fallback.
  }

  const context = await getBrowserContext();
  const page = await getXPage(context);
  const xPostUrl = buildXPostIntentUrl(postText);
  updateRunState("opening_x_post", { imagePath, imageCopied });
  await page.goto(xPostUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.bringToFront();

  const summary = await getPageSummary(page);
  const fileInput = await findFirstAttached([
    page.locator('input[data-testid="fileInput"]'),
    page.locator('input[type="file"][accept*="image"]'),
    page.locator('input[type="file"]')
  ], 20000);
  if (!fileInput) {
    const error = new Error(
      isXLoginPage(summary)
        ? "PC仕上げ用ChromeでXへのログインが必要です。開いた画面でログインし、もう一度このボタンを押してください。"
        : "Xの画像添付欄を見つけられませんでした。開いたX画面を確認して、もう一度お試しください。"
    );
    error.code = isXLoginPage(summary) ? "x_login_required" : "x_composer_unavailable";
    error.pageSummary = summary;
    throw error;
  }

  updateRunState("attaching_x_image", { imagePath, imageCopied, pageUrl: page.url() });
  await fileInput.setInputFiles(imagePath);
  const attachment = await findFirstVisible([
    page.locator('[data-testid="attachments"] img').last(),
    page.locator('[data-testid="tweetPhoto"] img').last(),
    page.locator('button[aria-label*="メディアを削除"]').last(),
    page.locator('button[aria-label*="画像を削除"]').last(),
    page.locator('button[aria-label*="Remove media"]').last()
  ], 30000);
  if (!attachment) {
    const error = new Error("SNS画像をXへ添付できませんでした。開いた投稿画面を確認して、もう一度お試しください。");
    error.code = "x_image_attach_failed";
    error.pageSummary = await getPageSummary(page);
    throw error;
  }

  await page.bringToFront();
  updateRunState("x_post_ready", {
    imagePath,
    imageCopied,
    imageAttached: true,
    pageUrl: page.url()
  });
  return {
    ok: true,
    imageCopied,
    imageAttached: true,
    pageUrl: page.url(),
    preparedAt: new Date().toISOString()
  };
};

const findPickerFrame = async (page) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    for (const frame of page.frames()) {
      if (await frame.getByRole("tab", { name: /Google (?:ドライブ|Drive)/u }).count()) return frame;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Google Driveの画像選択画面を開けませんでした。");
};

const findVisibleButtonInFrames = async (page, names) => {
  for (const frame of page.frames()) {
    for (const name of names) {
      const locator = frame.getByRole("button", { name, exact: true }).last();
      if (await waitForVisible(locator, 250)) return locator;
    }
  }
  return null;
};

const restoreUploadFolder = async (page) => {
  const missingFolderText = page.getByText("ファイルのアップロード先のフォルダが見つかりません", { exact: false });
  if (!await waitForVisible(missingFolderText, 4500)) return { restored: false, alreadyReady: true };
  const restoreButton = page.getByRole("button", { name: "復元", exact: true });
  if (!await waitForVisible(restoreButton, 2000)) throw new Error("アップロード先の復元ボタンを見つけられませんでした。");
  await restoreButton.click();
  await missingFolderText.waitFor({ state: "hidden", timeout: 15000 });
  await page.waitForTimeout(1200);
  return { restored: true, alreadyReady: false };
};

const applyHeaderImage = async (page, headerImageUrl, headerFileName) => {
  updateRunState("opening_theme", await getPageSummary(page));
  const existingHeaderButton = await findFirstVisible([
    page.getByRole("button", { name: /ヘッダーの画像を選択|画像を選択|Choose (?:header )?image/u }).last()
  ], 1200);
  if (!existingHeaderButton) {
    const themeButton = await assertEditorReady(page);
    await themeButton.click();
  }

  const chooseHeader = await findFirstVisible([
    page.getByRole("button", { name: /ヘッダーの画像を選択|画像を選択|Choose (?:header )?image/u }).last()
  ], 15000);
  if (!chooseHeader) throw new Error("テーマ設定の中にヘッダー画像の選択ボタンを見つけられませんでした。");
  await chooseHeader.click();

  updateRunState("selecting_header", await getPageSummary(page));
  const picker = await findPickerFrame(page);
  await picker.getByRole("tab", { name: /Google (?:ドライブ|Drive)/u }).click();
  const search = picker.getByRole("combobox", { name: /ドライブ内を検索|Search (?:in )?Drive/u });
  await search.waitFor({ state: "visible", timeout: 10000 });

  const selectResult = async (query) => {
    await search.fill(query);
    await search.press("Enter");
    const exactOption = picker.getByRole("option", { name: headerFileName, exact: true }).last();
    if (await waitForVisible(exactOption, 8000)) {
      await exactOption.click();
      return true;
    }
    const exactText = picker.getByText(headerFileName, { exact: true }).last();
    if (await waitForVisible(exactText, 1500)) {
      await exactText.click();
      return true;
    }
    return false;
  };

  if (!await selectResult(headerImageUrl) && !await selectResult(headerFileName)) {
    throw new Error(`Drive内で「${headerFileName}」を見つけられませんでした。画像フォルダーを確認してください。`);
  }

  const insertButton = await findVisibleButtonInFrames(page, ["挿入", "選択", "Insert", "Select"]);
  if (!insertButton) throw new Error("選択したヘッダー画像をフォームへ挿入できませんでした。");
  await insertButton.click();
  await page.waitForTimeout(1200);

  const doneButton = await findVisibleButtonInFrames(page, ["完了", "選択", "Done", "Select"]);
  if (doneButton) {
    await doneButton.click();
    await page.waitForTimeout(900);
  }

  const pickerStillOpen = await page.getByRole("dialog", { name: "ヘッダーの選択" }).count();
  if (pickerStillOpen && await page.getByRole("dialog", { name: "ヘッダーの選択" }).isVisible().catch(() => false)) {
    throw new Error("ヘッダー画像の選択画面を閉じられませんでした。");
  }
  return true;
};

const verifyResponder = async (context, formResponderUrl) => {
  const page = await context.newPage();
  try {
    await page.goto(formResponderUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2200);
    const bodyText = await page.locator("body").innerText();
    if (bodyText.includes("ファイルのアップロード先のフォルダが見つかりません")) {
      throw new Error("応募画面では、まだアップロード先フォルダーが見つからない状態です。");
    }
    if (!bodyText.includes("こちらから音声データを提出してください。")) {
      throw new Error("応募画面で音声アップロード欄を確認できませんでした。");
    }
    return true;
  } finally {
    await page.close().catch(() => {});
  }
};

const finishAuditionForm = async (payload) => {
  const formEditUrl = assertGoogleUrl(payload.formEditUrl, "編集用");
  const formResponderUrl = assertGoogleUrl(payload.formResponderUrl, "応募用");
  const headerImageUrl = String(payload.headerImageUrl || "").trim();
  const headerFileName = String(payload.headerFileName || "").trim();
  if (!/^https:\/\/drive\.google\.com\/file\/d\//u.test(headerImageUrl)) {
    throw new Error("Driveのヘッダー画像URLがありません。");
  }
  if (!headerFileName.endsWith(".png") || /[\\/:*?"<>|]/u.test(headerFileName)) {
    throw new Error("ヘッダー画像のファイル名が正しくありません。");
  }

  const context = await getBrowserContext();
  const page = context.pages()[0] || await context.newPage();
  updateRunState("opening_form", { formEditUrl });
  await page.bringToFront();
  await page.goto(formEditUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  await assertEditorReady(page, formEditUrl);

  updateRunState("restoring_upload", await getPageSummary(page));
  const upload = await restoreUploadFolder(page);
  await applyHeaderImage(page, headerImageUrl, headerFileName);
  updateRunState("verifying_responder", { formResponderUrl });
  const uploadVerified = await verifyResponder(context, formResponderUrl);
  await page.bringToFront();

  updateRunState("complete", {
    formEditUrl: page.url(),
    headerApplied: true,
    uploadVerified
  });

  return {
    ok: true,
    headerApplied: true,
    uploadVerified,
    uploadFolderRestored: upload.restored,
    formEditUrl: page.url(),
    finishedAt: new Date().toISOString()
  };
};

const server = createServer(async (request, response) => {
  const origin = String(request.headers.origin || "");
  if (!isAllowedOrigin(origin)) {
    sendJson(response, 403, { ok: false, code: "origin_denied", error: "この画面からはPC仕上げを実行できません。" }, origin);
    return;
  }
  if (request.method === "OPTIONS") {
    setCorsHeaders(response, origin);
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, service: "voice-cast-studio-audition-finisher", version: 4, lastRunState }, origin);
    return;
  }
  if (request.method === "GET" && request.url === "/status") {
    sendJson(response, 200, { ok: true, lastRunState }, origin);
    return;
  }
  if (request.method === "POST" && request.url === "/finish") {
    try {
      const payload = await readJson(request);
      const run = activeFinish.then(() => finishAuditionForm(payload));
      activeFinish = run.catch(() => {});
      sendJson(response, 200, await run, origin);
    } catch (error) {
      updateRunState("failed", {
        code: error.code || "audition_finish_failed",
        error: error.message || "PC仕上げを完了できませんでした。",
        ...(error.pageSummary || {})
      });
      sendJson(response, error.code === "google_login_required" ? 409 : 500, {
        ok: false,
        code: error.code || "audition_finish_failed",
        error: error.message || "PC仕上げを完了できませんでした。"
      }, origin);
    }
    return;
  }
  if (request.method === "POST" && request.url === "/prepare-x-post") {
    try {
      const payload = await readJson(request);
      const run = activeFinish.then(() => prepareXPost(payload));
      activeFinish = run.catch(() => {});
      sendJson(response, 200, await run, origin);
    } catch (error) {
      updateRunState("failed", {
        code: error.code || "x_post_prepare_failed",
        error: error.message || "SNS画像付きのX投稿画面を準備できませんでした。",
        ...(error.pageSummary || {})
      });
      sendJson(response, error.code === "x_login_required" ? 409 : 500, {
        ok: false,
        code: error.code || "x_post_prepare_failed",
        error: error.message || "SNS画像付きのX投稿画面を準備できませんでした。"
      }, origin);
    }
    return;
  }
  if (request.method === "POST" && request.url === "/open-x-login") {
    try {
      const run = activeFinish.then(() => openXLogin());
      activeFinish = run.catch(() => {});
      sendJson(response, 200, await run, origin);
    } catch (error) {
      updateRunState("failed", {
        code: error.code || "x_login_open_failed",
        error: error.message || "Xのログイン画面を開けませんでした。",
        ...(error.pageSummary || {})
      });
      sendJson(response, 500, {
        ok: false,
        code: error.code || "x_login_open_failed",
        error: error.message || "Xのログイン画面を開けませんでした。"
      }, origin);
    }
    return;
  }
  sendJson(response, 404, { ok: false, code: "not_found", error: "Not found" }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`Voice Cast Studio audition finisher: http://${HOST}:${PORT}`);
});
